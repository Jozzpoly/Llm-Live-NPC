import { describe, expect, it } from "vitest";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";

const [HEARTH, WORKSHOP, FIELDS] = MIRA_CAUSAL_COMMITMENTS;

describe("five-resident Mira durable execution re-grounding", () => {
  it("retires a stale deferred run and later executes the matter's current durable intent after the focused matter completes", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();

    const acceptedA = slice.acceptPlayerRequest(WORKSHOP!);
    expect(acceptedA.focusClaim).toEqual({ status: "acquired", runId: WORKSHOP!.runId });

    const acceptedB = slice.acceptPlayerRequest(FIELDS!);
    expect(acceptedB.focusClaim).toEqual({
      status: "busy",
      runId: FIELDS!.runId,
      focusedRunId: WORKSHOP!.runId,
    });
    const staleRunId = acceptedB.runId;
    expect(slice.kernel.canRunMutateWorld(staleRunId)).toBe(true);

    const reconsideration = slice.kernel.beginSemanticProposal(FIELDS!.matterId);
    expect(slice.kernel.commitSemanticProposal(reconsideration, {
      semanticCourse: "return to the familiar hearth after the workshop matter",
      semanticIntent: {
        kind: "travel_region",
        goal: "return to the familiar hearth",
        targetRegionId: HEARTH!.targetRegionId,
      },
    })).toMatchObject({
      status: "applied",
      matter: {
        id: FIELDS!.matterId,
        status: "active",
        semanticRevision: 2,
        semanticIntent: {
          kind: "travel_region",
          targetRegionId: HEARTH!.targetRegionId,
        },
      },
    });

    // Semantic truth changes immediately revoke the old concrete execution authority,
    // but must not steal the body from the still-current Workshop matter.
    expect(slice.kernel.canRunMutateWorld(staleRunId)).toBe(false);
    expect(slice.focus.focusedRun()).toBe(WORKSHOP!.runId);
    const continuedA = slice.advanceFocusedMatterOneWorldTick();
    expect(continuedA.status).toBe("running");
    expect(slice.focus.focusedRun()).toBe(WORKSHOP!.runId);

    const completedA = slice.completeFocusedMatter(WORKSHOP!.matterId);
    expect(completedA.matterId).toBe(WORKSHOP!.matterId);

    const regroundedB = slice.kernel.matter(FIELDS!.matterId);
    expect(regroundedB).toMatchObject({
      status: "active",
      semanticIntent: {
        kind: "travel_region",
        goal: "return to the familiar hearth",
        targetRegionId: HEARTH!.targetRegionId,
      },
    });
    expect(regroundedB!.activeRunId).not.toBeNull();
    expect(regroundedB!.activeRunId).not.toBe(staleRunId);
    expect(slice.kernel.runBinding(staleRunId)).toBeNull();
    expect(slice.kernel.canRunMutateWorld(regroundedB!.activeRunId!)).toBe(true);
    expect(slice.focus.focusedRun()).toBe(regroundedB!.activeRunId);
    expect(completedA.arbitration).toEqual({
      status: "acquired_deferred",
      runId: regroundedB!.activeRunId,
    });

    const completedB = slice.completeFocusedMatter(FIELDS!.matterId);
    expect(completedB.runId).toBe(regroundedB!.activeRunId);
    expect(completedB.outcomeEvidence.summary).toContain("hearth");
    expect(slice.kernel.matter(FIELDS!.matterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });

  it("re-grounds two stale deferred matters without inventing a winner when the focused body becomes free", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();

    slice.acceptPlayerRequest(WORKSHOP!);
    const acceptedB = slice.acceptPlayerRequest(FIELDS!);
    const acceptedC = slice.acceptPlayerRequest(HEARTH!);
    expect(slice.focus.focusedRun()).toBe(WORKSHOP!.runId);

    const staleB = acceptedB.runId;
    const staleC = acceptedC.runId;

    const reviseB = slice.kernel.beginSemanticProposal(FIELDS!.matterId);
    expect(slice.kernel.commitSemanticProposal(reviseB, {
      semanticCourse: "return to the familiar hearth after current work",
      semanticIntent: {
        kind: "travel_region",
        goal: "return to the familiar hearth",
        targetRegionId: HEARTH!.targetRegionId,
      },
    }).status).toBe("applied");

    const reviseC = slice.kernel.beginSemanticProposal(HEARTH!.matterId);
    expect(slice.kernel.commitSemanticProposal(reviseC, {
      semanticCourse: "inspect the familiar fields after current work",
      semanticIntent: {
        kind: "travel_region",
        goal: "inspect the familiar fields",
        targetRegionId: FIELDS!.targetRegionId,
      },
    }).status).toBe("applied");

    expect(slice.kernel.canRunMutateWorld(staleB)).toBe(false);
    expect(slice.kernel.canRunMutateWorld(staleC)).toBe(false);
    expect(slice.focus.focusedRun()).toBe(WORKSHOP!.runId);

    const completedA = slice.completeFocusedMatter(WORKSHOP!.matterId);
    const regroundedB = slice.kernel.matter(FIELDS!.matterId)!;
    const regroundedC = slice.kernel.matter(HEARTH!.matterId)!;
    const freshB = regroundedB.activeRunId;
    const freshC = regroundedC.activeRunId;

    expect(freshB).not.toBeNull();
    expect(freshC).not.toBeNull();
    expect(freshB).not.toBe(staleB);
    expect(freshC).not.toBe(staleC);
    expect(freshB).not.toBe(freshC);
    expect(slice.kernel.runBinding(staleB)).toBeNull();
    expect(slice.kernel.runBinding(staleC)).toBeNull();
    expect(slice.kernel.canRunMutateWorld(freshB!)).toBe(true);
    expect(slice.kernel.canRunMutateWorld(freshC!)).toBe(true);

    const candidates = [freshB!, freshC!].sort((a, b) => a.localeCompare(b));
    expect(completedA.arbitration).toEqual({
      status: "choice_required",
      candidateRunIds: candidates,
    });
    expect(slice.focus.focusedRun()).toBeNull();
    expect(slice.arbitrator.deferredRunIds()).toEqual(candidates);
  });
});
