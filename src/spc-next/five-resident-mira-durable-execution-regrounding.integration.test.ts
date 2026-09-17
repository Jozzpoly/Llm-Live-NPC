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
});
