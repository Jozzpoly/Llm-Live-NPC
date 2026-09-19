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
  it("turns factual task outcome evidence into one explicit activity_completed pressure", () => {
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
    expect(resident.pendingCognitionReasons()).toEqual([
      expect.objectContaining({
        kind: "activity_completed",
        tick: 100,
        salience: 0.65,
        evidenceIds: [OUTCOME.id],
      }),
    ]);

    expect(resident.takeCognitionBatch(129)).toBeNull();
    expect(resident.takeCognitionBatch(130)?.reasons).toEqual([
      expect.objectContaining({
        kind: "activity_completed",
        evidenceIds: [OUTCOME.id],
      }),
    ]);
  });

  it("is edge-triggered by exact outcome evidence id while distinct outcomes remain distinct pressure", () => {
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
    expect(bridge.observe(structuredClone(OUTCOME), 130)).toEqual({
      status: "already_scheduled",
      outcomeEvidenceId: OUTCOME.id,
    });

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

    expect(resident.pendingCognitionReasons()).toHaveLength(2);
    expect(new Set(resident.pendingCognitionReasons().flatMap((reason) => reason.evidenceIds))).toEqual(
      new Set([OUTCOME.id, nextOutcome.id]),
    );
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
