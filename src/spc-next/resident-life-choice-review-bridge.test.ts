import { describe, expect, it, vi } from "vitest";
import { ResidentLifeChoiceReviewBridge } from "./resident-life-choice-review-bridge";

describe("ResidentLifeChoiceReviewBridge", () => {
  it("schedules a near-term review once for one ambiguity edge without postponing it on repeated observation", () => {
    const scheduleAdaptiveReview = vi.fn();
    const bridge = new ResidentLifeChoiceReviewBridge({ scheduleAdaptiveReview });
    const ambiguity = {
      status: "choice_required" as const,
      candidateRunIds: ["run.c", "run.b"],
    };

    expect(bridge.observe(ambiguity, 100)).toEqual({
      status: "scheduled",
      candidateRunIds: ["run.b", "run.c"],
    });
    expect(scheduleAdaptiveReview).toHaveBeenCalledTimes(1);
    expect(scheduleAdaptiveReview).toHaveBeenCalledWith(100, 0.25, 1 / 60);

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
    expect(scheduleAdaptiveReview).toHaveBeenCalledTimes(1);
  });

  it("re-arms after ambiguity clears and schedules again if a choice boundary later reappears", () => {
    const scheduleAdaptiveReview = vi.fn();
    const bridge = new ResidentLifeChoiceReviewBridge({ scheduleAdaptiveReview });

    expect(bridge.observe({
      status: "choice_required",
      candidateRunIds: ["run.a", "run.b"],
    }, 10).status).toBe("scheduled");
    expect(bridge.observe({ status: "idle" }, 11)).toEqual({ status: "not_required" });
    expect(bridge.activeCandidateRunIds()).toEqual([]);

    expect(bridge.observe({
      status: "choice_required",
      candidateRunIds: ["run.b", "run.a"],
    }, 20).status).toBe("scheduled");
    expect(scheduleAdaptiveReview).toHaveBeenCalledTimes(2);
    expect(scheduleAdaptiveReview).toHaveBeenNthCalledWith(2, 20, 0.25, 1 / 60);
  });

  it("treats a changed candidate set as new pressure but never schedules ordinary focused or auto-handoff states", () => {
    const scheduleAdaptiveReview = vi.fn();
    const bridge = new ResidentLifeChoiceReviewBridge({ scheduleAdaptiveReview });

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
    expect(scheduleAdaptiveReview).toHaveBeenCalledTimes(2);
  });
});
