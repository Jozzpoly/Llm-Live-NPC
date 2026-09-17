import { describe, expect, it } from "vitest";
import type { ResidentPercept, ResidentProfile } from "./contracts";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import type { CognitionFetch } from "./resident-cognition-live-host";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentLiveHost } from "./resident-life-intent-live-host";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentRuntime } from "./resident-runtime";

const profile: ResidentProfile = {
  id: "resident.mira",
  name: "Mira",
  hearingRadius: 420,
  sightRadius: 520,
  maxSpeed: 115,
  brainIntervalTicks: 3,
  memoryLimit: 128,
  traceLimit: 256,
};

const life: ResidentLifeCognitionView = {
  version: 1,
  matters: [{
    id: "matter.mira.workshop",
    status: "active",
    semanticRevision: 1,
    semanticCourse: "finish workshop",
    suspendedByMatterId: null,
    originEvidence: null,
    semanticEvidence: null,
    lastOutcomeEvidence: null,
    activeRun: {
      runId: "run.mira.workshop",
      taskId: "task.mira.workshop",
      semanticRevision: 1,
      canMutateWorld: true,
      bodyState: "focused",
    },
  }],
  body: { focusedRunId: "run.mira.workshop", deferredRunIds: [] },
};

const commitment: ResidentLifeIntentProposal = {
  version: 1,
  commitmentDecision: {
    kind: "accept",
    reason: "accept the fields request for later without taking Workshop body authority",
    intent: {
      kind: "travel",
      goal: "visit the familiar fields later",
      targetActorId: null,
      targetRegionId: "fields",
      targetPosition: null,
      text: null,
    },
  },
  beliefs: [],
  concerns: [],
  reviewAfterSeconds: 30,
};

function speech(): ResidentPercept {
  return {
    id: "percept:mira:fields-request",
    occurrenceId: "occurrence:mira:fields-request",
    tick: 1,
    phenomenon: "speech",
    modality: "hearing",
    actorId: null,
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "addressed fields request",
    text: "Mira, sprawdzisz później pola?",
    addressed: true,
  };
}

function setup() {
  const resident = new ResidentRuntime(profile);
  resident.enterRegion({ id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 }, 0, true);
  resident.familiarizeRegion({ id: "fields", label: "Fields", minX: 2_700, minY: 0, maxX: 4_000, maxY: 1_500 }, 0);
  resident.setActivity({
    id: "activity:mira:legacy-idle",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "legacy projection remains idle",
  }, 0);
  resident.ingestPercepts([speech()]);
  const batch = resident.takeCognitionBatch(1);
  if (!batch) throw new Error("expected cognition batch");
  const owner = new ResidentLifeIntentOwner(resident);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("expected life intent attempt");
  const fetcher: CognitionFetch = async () => new Response(JSON.stringify({ ok: true, proposal: commitment }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  return { resident, owner, attempt, host: new ResidentLifeIntentLiveHost(owner, "/life-intent", fetcher) };
}

describe("ResidentLifeIntentLiveHost commitment admission", () => {
  it("keeps a commitment arrival inert, then consumes the exact arrival once without changing existing body focus", async () => {
    const { resident, owner, attempt, host } = setup();
    const arrival = await host.request(attempt);

    expect(arrival.status).toBe("proposal");
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(host.pendingArrivals()).toBe(1);
    expect(life.body.focusedRunId).toBe("run.mira.workshop");

    const admitted = host.admitCommitment(
      arrival,
      2,
      life,
      (proposal: ResidentLifeIntentProposal, context: ResidentLifeCognitionContext) => {
        expect(proposal.commitmentDecision).toMatchObject({
          kind: "accept",
          intent: { kind: "travel", targetRegionId: "fields" },
        });
        expect(context.life.body.focusedRunId).toBe("run.mira.workshop");
        return { status: "accepted", intent: { targetRegionId: "fields" as const } };
      },
    );

    expect(admitted).toMatchObject({
      status: "applied",
      admissionTick: 2,
      settlement: {
        status: "applied",
        proposal: { commitmentDecision: { kind: "accept" } },
        intent: { targetRegionId: "fields" },
      },
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(host.pendingArrivals()).toBe(0);
    expect(life.body.focusedRunId).toBe("run.mira.workshop");
    expect(resident.publicState().activity.kind).toBe("idle");

    expect(host.admitCommitment(
      arrival,
      3,
      life,
      (_proposal: ResidentLifeIntentProposal, _context: ResidentLifeCognitionContext) => {
        throw new Error("already admitted arrival must never reach callback");
      },
    )).toEqual({
      status: "arrival_rejected",
      reason: "already_admitted",
    });
  });
});
