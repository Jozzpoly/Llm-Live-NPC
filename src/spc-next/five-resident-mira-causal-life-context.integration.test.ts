import { describe, expect, it } from "vitest";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";

const [HEARTH, WORKSHOP, FIELDS] = MIRA_CAUSAL_COMMITMENTS;

describe("Mira causal commitment life-aware admission", () => {
  it("keeps legacy idle explicitly local while each new request sees the exact recovered life that existed before its own admission", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();

    const acceptedA = slice.acceptPlayerRequest(HEARTH!);
    expect(acceptedA.context.contract).toBe("resident_life_cognition_v1");
    expect(acceptedA.context.localActivity).toMatchObject({
      kind: "idle",
      reason: "causal multi-matter specimen idle",
    });
    expect(Object.hasOwn(acceptedA.context, "currentActivity")).toBe(false);
    expect(acceptedA.context.life.body).toEqual({ focusedRunId: null, deferredRunIds: [] });
    expect(acceptedA.context.life.matters).toEqual([]);

    const acceptedB = slice.acceptPlayerRequest(WORKSHOP!);
    expect(acceptedB.focusClaim).toEqual({
      status: "busy",
      runId: WORKSHOP!.runId,
      focusedRunId: HEARTH!.runId,
    });
    expect(acceptedB.context.life.body).toEqual({
      focusedRunId: HEARTH!.runId,
      deferredRunIds: [],
    });
    expect(acceptedB.context.life.matters).toEqual([
      expect.objectContaining({
        id: HEARTH!.matterId,
        status: "active",
        activeRun: expect.objectContaining({
          runId: HEARTH!.runId,
          bodyState: "focused",
          canMutateWorld: true,
        }),
      }),
    ]);
    expect(acceptedB.context.recentPercepts).toContainEqual(expect.objectContaining({
      id: acceptedB.originPerceptId,
      occurrenceId: acceptedB.occurrence.id,
      phenomenon: "speech",
      addressed: true,
    }));

    const acceptedC = slice.acceptPlayerRequest(FIELDS!);
    expect(acceptedC.focusClaim).toEqual({
      status: "busy",
      runId: FIELDS!.runId,
      focusedRunId: HEARTH!.runId,
    });
    expect(acceptedC.context.life.body).toEqual({
      focusedRunId: HEARTH!.runId,
      deferredRunIds: [WORKSHOP!.runId],
    });
    expect(acceptedC.context.life.matters.map((matter) => matter.id)).toEqual([
      HEARTH!.matterId,
      WORKSHOP!.matterId,
    ].sort((a, b) => a.localeCompare(b)));
    expect(acceptedC.context.life.matters).toContainEqual(expect.objectContaining({
      id: WORKSHOP!.matterId,
      activeRun: expect.objectContaining({
        runId: WORKSHOP!.runId,
        bodyState: "deferred",
        canMutateWorld: true,
      }),
    }));

    // The old projection still exists for the local brain/parser substrate, but it is
    // no longer the provider-facing causal-admission truth.
    const ordinaryContext = slice.mira.cognitionContext(acceptedB.batch);
    expect(ordinaryContext.currentActivity).toMatchObject({
      kind: "idle",
      reason: "causal multi-matter specimen idle",
    });
    expect(ordinaryContext.currentActivity.id).not.toBe(HEARTH!.runId);

    const liveNow = captureResidentLifeCognitionView({
      kernel: slice.kernel,
      focus: slice.focus,
      arbitrator: slice.arbitrator,
      matterIds: MIRA_CAUSAL_COMMITMENTS.map((spec) => spec.matterId),
    });
    expect(liveNow.body).toEqual({
      focusedRunId: HEARTH!.runId,
      deferredRunIds: [FIELDS!.runId, WORKSHOP!.runId].sort((a, b) => a.localeCompare(b)),
    });
  });
});
