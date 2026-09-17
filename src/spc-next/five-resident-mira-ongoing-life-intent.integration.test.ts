import { describe, expect, it } from "vitest";
import type { ResidentCognitionProposal } from "./cognition-contract";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
  type AcceptedCausalCommitment,
} from "./five-resident-mira-causal-multi-matter-slice";
import type { ResidentLifeIntentAttempt } from "./resident-life-intent-owner";

const WORKSHOP = MIRA_CAUSAL_COMMITMENTS[1]!;
const FIELDS = MIRA_CAUSAL_COMMITMENTS[2]!;
const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_TO_COGNITION = 90;
const LATENCY_TICKS = 20;

type PreparedLifeIntent = {
  batch: ResidentLifeIntentAttempt["batch"];
  attempt: ResidentLifeIntentAttempt;
};

describe("Mira ongoing life intent cognition", () => {
  it("keeps factual A execution moving while B cognition is prepared and waits, then admits B without stealing A body authority", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(WORKSHOP);

    for (let step = 0; step < 6; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
    }
    const beforeSpeech = miraPosition(slice);

    const speech = slice.world.speak(PLAYER_ID, FIELDS.requestText, REQUEST_RADIUS, [MIRA_ID]);
    expect(speech).toMatchObject({
      kind: "speech",
      actorId: PLAYER_ID,
      addressedActorIds: [MIRA_ID],
      text: FIELDS.requestText,
    });

    const ongoing = slice as unknown as {
      takeReadyLifeIntentAttempt?: () => PreparedLifeIntent | null;
      settlePreparedPlayerRequest?: (
        prepared: PreparedLifeIntent,
        occurrence: typeof speech,
        spec: typeof FIELDS,
        rawProposal: unknown,
      ) => AcceptedCausalCommitment;
    };
    expect(typeof ongoing.takeReadyLifeIntentAttempt).toBe("function");
    expect(typeof ongoing.settlePreparedPlayerRequest).toBe("function");
    if (!ongoing.takeReadyLifeIntentAttempt || !ongoing.settlePreparedPlayerRequest) return;

    let prepared: PreparedLifeIntent | null = null;
    for (let step = 0; step < MAX_TO_COGNITION && !prepared; step += 1) {
      const execution = slice.advanceFocusedMatterOneWorldTick();
      expect(execution).toMatchObject({ status: "running", runId: WORKSHOP.runId });
      prepared = ongoing.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;

    expect(prepared.batch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(true);
    expect(prepared.attempt.context.contract).toBe("resident_life_cognition_v1");
    expect(prepared.attempt.context.localActivity).toMatchObject({
      kind: "idle",
      reason: "causal multi-matter specimen idle",
    });
    expect(prepared.attempt.context.life.body).toEqual({
      focusedRunId: WORKSHOP.runId,
      deferredRunIds: [],
    });
    expect(prepared.attempt.context.recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: speech.id,
      phenomenon: "speech",
      addressed: true,
    }));

    const beforeLatency = miraPosition(slice);
    for (let step = 0; step < LATENCY_TICKS; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);
      expect(slice.kernel.canRunMutateWorld(WORKSHOP.runId)).toBe(true);
    }
    const afterLatency = miraPosition(slice);
    expect(afterLatency).not.toEqual(beforeLatency);
    expect(distance(beforeLatency, afterLatency)).toBeGreaterThan(0.1);
    expect(distance(beforeSpeech, afterLatency)).toBeGreaterThan(0.1);

    const acceptedB = ongoing.settlePreparedPlayerRequest(
      prepared,
      speech,
      FIELDS,
      commitmentProposal(FIELDS),
    );
    expect(acceptedB.focusClaim).toEqual({
      status: "busy",
      runId: FIELDS.runId,
      focusedRunId: WORKSHOP.runId,
    });
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);
    expect(slice.kernel.matter(WORKSHOP.matterId)).toMatchObject({
      status: "active",
      activeRunId: WORKSHOP.runId,
    });
    expect(slice.kernel.matter(FIELDS.matterId)).toMatchObject({
      status: "active",
      activeRunId: FIELDS.runId,
    });
    expect(slice.arbitrator.deferredRunIds()).toEqual([FIELDS.runId]);

    const completedA = slice.completeFocusedMatter(WORKSHOP.matterId);
    expect(completedA.arbitration).toEqual({
      status: "acquired_deferred",
      runId: FIELDS.runId,
    });
    expect(slice.focus.focusedRun()).toBe(FIELDS.runId);
  });
});

function commitmentProposal(spec: typeof FIELDS): ResidentCognitionProposal {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: `accept the addressed ${spec.key} request as a continuing commitment`,
      activity: {
        kind: "travel",
        goal: spec.semanticCourse,
        targetActorId: null,
        targetRegionId: spec.targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}

function miraPosition(slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return { ...actor.position };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
