import { describe, expect, it } from "vitest";
import type { CognitionBatch } from "./contracts";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";

const [HEARTH, WORKSHOP, FIELDS] = MIRA_CAUSAL_COMMITMENTS;
const MAX_REVIEW_STEPS = 180;

describe("five-resident Mira causal life choice composition", () => {
  it("carries real speech-born commitments through resident-owned choice cognition and factual selected execution", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(HEARTH!);
    slice.acceptPlayerRequest(WORKSHOP!);
    const acceptedFields = slice.acceptPlayerRequest(FIELDS!);

    const completedHearth = slice.completeFocusedMatter(HEARTH!.matterId);
    expect(completedHearth.arbitration.status).toBe("choice_required");
    expect(completedHearth.choiceReview.status).toBe("scheduled");

    const batch = waitForChoiceReview(slice);
    expect(batch.reasons).toEqual([
      expect.objectContaining({
        kind: "uncertainty",
        evidenceIds: [FIELDS!.runId, WORKSHOP!.runId].sort((a, b) => a.localeCompare(b)),
      }),
      expect.objectContaining({
        kind: "activity_completed",
        evidenceIds: [completedHearth.outcomeEvidence.id],
      }),
    ]);
    expect(batch.reasons.some((reason) => reason.kind === "quiet_review")).toBe(false);

    const lifeAtChoice = captureResidentLifeCognitionView({
      kernel: slice.kernel,
      focus: slice.focus,
      arbitrator: slice.arbitrator,
      matterIds: MIRA_CAUSAL_COMMITMENTS.map((spec) => spec.matterId),
    });
    expect(lifeAtChoice.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [FIELDS!.runId, WORKSHOP!.runId].sort((a, b) => a.localeCompare(b)),
    });

    const choiceOwner = new ResidentLifeChoiceOwner(slice.mira);
    const attempt = choiceOwner.prepare(batch, lifeAtChoice);
    expect(attempt).not.toBeNull();
    if (!attempt) return;
    expect(attempt.candidateMatterIds).toEqual([
      FIELDS!.matterId,
      WORKSHOP!.matterId,
    ].sort((a, b) => a.localeCompare(b)));
    expect(attempt.context.life).toEqual(lifeAtChoice);

    const currentLife = captureResidentLifeCognitionView({
      kernel: slice.kernel,
      focus: slice.focus,
      arbitrator: slice.arbitrator,
      matterIds: MIRA_CAUSAL_COMMITMENTS.map((spec) => spec.matterId),
    });
    const settlement = choiceOwner.settle(attempt, {
      version: 1,
      decision: {
        kind: "focus_matter",
        matterId: WORKSHOP!.matterId,
        reason: "continue with the accepted workshop request before the fields request",
        reviewAfterSeconds: 30,
      },
    }, currentLife);
    expect(settlement).toMatchObject({
      status: "applied",
      decision: { kind: "focus_matter", matterId: WORKSHOP!.matterId },
    });

    expect(slice.choose(WORKSHOP!.runId)).toEqual({ status: "acquired", runId: WORKSHOP!.runId });
    expect(slice.focus.focusedRun()).toBe(WORKSHOP!.runId);
    expect(slice.choiceReviewBridge.activeCandidateRunIds()).toEqual([]);

    const completedWorkshop = slice.completeFocusedMatter(WORKSHOP!.matterId);
    expect(completedWorkshop.arbitration).toEqual({
      status: "acquired_deferred",
      runId: FIELDS!.runId,
    });
    expect(completedWorkshop.choiceReview).toEqual({ status: "not_required" });
    expect(slice.kernel.matter(WORKSHOP!.matterId)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(slice.kernel.matter(FIELDS!.matterId)).toMatchObject({ status: "active", activeRunId: FIELDS!.runId });
    expect(slice.focus.focusedRun()).toBe(FIELDS!.runId);

    // C was grounded while Mira was in Hearth, but the executor owns only a stable
    // destination and recomputes locomotion from the current body position. Moving
    // through Workshop alone must therefore not be treated as stale grounding.
    expect(acceptedFields.routeRegionIds[0]).toBe("hearth");
    expect(slice.privateContext().currentRegionId).toBe("workshop");

    const completedFields = slice.completeFocusedMatter(FIELDS!.matterId);
    expect(completedFields.arbitration).toEqual({ status: "idle" });
    expect(completedFields.choiceReview).toEqual({ status: "not_required" });
    expect(slice.kernel.matter(FIELDS!.matterId)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(slice.focus.focusedRun()).toBeNull();
    expect(slice.privateContext().currentRegionId).toBe("fields");
  });
});

function waitForChoiceReview(slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>): CognitionBatch {
  for (let step = 0; step < MAX_REVIEW_STEPS; step += 1) {
    const batch = slice.mira.takeCognitionBatch(slice.world.tick);
    if (batch) return batch;
    slice.world.step();
  }
  throw new Error("causal multi-matter ambiguity never produced its scheduled resident review");
}
