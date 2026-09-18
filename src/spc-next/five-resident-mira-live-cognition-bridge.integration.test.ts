import { describe, expect, it } from "vitest";
import {
  createFiveResidentMiraAutonomousContinuationSlice,
  type FiveResidentMiraAutonomousContinuationSlice,
} from "./five-resident-mira-autonomous-continuation-slice";

const MIRA_ID = "resident.mira";
const MATTER_ID = "matter.mira.post-walk-continuation";
const RUN_ID = "run.mira.post-walk-continuation.travel";
const WORKSHOP_DESTINATION = { x: 1_950, y: 720 } as const;
const MAX_START_STEPS = 1_200;
const MAX_TRAVEL_STEPS = 1_200;

const LIVE_PROPOSAL = {
  version: 1,
  activityDirective: {
    kind: "replace",
    reason: "check workshop continuity after finishing the settlement walk",
    activity: {
      kind: "travel",
      goal: "go to the familiar workshop and continue settlement responsibilities there",
      targetActorId: null,
      targetRegionId: "workshop",
      targetPosition: null,
      text: null,
    },
  },
  beliefs: [],
  concerns: [],
  reviewAfterSeconds: 20,
} as const;

describe("five-resident Mira live cognition bridge", () => {
  it("keeps provider arrival inert until a later World-tick admission, then reuses the exact matter/run/body continuation path", async () => {
    let receivedContext: unknown = null;
    const slice = createFiveResidentMiraAutonomousContinuationSlice({
      cognitionFetcher: async (_input, init) => {
        receivedContext = JSON.parse(String(init?.body));
        return Response.json({ ok: true, proposal: LIVE_PROPOSAL });
      },
    });

    const requested = advanceUntilCognitionRequested(slice);
    const positionAtRequest = miraPosition(slice);
    const legacyAtRequest = miraPublicActivity(slice);

    const arrival = await slice.requestLiveCognition();
    expect(arrival).toMatchObject({
      status: "proposal",
      attemptId: requested.attemptId,
      residentId: MIRA_ID,
    });
    expect(receivedContext).toEqual(requested.context);

    // Wall-clock/network completion has no semantic or body authority.
    expect(slice.phase()).toBe("cognition_pending");
    expect(slice.cognitionAttemptId()).toBe(requested.attemptId);
    expect(slice.kernel.matter(MATTER_ID)).toBeNull();
    expect(slice.kernel.runBinding(RUN_ID)).toBeNull();
    expect(slice.executionFocus.focusedRun()).toBeNull();
    expect(miraPosition(slice)).toEqual(positionAtRequest);
    expect(miraPublicActivity(slice)).toEqual(legacyAtRequest);
    expect(slice.liveCognitionAdmissions()).toEqual([]);

    const pending = slice.advanceOneWorldTick();
    expect(pending).toEqual({
      status: "cognition_pending",
      tick: requested.tick + 1,
      attemptId: requested.attemptId,
    });
    expect(slice.kernel.matter(MATTER_ID)).toBeNull();
    expect(slice.kernel.runBinding(RUN_ID)).toBeNull();
    expect(miraPosition(slice)).toEqual(positionAtRequest);

    const started = slice.admitLiveCognition(arrival);
    expect(started.status).toBe("continuation_started");
    if (started.status !== "continuation_started") throw new Error(`live cognition did not start continuation: ${started.status}`);
    expect(started.tick).toBe(requested.tick + 1);
    expect(started.routeRegionIds).toEqual(["hearth", "workshop"]);
    expect(started.proposal).toMatchObject(LIVE_PROPOSAL);
    expect(slice.cognitionAttemptId()).toBeNull();
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      activeRunId: RUN_ID,
    });
    expect(slice.kernel.canRunMutateWorld(RUN_ID)).toBe(true);
    expect(slice.executionFocus.focusedRun()).toBe(RUN_ID);
    expect(slice.liveCognitionAdmissions()).toEqual([
      expect.objectContaining({
        attemptId: requested.attemptId,
        residentId: MIRA_ID,
        admissionTick: requested.tick + 1,
        arrivalStatus: "proposal",
        outcomeStatus: "applied",
      }),
    ]);

    let step = slice.advanceOneWorldTick();
    let guard = 1;
    let sawPhysicalMotion = false;
    while (step.status === "traveling" && guard < MAX_TRAVEL_STEPS) {
      const actor = miraActor(slice);
      if (Math.hypot(actor.velocity.x, actor.velocity.y) > 0.1) sawPhysicalMotion = true;
      expect(miraPublicActivity(slice)).toEqual(legacyAtRequest);
      step = slice.advanceOneWorldTick();
      guard += 1;
    }

    expect(guard).toBeLessThan(MAX_TRAVEL_STEPS);
    expect(sawPhysicalMotion).toBe(true);
    expect(step.status).toBe("resolved");
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.executionFocus.focusedRun()).toBeNull();
    const final = miraPosition(slice);
    expect(Math.hypot(final.x - WORKSHOP_DESTINATION.x, final.y - WORKSHOP_DESTINATION.y)).toBeLessThanOrEqual(18);
  });

  it("rejects an already-arrived provider answer when addressed player attention becomes newer before explicit admission", async () => {
    const slice = createFiveResidentMiraAutonomousContinuationSlice({
      cognitionFetcher: async () => Response.json({ ok: true, proposal: LIVE_PROPOSAL }),
    });
    const requested = advanceUntilCognitionRequested(slice);
    const legacyAtRequest = miraPublicActivity(slice);
    const positionAtRequest = miraPosition(slice);

    const arrival = await slice.requestLiveCognition();
    expect(arrival.status).toBe("proposal");
    expect(slice.kernel.matter(MATTER_ID)).toBeNull();

    const speech = slice.playerAddressMira("Mira, chwila!");
    const pending = slice.advanceOneWorldTick();
    expect(pending.status).toBe("cognition_pending");
    expect(slice.world.residentDiagnostics(MIRA_ID).recentPercepts.find(
      (percept) => percept.occurrenceId === speech.id,
    )).toMatchObject({
      phenomenon: "speech",
      modality: "hearing",
      addressed: true,
    });

    const stale = slice.admitLiveCognition(arrival);
    expect(stale).toEqual({
      status: "cognition_stale",
      tick: requested.tick + 1,
      reason: "newer_addressed_attention",
    });
    expect(slice.liveCognitionAdmissions()).toEqual([
      expect.objectContaining({
        attemptId: requested.attemptId,
        admissionTick: requested.tick + 1,
        outcomeStatus: "stale",
      }),
    ]);
    expect(slice.kernel.matter(MATTER_ID)).toBeNull();
    expect(slice.kernel.runBinding(RUN_ID)).toBeNull();
    expect(slice.executionFocus.focusedRun()).toBeNull();
    expect(miraPosition(slice)).toEqual(positionAtRequest);
    expect(miraPublicActivity(slice)).toEqual(legacyAtRequest);
    expect(slice.cognitionProposal()).toBeNull();
  });
});

function advanceUntilCognitionRequested(slice: FiveResidentMiraAutonomousContinuationSlice) {
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

function miraActor(slice: FiveResidentMiraAutonomousContinuationSlice) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return actor;
}

function miraPosition(slice: FiveResidentMiraAutonomousContinuationSlice) {
  return { ...miraActor(slice).position };
}

function miraPublicActivity(slice: FiveResidentMiraAutonomousContinuationSlice) {
  const resident = slice.world.publicSnapshot().residents.find((candidate) => candidate.id === MIRA_ID);
  if (!resident) throw new Error("Mira public resident missing");
  return structuredClone(resident.activity);
}
