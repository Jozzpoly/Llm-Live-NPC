import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import type { ResidentKernelEvidence } from "./resident-continuity-kernel";
import { ResidentLifeOutcomeReviewBridge } from "./resident-life-outcome-review-bridge";
import { ResidentRuntime } from "./resident-runtime";

const OUTCOME: ResidentKernelEvidence = {
  id: "task-outcome:run.mira.a:100",
  tick: 100,
  kind: "task_outcome",
  summary: "succeeded: physically reached the workshop",
};

describe("ResidentLifeOutcomeReviewBridge", () => {
  it("turns a factual recovered-run outcome into one bounded near-term cognition opportunity", () => {
    const resident = new ResidentRuntime({
      id: "resident.mira",
      name: "Mira",
      ...DEFAULT_RESIDENT_PROFILE,
    });
    const bridge = new ResidentLifeOutcomeReviewBridge(resident);

    const before = resident.cognitionScheduleDiagnostics().nextQuietReviewTick;
    const observed = bridge.observe(OUTCOME, 100);
    const after = resident.cognitionScheduleDiagnostics().nextQuietReviewTick;

    expect(observed).toEqual({
      status: "scheduled",
      outcomeEvidenceId: OUTCOME.id,
    });
    expect(after).toBeLessThan(before);
    // Default resident normal cadence is 60 ticks. The scheduler may add only its
    // deterministic micro-stagger after the bridge's 0.25 s request.
    expect(after).toBeGreaterThanOrEqual(160);
    expect(after).toBeLessThanOrEqual(162);

    let batch = null;
    for (let tick = 100; tick <= 180 && !batch; tick += 1) {
      batch = resident.takeCognitionBatch(tick);
    }
    expect(batch).not.toBeNull();
    expect(batch?.reasons).toEqual([
      expect.objectContaining({
        kind: "quiet_review",
        evidenceIds: [],
      }),
    ]);
  });

  it("is edge-triggered by exact outcome evidence id so repeated observation cannot starve reflection", () => {
    const resident = new ResidentRuntime({
      id: "resident.mira",
      name: "Mira",
      ...DEFAULT_RESIDENT_PROFILE,
    });
    const bridge = new ResidentLifeOutcomeReviewBridge(resident);

    expect(bridge.observe(OUTCOME, 100)).toEqual({
      status: "scheduled",
      outcomeEvidenceId: OUTCOME.id,
    });
    const firstDeadline = resident.cognitionScheduleDiagnostics().nextQuietReviewTick;

    expect(bridge.observe(structuredClone(OUTCOME), 130)).toEqual({
      status: "already_scheduled",
      outcomeEvidenceId: OUTCOME.id,
    });
    expect(resident.cognitionScheduleDiagnostics().nextQuietReviewTick).toBe(firstDeadline);

    const nextOutcome = {
      ...OUTCOME,
      id: "task-outcome:run.mira.b:140",
      tick: 140,
      summary: "succeeded: physically reached the hearth",
    };
    expect(bridge.observe(nextOutcome, 140)).toEqual({
      status: "scheduled",
      outcomeEvidenceId: nextOutcome.id,
    });
    expect(resident.cognitionScheduleDiagnostics().nextQuietReviewTick).toBeGreaterThan(firstDeadline);
  });

  it("bounds remembered outcome ids so lifetime dedupe state cannot grow without limit", () => {
    const resident = new ResidentRuntime({
      id: "resident.mira",
      name: "Mira",
      ...DEFAULT_RESIDENT_PROFILE,
    });
    const bridge = new ResidentLifeOutcomeReviewBridge(resident, {
      rememberedOutcomeLimit: 2,
    });

    const outcomeA = { ...OUTCOME, id: "task-outcome:a", tick: 100 };
    const outcomeB = { ...OUTCOME, id: "task-outcome:b", tick: 101 };
    const outcomeC = { ...OUTCOME, id: "task-outcome:c", tick: 102 };

    expect(bridge.observe(outcomeA, 100).status).toBe("scheduled");
    expect(bridge.observe(outcomeB, 101).status).toBe("scheduled");
    expect(bridge.observe(outcomeC, 102).status).toBe("scheduled");

    // A has left the bounded dedupe window. Re-observing it may schedule again rather
    // than forcing the bridge to retain every outcome id for the resident's lifetime.
    expect(bridge.observe(outcomeA, 103)).toEqual({
      status: "scheduled",
      outcomeEvidenceId: outcomeA.id,
    });
  });

  it("rejects non-outcome kernel evidence instead of manufacturing life reflection pressure", () => {
    const resident = new ResidentRuntime({
      id: "resident.mira",
      name: "Mira",
      ...DEFAULT_RESIDENT_PROFILE,
    });
    const bridge = new ResidentLifeOutcomeReviewBridge(resident);

    expect(() => bridge.observe({
      id: "evidence:not-an-outcome",
      tick: 10,
      kind: "life_context",
      summary: "not a factual run outcome",
    }, 10)).toThrow("life outcome review requires task_outcome evidence");
  });
});
