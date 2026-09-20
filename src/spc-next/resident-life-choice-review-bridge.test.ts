import { describe, expect, it, vi } from "vitest";
import type { CognitionReason } from "./contracts";
import { ResidentLifeChoiceReviewBridge } from "./resident-life-choice-review-bridge";

function createHarness() {
  const promoted: CognitionReason[] = [];
  const promoteSemanticPressure = vi.fn((reason: CognitionReason) => {
    promoted.push(structuredClone(reason));
  });
  const invalidateSemanticPressure = vi.fn(() => true);
  const bridge = new ResidentLifeChoiceReviewBridge({
    profile: {
      id: "resident.mira",
      name: "Mira",
      hearingRadius: 420,
      sightRadius: 520,
      maxSpeed: 115,
      brainIntervalTicks: 3,
      memoryLimit: 128,
      traceLimit: 256,
    },
    promoteSemanticPressure,
    invalidateSemanticPressure,
  });
  return { bridge, promoted, promoteSemanticPressure, invalidateSemanticPressure };
}

describe("ResidentLifeChoiceReviewBridge", () => {
  it("promotes one explicit ambiguity pressure without duplicating repeated observation", () => {
    const { bridge, promoted, promoteSemanticPressure } = createHarness();
    const ambiguity = {
      status: "choice_required" as const,
      candidateRunIds: ["run.c", "run.b"],
    };

    expect(bridge.observe(ambiguity, 100)).toEqual({
      status: "scheduled",
      candidateRunIds: ["run.b", "run.c"],
    });
    expect(promoteSemanticPressure).toHaveBeenCalledTimes(1);
    expect(promoted[0]).toMatchObject({
      tick: 100,
      kind: "uncertainty",
      salience: 0.8,
      evidenceIds: ["run.b", "run.c"],
    });

    expect(bridge.observe(ambiguity, 101)).toEqual({
      status: "already_scheduled",
      candidateRunIds: ["run.b", "run.c"],
    });
    expect(bridge.observe({
      status: "choice_required",
      candidateRunIds: ["run.b", "run.c"],
    }, 160)).toEqual({
      status: "already_scheduled",
      candidateRunIds: ["run.b", "run.c"],
    });
    expect(promoteSemanticPressure).toHaveBeenCalledTimes(1);
  });

  it("re-arms only after ambiguity clears and promotes again if the choice later reappears", () => {
    const { bridge, promoteSemanticPressure, invalidateSemanticPressure } = createHarness();

    expect(bridge.observe({
      status: "choice_required",
      candidateRunIds: ["run.a", "run.b"],
    }, 10).status).toBe("scheduled");
    expect(bridge.observe({ status: "idle" }, 11)).toEqual({ status: "not_required" });
    expect(invalidateSemanticPressure).toHaveBeenCalledTimes(1);
    expect(invalidateSemanticPressure).toHaveBeenCalledWith(
      promotedReasonId(promoteSemanticPressure),
      11,
      "resident execution no longer requires a multi-matter semantic choice",
    );
    expect(bridge.activeCandidateRunIds()).toEqual([]);

    expect(bridge.observe({
      status: "choice_required",
      candidateRunIds: ["run.b", "run.a"],
    }, 20).status).toBe("scheduled");
    expect(promoteSemanticPressure).toHaveBeenCalledTimes(2);
  });

  it("treats a changed candidate set as new pressure but ignores focused and auto-handoff states", () => {
    const { bridge, promoteSemanticPressure, invalidateSemanticPressure } = createHarness();

    expect(bridge.observe({
      status: "choice_required",
      candidateRunIds: ["run.a", "run.b"],
    }, 30).status).toBe("scheduled");
    expect(bridge.observe({
      status: "choice_required",
      candidateRunIds: ["run.a", "run.c"],
    }, 31)).toEqual({
      status: "scheduled",
      candidateRunIds: ["run.a", "run.c"],
    });

    expect(bridge.observe({
      status: "focused",
      runId: "run.a",
      deferredRunIds: ["run.c"],
    }, 32)).toEqual({ status: "not_required" });
    expect(bridge.observe({ status: "acquired_deferred", runId: "run.c" }, 33)).toEqual({ status: "not_required" });
    expect(promoteSemanticPressure).toHaveBeenCalledTimes(2);
    expect(invalidateSemanticPressure).toHaveBeenCalledTimes(1);
  });
});

function promotedReasonId(promoteSemanticPressure: ReturnType<typeof vi.fn>): string {
  const reason = promoteSemanticPressure.mock.calls[0]?.[0] as CognitionReason | undefined;
  if (!reason) throw new Error("choice bridge never promoted a reason");
  return reason.id;
}
