import { describe, expect, it } from "vitest";
import { createFiveResidentMiraAutonomousContinuationSlice } from "./five-resident-mira-autonomous-continuation-slice";

const MIRA_ID = "resident.mira";
const MATTER_ID = "matter.mira.post-walk-continuation";
const RUN_ID = "run.mira.post-walk-continuation.travel";
const WORKSHOP_DESTINATION = { x: 1_950, y: 720 } as const;
const MAX_START_STEPS = 1_200;
const MAX_TRAVEL_STEPS = 1_200;

describe("five-resident Mira post-authored autonomous continuation", () => {
  it("turns real completion pressure into a private-grounded continuing matter and exact body run without replacing legacy activity", () => {
    const slice = createFiveResidentMiraAutonomousContinuationSlice();

    const requested = advanceUntilCognitionRequested(slice);
    expect(requested.batch.reasons.some((reason) => reason.kind === "activity_completed")).toBe(true);
    expect(requested.context.currentRegionId).toBe("hearth");
    expect(requested.context.knownRegions.some((region) => region.id === "workshop")).toBe(true);
    expect(slice.cognitionAttemptId()).toBe(requested.attemptId);
    expect(slice.kernel.matter(MATTER_ID)).toBeNull();
    expect(slice.kernel.runBinding(RUN_ID)).toBeNull();

    const started = slice.settleDeterministicCognition();
    expect(started.status).toBe("continuation_started");
    if (started.status !== "continuation_started") throw new Error(`continuation settlement failed: ${started.status}`);

    expect(started.routeRegionIds).toEqual(["hearth", "workshop"]);
    expect(started.proposal.activityDirective).toMatchObject({
      kind: "replace",
      activity: {
        kind: "travel",
        targetRegionId: "workshop",
      },
    });
    expect(slice.cognitionAttemptId()).toBeNull();

    const legacyAtStart = miraPublicActivity(slice);
    expect(legacyAtStart).toMatchObject({
      kind: "idle",
      reason: expect.stringContaining("completed activity:mira:initial"),
    });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: RUN_ID,
    });
    expect(slice.kernel.canRunMutateWorld(RUN_ID)).toBe(true);

    const positionAtContinuationStart = miraPosition(slice);
    const scheduled = slice.miraScheduleDiagnostics();
    expect(scheduled.lastRequestTick).toBe(requested.tick);
    expect(scheduled.nextQuietReviewTick).toBeGreaterThan(started.tick);

    let step = slice.advanceOneWorldTick();
    let travelGuard = 1;
    let sawPhysicalMotion = false;
    while (step.status === "traveling" && travelGuard < MAX_TRAVEL_STEPS) {
      // The recovered body path is now authoritative. Legacy activity remains an
      // old projection throughout and must not be rewritten to make the demo move.
      expect(miraPublicActivity(slice)).toEqual(legacyAtStart);
      const actor = miraActor(slice);
      if (Math.hypot(actor.velocity.x, actor.velocity.y) > 0.1) sawPhysicalMotion = true;
      step = slice.advanceOneWorldTick();
      travelGuard += 1;
    }

    expect(travelGuard).toBeLessThan(MAX_TRAVEL_STEPS);
    expect(sawPhysicalMotion).toBe(true);
    expect(step.status).toBe("resolved");
    if (step.status !== "resolved") throw new Error(`continuation did not resolve: ${step.status}`);

    expect(step.local).toMatchObject({
      status: "arrived",
      runId: RUN_ID,
      destination: WORKSHOP_DESTINATION,
    });
    expect(step.reconciliation).toMatchObject({ status: "recorded" });
    expect(slice.reconciliation()).toMatchObject({ status: "recorded" });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "resolved",
      semanticRevision: 1,
      activeRunId: null,
    });
    expect(slice.kernel.canRunMutateWorld(RUN_ID)).toBe(false);
    expect(miraPublicActivity(slice)).toEqual(legacyAtStart);

    const finalPosition = miraPosition(slice);
    expect(finalPosition).not.toEqual(positionAtContinuationStart);
    expect(Math.hypot(
      finalPosition.x - WORKSHOP_DESTINATION.x,
      finalPosition.y - WORKSHOP_DESTINATION.y,
    )).toBeLessThanOrEqual(18);
    expect(slice.world.diagnostics().recentMaterialActions).toEqual([]);
  });

  it("rejects the old post-walk answer when real addressed player speech arrives while cognition is in flight", () => {
    const slice = createFiveResidentMiraAutonomousContinuationSlice();
    const requested = advanceUntilCognitionRequested(slice);
    const legacyAtRequest = miraPublicActivity(slice);
    const positionAtRequest = miraPosition(slice);

    const speech = slice.playerAddressMira("Mira, chwila!");
    expect(speech).toMatchObject({
      kind: "speech",
      actorId: "player.jozz",
      text: "Mira, chwila!",
      addressedActorIds: [MIRA_ID],
    });

    const pending = slice.advanceOneWorldTick();
    expect(pending).toEqual({
      status: "cognition_pending",
      tick: requested.tick + 1,
      attemptId: requested.attemptId,
    });

    const privateSpeech = slice.world.residentDiagnostics(MIRA_ID).recentPercepts.find(
      (percept) => percept.occurrenceId === speech.id,
    );
    expect(privateSpeech).toMatchObject({
      phenomenon: "speech",
      modality: "hearing",
      addressed: true,
      text: "Mira, chwila!",
    });

    const settlement = slice.settleDeterministicCognition();
    expect(settlement).toEqual({
      status: "cognition_stale",
      tick: requested.tick + 1,
      reason: "newer_addressed_attention",
    });
    expect(slice.phase()).toBe("cognition_stale");
    expect(slice.cognitionAttemptId()).toBeNull();

    // The late answer never gains semantic/body authority: no matter, no exact run,
    // no legacy activity replacement, no movement chapter sneaking in after stale.
    expect(slice.kernel.matter(MATTER_ID)).toBeNull();
    expect(slice.kernel.runBinding(RUN_ID)).toBeNull();
    expect(miraPublicActivity(slice)).toEqual(legacyAtRequest);
    expect(miraPosition(slice)).toEqual(positionAtRequest);
    expect(slice.cognitionProposal()).toBeNull();
    expect(slice.world.residentDiagnostics(MIRA_ID).publicState.pendingCognitionReasonCount).toBeGreaterThanOrEqual(2);

    const terminal = slice.advanceOneWorldTick();
    expect(terminal).toEqual(settlement);
    expect(miraPosition(slice)).toEqual(positionAtRequest);
  });
});

function advanceUntilCognitionRequested(
  slice: ReturnType<typeof createFiveResidentMiraAutonomousContinuationSlice>,
) {
  let step = slice.advanceOneWorldTick();
  let guard = 1;
  while (step.status !== "cognition_requested" && guard < MAX_START_STEPS) {
    step = slice.advanceOneWorldTick();
    guard += 1;
  }
  expect(guard).toBeLessThan(MAX_START_STEPS);
  expect(step.status).toBe("cognition_requested");
  if (step.status !== "cognition_requested") throw new Error(`cognition request did not start: ${step.status}`);
  return step;
}

function miraActor(slice: ReturnType<typeof createFiveResidentMiraAutonomousContinuationSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return actor;
}

function miraPosition(slice: ReturnType<typeof createFiveResidentMiraAutonomousContinuationSlice>) {
  const actor = miraActor(slice);
  return { ...actor.position };
}

function miraPublicActivity(slice: ReturnType<typeof createFiveResidentMiraAutonomousContinuationSlice>) {
  const resident = slice.world.publicSnapshot().residents.find((candidate) => candidate.id === MIRA_ID);
  if (!resident) throw new Error("Mira public resident missing");
  return structuredClone(resident.activity);
}
