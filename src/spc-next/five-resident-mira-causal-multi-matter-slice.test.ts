import { describe, expect, it } from "vitest";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";

const [HEARTH, WORKSHOP, FIELDS] = MIRA_CAUSAL_COMMITMENTS;

describe("five-resident Mira causal multi-matter acquisition", () => {
  it("accumulates three commitments from real addressed World speech and reaches genuine B/C arbitration plus cognition pressure only after factual A completion", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();

    const acceptedA = slice.acceptPlayerRequest(HEARTH!);
    expect(acceptedA.occurrence).toMatchObject({
      kind: "speech",
      addressedActorIds: ["resident.mira"],
      text: HEARTH!.requestText,
    });
    expect(acceptedA.focusClaim).toEqual({ status: "acquired", runId: HEARTH!.runId });
    expect(acceptedA.matter).toMatchObject({
      id: HEARTH!.matterId,
      status: "active",
      activeRunId: null,
    });
    expect(slice.kernel.matter(HEARTH!.matterId)).toMatchObject({
      status: "active",
      activeRunId: HEARTH!.runId,
      semanticCourse: HEARTH!.semanticCourse,
    });

    const acceptedB = slice.acceptPlayerRequest(WORKSHOP!);
    expect(acceptedB.focusClaim).toEqual({
      status: "busy",
      runId: WORKSHOP!.runId,
      focusedRunId: HEARTH!.runId,
    });
    const acceptedC = slice.acceptPlayerRequest(FIELDS!);
    expect(acceptedC.focusClaim).toEqual({
      status: "busy",
      runId: FIELDS!.runId,
      focusedRunId: HEARTH!.runId,
    });

    expect(new Set([
      acceptedA.originPerceptId,
      acceptedB.originPerceptId,
      acceptedC.originPerceptId,
    ]).size).toBe(3);
    for (const accepted of [acceptedA, acceptedB, acceptedC]) {
      expect(accepted.batch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(true);
      expect(accepted.matter.originEvidenceId).toContain("evidence:mira:accepted-request:");
      const origin = slice.kernel.originEvidence(accepted.matter.id);
      expect(origin).toMatchObject({ kind: "accepted_cognition_commitment" });
      expect(origin?.summary).toContain("origin occurrence occurrence:");
    }

    const privateContext = slice.privateContext();
    for (const spec of MIRA_CAUSAL_COMMITMENTS) {
      expect(privateContext.concerns).toContainEqual(expect.objectContaining({
        id: spec.concernId,
        status: "open",
      }));
      expect(slice.kernel.matter(spec.matterId)).toMatchObject({ status: "active", activeRunId: spec.runId });
      expect(slice.kernel.canRunMutateWorld(spec.runId)).toBe(true);
    }
    expect(slice.focus.focusedRun()).toBe(HEARTH!.runId);
    expect(slice.arbitrator.deferredRunIds()).toEqual([
      FIELDS!.runId,
      WORKSHOP!.runId,
    ].sort((a, b) => a.localeCompare(b)));

    // Before factual A completion there is no policy question: A still owns the body.
    expect(slice.arbitrator.reconcile()).toEqual({
      status: "focused",
      runId: HEARTH!.runId,
      deferredRunIds: [FIELDS!.runId, WORKSHOP!.runId].sort((a, b) => a.localeCompare(b)),
    });

    const reviewBeforeChoice = slice.mira.cognitionScheduleDiagnostics().nextQuietReviewTick;
    const completedA = slice.completeFocusedMatter(HEARTH!.matterId);
    expect(completedA.arbitration).toEqual({
      status: "choice_required",
      candidateRunIds: [FIELDS!.runId, WORKSHOP!.runId].sort((a, b) => a.localeCompare(b)),
    });
    expect(completedA.choiceReview).toEqual({
      status: "scheduled",
      candidateRunIds: [FIELDS!.runId, WORKSHOP!.runId].sort((a, b) => a.localeCompare(b)),
    });
    expect(slice.mira.cognitionScheduleDiagnostics().nextQuietReviewTick).toBeLessThan(reviewBeforeChoice);
    expect(slice.kernel.matter(HEARTH!.matterId)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(slice.kernel.matter(WORKSHOP!.matterId)).toMatchObject({ status: "active", activeRunId: WORKSHOP!.runId });
    expect(slice.kernel.matter(FIELDS!.matterId)).toMatchObject({ status: "active", activeRunId: FIELDS!.runId });
    expect(slice.focus.focusedRun()).toBeNull();

    // No life-choice policy is smuggled into this origin specimen. The exact next
    // boundary is deliberately the existing higher-cognition choice seam, but that
    // seam now has resident-owned scheduler pressure rather than test-owned polling.
    expect(slice.arbitrator.deferredRunIds()).toEqual([
      FIELDS!.runId,
      WORKSHOP!.runId,
    ].sort((a, b) => a.localeCompare(b)));
  });
});
