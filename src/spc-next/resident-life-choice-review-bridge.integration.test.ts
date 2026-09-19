import { describe, expect, it } from "vitest";
import type { ResidentProfile } from "./contracts";
import { ResidentLifeChoiceReviewBridge } from "./resident-life-choice-review-bridge";
import { ResidentRuntime } from "./resident-runtime";

const profile: ResidentProfile = {
  id: "resident.mira",
  name: "Mira",
  hearingRadius: 420,
  sightRadius: 520,
  maxSpeed: 115,
  brainIntervalTicks: 3,
  memoryLimit: 128,
  traceLimit: 256,
};

describe("ResidentLifeChoiceReviewBridge with explicit R2 semantic pressure", () => {
  it("turns one real multi-run ambiguity into one deduplicated uncertainty reason", () => {
    const resident = new ResidentRuntime(profile);
    const bridge = new ResidentLifeChoiceReviewBridge(resident);
    const ambiguity = {
      status: "choice_required" as const,
      candidateRunIds: ["run.mira.b", "run.mira.c"],
    };

    expect(bridge.observe(ambiguity, 100)).toEqual({
      status: "scheduled",
      candidateRunIds: ["run.mira.b", "run.mira.c"],
    });
    expect(resident.pendingCognitionReasons()).toEqual([
      expect.objectContaining({
        kind: "uncertainty",
        tick: 100,
        salience: 0.8,
        evidenceIds: ["run.mira.b", "run.mira.c"],
      }),
    ]);

    for (let tick = 101; tick < 130; tick += 1) {
      expect(bridge.observe(ambiguity, tick).status).toBe("already_scheduled");
      expect(resident.pendingCognitionReasons()).toHaveLength(1);
      expect(resident.takeCognitionBatch(tick)).toBeNull();
    }

    const batch = resident.takeCognitionBatch(130);
    expect(batch?.residentId).toBe(profile.id);
    expect(batch?.reasons).toEqual([
      expect.objectContaining({
        kind: "uncertainty",
        evidenceIds: ["run.mira.b", "run.mira.c"],
      }),
    ]);
    expect(resident.pendingCognitionReasons()).toEqual([]);
  });

  it("allows the same candidate set to become pressure again only after the ambiguity actually clears", () => {
    const resident = new ResidentRuntime(profile);
    const bridge = new ResidentLifeChoiceReviewBridge(resident);
    const ambiguity = {
      status: "choice_required" as const,
      candidateRunIds: ["run.mira.b", "run.mira.c"],
    };

    expect(bridge.observe(ambiguity, 10).status).toBe("scheduled");
    expect(bridge.observe(ambiguity, 11).status).toBe("already_scheduled");
    expect(bridge.observe({ status: "idle", candidateRunIds: [] }, 12).status).toBe("not_required");
    expect(bridge.observe(ambiguity, 13).status).toBe("scheduled");

    // Same deterministic reason identity is updated rather than duplicated while
    // the first pressure is still pending.
    expect(resident.pendingCognitionReasons()).toHaveLength(1);
    expect(resident.pendingCognitionReasons()[0]?.tick).toBe(13);
  });
});
