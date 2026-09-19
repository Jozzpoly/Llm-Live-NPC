import { describe, expect, it } from "vitest";
import { createDefaultCognitionScheduler } from "./cognition-scheduler";
import type { CognitionReason } from "./contracts";

function reason(id: string, tick: number, salience: number): CognitionReason {
  return {
    id,
    tick,
    kind: "direct_world_change",
    salience,
    summary: id,
    evidenceIds: [],
  };
}

describe("CognitionScheduler anti-storm semantics", () => {
  it("debounces ordinary low-salience novelty instead of immediately requesting cognition", () => {
    const scheduler = createDefaultCognitionScheduler("resident.mira", 0);
    scheduler.note(reason("ordinary", 1, 0.4));

    expect(scheduler.takeReady(1)).toBeNull();
    expect(scheduler.takeReady(29)).toBeNull();
    expect(scheduler.takeReady(31)?.reasons[0]?.id).toBe("ordinary");
  });

  it("still permits an urgent addressed-like reason to burst immediately on first contact", () => {
    const scheduler = createDefaultCognitionScheduler("resident.mira", 0);
    scheduler.note(reason("urgent", 1, 1));
    expect(scheduler.takeReady(1)?.reasons[0]?.id).toBe("urgent");
  });

  it("exposes pending pressure read-only without consuming or dispatching it", () => {
    const scheduler = createDefaultCognitionScheduler("resident.mira", 0);
    scheduler.note({
      ...reason("observed", 10, 0.7),
      evidenceIds: ["percept:local:1"],
    });

    expect(scheduler.pendingSnapshot()).toEqual([
      expect.objectContaining({
        id: "observed",
        evidenceIds: ["percept:local:1"],
      }),
    ]);
    expect(scheduler.pendingSnapshot()).toEqual([
      expect.objectContaining({ id: "observed" }),
    ]);
    expect(scheduler.diagnostics()).toMatchObject({
      pendingCount: 1,
      lastRequestTick: null,
    });
  });

  it("gives five residents deterministic but non-identical initial quiet review deadlines", () => {
    const deadlines = ["mira", "janek", "ida", "oren", "nela"].map((name) =>
      createDefaultCognitionScheduler(`resident.${name}`, 0).diagnostics().nextQuietReviewTick,
    );

    expect(new Set(deadlines).size).toBe(5);
    expect(Math.min(...deadlines)).toBeGreaterThanOrEqual(1_800);
    expect(Math.max(...deadlines)).toBeLessThan(2_250);
  });

  it("lets an accepted adaptive review deadline replace the fallback schedule", () => {
    const scheduler = createDefaultCognitionScheduler("resident.mira", 0);
    scheduler.scheduleQuietReviewAfter(100, 5_400);
    const scheduled = scheduler.diagnostics().nextQuietReviewTick;

    expect(scheduled).toBeGreaterThanOrEqual(5_500);
    expect(scheduled).toBeLessThan(5_530);
    expect(scheduler.takeReady(scheduled - 1)).toBeNull();
    expect(scheduler.takeReady(scheduled)?.reasons[0]?.kind).toBe("quiet_review");
  });
});
