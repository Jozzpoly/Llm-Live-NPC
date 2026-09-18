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

describe("ResidentLifeChoiceReviewBridge with real cognition scheduler", () => {
  it("turns a new choice boundary into one bounded near-term quiet review without every-tick deadline starvation", () => {
    const resident = new ResidentRuntime(profile);
    const bridge = new ResidentLifeChoiceReviewBridge(resident);
    const initialDeadline = resident.cognitionScheduleDiagnostics().nextQuietReviewTick;
    const ambiguity = {
      status: "choice_required" as const,
      candidateRunIds: ["run.mira.b", "run.mira.c"],
    };

    expect(bridge.observe(ambiguity, 100).status).toBe("scheduled");
    const scheduledDeadline = resident.cognitionScheduleDiagnostics().nextQuietReviewTick;
    expect(scheduledDeadline).toBeGreaterThan(100);
    expect(scheduledDeadline).toBeLessThan(initialDeadline);
    expect(scheduledDeadline).toBeLessThanOrEqual(170);

    for (let tick = 101; tick < scheduledDeadline; tick += 1) {
      expect(bridge.observe(ambiguity, tick).status).toBe("already_scheduled");
      expect(resident.cognitionScheduleDiagnostics().nextQuietReviewTick).toBe(scheduledDeadline);
      expect(resident.takeCognitionBatch(tick)).toBeNull();
    }

    const batch = resident.takeCognitionBatch(scheduledDeadline);
    expect(batch).not.toBeNull();
    expect(batch?.residentId).toBe(profile.id);
    expect(batch?.reasons).toEqual([
      expect.objectContaining({ kind: "quiet_review", tick: scheduledDeadline }),
    ]);
  });
});
