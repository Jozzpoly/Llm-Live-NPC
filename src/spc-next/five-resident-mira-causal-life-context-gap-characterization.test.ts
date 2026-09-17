import { describe, expect, it } from "vitest";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";

const [HEARTH, WORKSHOP] = MIRA_CAUSAL_COMMITMENTS;

describe("Mira causal commitment admission life-context gap characterization", () => {
  it("shows that ordinary cognition still reports legacy idle while recovered A owns the body and B is admitted", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(HEARTH!);

    expect(slice.focus.focusedRun()).toBe(HEARTH!.runId);

    const acceptedB = slice.acceptPlayerRequest(WORKSHOP!);
    expect(acceptedB.focusClaim).toEqual({
      status: "busy",
      runId: WORKSHOP!.runId,
      focusedRunId: HEARTH!.runId,
    });

    // This is the same legacy cognition projection used by ResidentCognitionOwner:
    // it contains the real addressed-speech batch but still calls the local scaffold
    // activity the resident's `currentActivity`.
    const ordinaryContext = slice.mira.cognitionContext(acceptedB.batch);
    expect(ordinaryContext.reasons.some((reason) => reason.kind === "heard_speech")).toBe(true);
    expect(ordinaryContext.currentActivity).toMatchObject({
      kind: "idle",
      reason: "causal multi-matter specimen idle",
    });

    const life = captureResidentLifeCognitionView({
      kernel: slice.kernel,
      focus: slice.focus,
      arbitrator: slice.arbitrator,
      matterIds: [HEARTH!.matterId, WORKSHOP!.matterId],
    });
    expect(life.body).toEqual({
      focusedRunId: HEARTH!.runId,
      deferredRunIds: [WORKSHOP!.runId],
    });
    expect(life.matters).toContainEqual(expect.objectContaining({
      id: HEARTH!.matterId,
      status: "active",
      activeRun: expect.objectContaining({
        runId: HEARTH!.runId,
        bodyState: "focused",
        canMutateWorld: true,
      }),
    }));
    expect(life.matters).toContainEqual(expect.objectContaining({
      id: WORKSHOP!.matterId,
      status: "active",
      activeRun: expect.objectContaining({
        runId: WORKSHOP!.runId,
        bodyState: "deferred",
        canMutateWorld: true,
      }),
    }));

    // Therefore the deterministic causal specimen is mechanically valid, but the
    // old provider-facing context is not truthful enough for live admission during
    // recovered ongoing life. A life-aware owner must compose these two projections.
    expect(ordinaryContext.currentActivity.id).not.toBe(HEARTH!.runId);
  });
});
