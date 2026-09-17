import { describe, expect, it } from "vitest";
import type { ResidentCognitionProposal } from "./cognition-contract";
import type { ResidentPercept, ResidentProfile } from "./contracts";
import type { CognitionFetch } from "./resident-cognition-live-host";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import {
  ResidentLifeIntentLiveHost,
  type ResidentLifeIntentLiveArrival,
} from "./resident-life-intent-live-host";
import {
  ResidentLifeIntentOwner,
  type ResidentLifeIntentAdmission,
} from "./resident-life-intent-owner";
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

function setup() {
  const resident = new ResidentRuntime(profile);
  resident.enterRegion({ id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 }, 0, true);
  resident.familiarizeRegion({ id: "fields", label: "Fields", minX: 900, minY: 1_500, maxX: 3_500, maxY: 3_500 }, 0);
  resident.setActivity({
    id: "activity:mira:local-idle",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "legacy-local idle while recovered A owns the body",
  }, 0);
  resident.ingestPercepts([addressedSpeech("initial", 1)]);
  const batch = resident.takeCognitionBatch(1)!;
  const owner = new ResidentLifeIntentOwner(resident);
  const life = lifeView();
  const attempt = owner.prepare(batch, life)!;
  return { resident, batch, owner, life, attempt };
}

function addressedSpeech(id: string, tick: number): ResidentPercept {
  return {
    id: `percept:${id}`,
    occurrenceId: `occurrence:${id}`,
    tick,
    phenomenon: "speech",
    modality: "hearing",
    actorId: null,
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "addressed fields request",
    text: "Mira, sprawdzisz pola?",
    addressed: true,
  };
}

function lifeView(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [{
      id: "matter.mira.a",
      status: "active",
      semanticRevision: 1,
      semanticCourse: "finish A",
      suspendedByMatterId: null,
      originEvidence: null,
      semanticEvidence: null,
      lastOutcomeEvidence: null,
      activeRun: {
        runId: "run.mira.a",
        taskId: "task.mira.a",
        semanticRevision: 1,
        canMutateWorld: true,
        bodyState: "focused",
      },
    }],
    body: { focusedRunId: "run.mira.a", deferredRunIds: [] },
  };
}

function proposal(): ResidentCognitionProposal {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: "accept the addressed request as a continuing semantic intent",
      activity: {
        kind: "travel",
        goal: "check the familiar fields",
        targetActorId: null,
        targetRegionId: "fields",
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 20,
  };
}

