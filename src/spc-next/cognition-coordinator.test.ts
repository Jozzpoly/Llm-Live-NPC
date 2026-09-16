import { describe, expect, it } from "vitest";
import type { CognitionBatch } from "./contracts";
import { CognitionCoordinator, MAX_FAIR_QUEUE_WAIT_TICKS } from "./cognition-coordinator";

function batch(residentId: string, tick: number, salience: number, suffix = "a"): CognitionBatch {
  return {
    residentId,
    requestedAtTick: tick,
    reasons: [{
      id: `${residentId}:${suffix}`,
      tick,
      kind: "uncertainty",
      salience,
      summary: `${residentId} reason ${suffix}`,
      evidenceIds: [],
    }],
  };
}

describe("multi-resident cognition coordinator", () => {
  it("can admit all five SPCs concurrently instead of serializing the living world", () => {
    const coordinator = new CognitionCoordinator(5);
    for (let i = 1; i <= 5; i += 1) coordinator.enqueue(batch(`resident.${i}`, 100, 0.8));

    const started = coordinator.startReady(100);
    expect(started).toHaveLength(5);
    expect(new Set(started.map((dispatch) => dispatch.residentId)).size).toBe(5);
    expect(coordinator.state().queuedResidents).toEqual([]);
  });

  it("keeps one in-flight request per resident while preserving a follow-up batch", () => {
    const coordinator = new CognitionCoordinator(2);
    coordinator.enqueue(batch("resident.mira", 10, 0.9, "first"));
    const first = coordinator.startReady(10)[0]!;

    coordinator.enqueue(batch("resident.mira", 11, 1, "follow-up"));
    expect(coordinator.startReady(11)).toEqual([]);
    expect(coordinator.state().queuedResidents).toEqual(["resident.mira"]);

    coordinator.settle(first.id);
    const next = coordinator.startReady(12);
    expect(next).toHaveLength(1);
    expect(next[0]!.batch.reasons[0]!.id).toBe("resident.mira:follow-up");
  });

  it("prioritizes fresh urgent work before a young quiet request", () => {
    const coordinator = new CognitionCoordinator(1);
    coordinator.enqueue(batch("resident.quiet", 90, 0.3));
    coordinator.enqueue(batch("resident.urgent", 100, 0.95));

    const urgent = coordinator.startReady(100)[0]!;
    expect(urgent.residentId).toBe("resident.urgent");
    coordinator.settle(urgent.id);

    expect(coordinator.startReady(101)[0]!.residentId).toBe("resident.quiet");
  });

  it("cannot starve an old quiet resident behind an endless stream of fresh urgent residents", () => {
    const coordinator = new CognitionCoordinator(1);
    coordinator.enqueue(batch("resident.quiet", 0, 0.2));

    for (let tick = 1; tick < MAX_FAIR_QUEUE_WAIT_TICKS; tick += 100) {
      coordinator.enqueue(batch(`resident.urgent.${tick}`, tick, 1));
      const dispatch = coordinator.startReady(tick)[0]!;
      expect(dispatch.residentId).toContain("resident.urgent");
      coordinator.settle(dispatch.id);
    }

    coordinator.enqueue(batch("resident.urgent.deadline", MAX_FAIR_QUEUE_WAIT_TICKS, 1));
    const fair = coordinator.startReady(MAX_FAIR_QUEUE_WAIT_TICKS)[0]!;
    expect(fair.residentId).toBe("resident.quiet");
  });

  it("coalesces queued reasons without duplicating causal evidence", () => {
    const coordinator = new CognitionCoordinator(1);
    coordinator.enqueue(batch("resident.mira", 20, 0.4, "same"));
    coordinator.enqueue(batch("resident.mira", 21, 0.9, "same"));
    coordinator.enqueue(batch("resident.mira", 22, 0.7, "other"));

    const dispatch = coordinator.startReady(22)[0]!;
    expect(dispatch.batch.reasons).toHaveLength(2);
    expect(dispatch.batch.reasons[0]!.id).toBe("resident.mira:same");
    expect(dispatch.batch.reasons[0]!.salience).toBe(0.9);
  });
});
