import { describe, expect, it } from "vitest";
import { parseResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  createR4DenseWorkshopSlice,
  R4_PRIMARY_MATTER_ID,
  R4_PRIMARY_OBJECT_ID,
} from "./r4-dense-workshop-slice";
import { materialAbsencePressureReasonId } from "./resident-material-matter-relevance-bridge";

describe("R6 endogenous post-terminal material-future generation gap", () => {
  it("lets World/private reacquisition happen after a factual blocked episode is terminal, but produces no fresh resident future", () => {
    const slice = createR4DenseWorkshopSlice();
    slice.relocatePrimaryHidden();

    let step = slice.advanceOneWorldTick();
    let guard = 0;
    while (step.status !== "primary_blocked" && guard < 1_000) {
      step = slice.advanceOneWorldTick();
      guard += 1;
    }
    expect(step.status).toBe("primary_blocked");

    const blocked = slice.kernel.lastOutcomeEvidence(R4_PRIMARY_MATTER_ID);
    expect(blocked).toMatchObject({
      kind: "task_outcome",
      summary: expect.stringContaining("blocked:"),
    });
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toMatchObject({
      status: "active",
      activeRunId: null,
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: R4_PRIMARY_OBJECT_ID,
      },
    });

    // This experiment deliberately closes the old episode before later reacquisition.
    // The kernel transition is authoritative and the old checked-absence pressure is
    // explicitly settled so the next observation cannot piggy-back on stale pressure.
    slice.kernel.resolveMatter(R4_PRIMARY_MATTER_ID);
    slice.resident.invalidateSemanticPressure(
      materialAbsencePressureReasonId("resident.janek", R4_PRIMARY_OBJECT_ID),
      slice.world.tick,
      "the earlier bounded material attempt is terminal",
    );
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.resident.pendingCognitionReasons()).toEqual([]);

    guard = 0;
    while (step.status !== "secondary_resolved" && guard < 2_100) {
      step = slice.advanceOneWorldTick();
      guard += 1;
    }
    expect(step.status).toBe("secondary_resolved");

    const privateBeforeReveal = slice.knowledge.observation(R4_PRIMARY_OBJECT_ID);
    expect(privateBeforeReveal).toMatchObject({ currentlyVisible: false });

    slice.revealPrimaryNearby();
    expect(slice.knowledge.observation(R4_PRIMARY_OBJECT_ID)).toEqual(privateBeforeReveal);

    // The next normal local-life tick acquires the changed World truth.
    step = slice.advanceOneWorldTick();
    expect(slice.knowledge.observation(R4_PRIMARY_OBJECT_ID)).toMatchObject({
      currentlyVisible: true,
    });

    // Correct anti-reopen behavior is preserved...
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    // ...but there is currently no second seam that turns the new factual
    // opportunity into a fresh semantic pressure/future.
    expect(slice.resident.pendingCognitionReasons()).toEqual([]);
    expect(slice.focus.focusedRun()).toBeNull();
    expect(slice.arbitrator.deferredRunIds()).toEqual([]);
    expect(step.status).not.toBe("primary_reactivated");
  });

  it("cannot represent a fresh material acquisition as a native life commitment even when the object identity is explicit", () => {
    const slice = createR4DenseWorkshopSlice();
    const parserContext = slice.resident.cognitionContext({
      residentId: "resident.janek",
      requestedAtTick: slice.world.tick,
      reasons: [{
        id: "reason:janek:r6:reacquired-opportunity",
        tick: slice.world.tick,
        kind: "direct_world_change",
        salience: 0.8,
        summary: "The familiar material object is privately visible again after the earlier terminal attempt.",
        evidenceIds: ["evidence:janek:r6:reacquired-opportunity"],
      }],
    });

    expect(parseResidentLifeIntentProposal({
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "the reacquired familiar object is worth another bounded attempt",
        intent: {
          kind: "acquire_material_object",
          goal: "try the familiar material object again",
          objectId: R4_PRIMARY_OBJECT_ID,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    }, parserContext)).toBeNull();
  });
});