function successFetch(): CognitionFetch {
  return async () => new Response(JSON.stringify({ ok: true, proposal: proposal() }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function proposalArrival(arrival: ResidentLifeIntentLiveArrival) {
  expect(arrival.status).toBe("proposal");
  if (arrival.status !== "proposal") throw new Error(`expected proposal arrival, got ${arrival.status}`);
  return arrival;
}

function admitFields(): (
  proposalValue: ResidentCognitionProposal,
  context: ResidentLifeCognitionContext,
) => ResidentLifeIntentAdmission<{ targetRegionId: "fields" }> {
  return (proposalValue, context) => {
    if (proposalValue.activityDirective.kind !== "replace"
      || proposalValue.activityDirective.activity.targetRegionId !== "fields") {
      return { status: "rejected", detail: "expected frozen provider semantic target fields" };
    }
    if (context.life.body.focusedRunId !== "run.mira.a") {
      return { status: "rejected", detail: "truthful recovered A body ownership missing" };
    }
    return { status: "accepted", intent: { targetRegionId: "fields" } };
  };
}

describe("ResidentLifeIntentLiveHost transport/admission boundary", () => {
  it("keeps provider completion inert until explicit admission and delegates only bounded semantic intent admission", async () => {
    const { owner, life, attempt } = setup();
    const host = new ResidentLifeIntentLiveHost(owner, "/life-intent", successFetch());

    const arrival = proposalArrival(await host.request(attempt));
    expect(arrival).toMatchObject({
      version: 1,
      arrivalId: "resident-life-intent-arrival:0",
      attemptId: attempt.id,
      residentId: "resident.mira",
      status: "proposal",
    });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(host.pendingArrivals()).toBe(1);
    expect(host.recentAdmissions()).toEqual([]);

    const admitted = host.admit(arrival, 2, life, admitFields());
    expect(admitted).toMatchObject({
      status: "applied",
      admissionTick: 2,
      settlement: {
        status: "applied",
        intent: { targetRegionId: "fields" },
      },
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(host.pendingArrivals()).toBe(0);
    expect(host.recentAdmissions()).toEqual([expect.objectContaining({
      sequence: 0,
      arrivalId: arrival.arrivalId,
      admissionTick: 2,
      outcomeStatus: "applied",
      detail: "semantic_intent_applied",
    })]);
  });

  it("rejects an arrived proposal as stale when recovered life changes before explicit admission", async () => {
    const { resident, owner, life, attempt } = setup();
    const host = new ResidentLifeIntentLiveHost(owner, "/life-intent", successFetch());
    const arrival = proposalArrival(await host.request(attempt));
    const changed: ResidentLifeCognitionView = {
      ...structuredClone(life),
      matters: life.matters.map((matter) => ({
        ...structuredClone(matter),
        semanticRevision: matter.semanticRevision + 1,
        semanticCourse: `${matter.semanticCourse}; changed while provider answer waited`,
      })),
    };

    expect(host.admit(arrival, 3, changed, admitFields())).toEqual({
      status: "stale",
      admissionTick: 3,
      settlement: { status: "stale", reason: "resident_life_changed_during_request" },
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(resident.publicState().pendingCognitionReasonCount).toBeGreaterThanOrEqual(1);
  });

  it("keeps provider failure inert and abandons/requeues the exact attempt only at admission", async () => {
    const { resident, batch, owner, life, attempt } = setup();
    const fetcher: CognitionFetch = async () => { throw new Error("offline"); };
    const host = new ResidentLifeIntentLiveHost(owner, "/life-intent", fetcher);

    const arrival = await host.request(attempt);
    expect(arrival).toMatchObject({
      status: "provider_error",
      code: "network",
      attemptId: attempt.id,
    });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(resident.publicState().pendingCognitionReasonCount).toBe(0);

    expect(host.admit(arrival, 2, life, admitFields())).toEqual({
      status: "provider_error",
      admissionTick: 2,
      code: "network",
      abandonment: "abandoned",
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(resident.takeCognitionBatch(61)?.reasons[0]?.id).toBe(batch.reasons[0]!.id);
  });

  it("rejects cloned arrival authority without consuming the exact host-owned arrival", async () => {
    const { owner, life, attempt } = setup();
    const host = new ResidentLifeIntentLiveHost(owner, "/life-intent", successFetch());
    const arrival = proposalArrival(await host.request(attempt));
    const cloned = structuredClone(arrival);

    expect(host.admit(cloned, 2, life, admitFields())).toEqual({
      status: "arrival_rejected",
      reason: "unknown_arrival",
    });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(host.pendingArrivals()).toBe(1);
    expect(host.admit(arrival, 3, life, admitFields()).status).toBe("applied");
  });

  it("makes a provider answer stale after newer addressed attention even when recovered life is unchanged", async () => {
    const { resident, owner, life, attempt } = setup();
    const host = new ResidentLifeIntentLiveHost(owner, "/life-intent", successFetch());
    const arrival = proposalArrival(await host.request(attempt));
    resident.ingestPercepts([addressedSpeech("newer", 2)]);

    expect(host.admit(arrival, 3, life, admitFields())).toEqual({
      status: "stale",
      admissionTick: 3,
      settlement: { status: "stale", reason: "newer_addressed_attention" },
    });
  });
});
