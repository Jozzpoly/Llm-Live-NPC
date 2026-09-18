import { describe, expect, it } from "vitest";
import { CognitionGrounder } from "./cognition-grounder";
import type { ResidentPercept, ResidentProfile } from "./contracts";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import {
  ResidentCognitionLiveHost,
  type CognitionFetch,
  type ResidentCognitionLiveArrival,
} from "./resident-cognition-live-host";
import { ResidentCognitionOwner } from "./resident-cognition-owner";
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

function speech(id: string, tick: number, addressed: boolean, text = "Mira, odpowiedz"): ResidentPercept {
  return {
    id: `percept:${id}`,
    occurrenceId: `occurrence:${id}`,
    tick,
    phenomenon: "speech",
    modality: "hearing",
    actorId: "player.jozz",
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "speech",
    text,
    addressed,
  };
}

function recognizedSight(tick: number): ResidentPercept {
  return {
    id: `percept:recognized-player:${tick}`,
    occurrenceId: `sight:update:player:${tick}`,
    tick,
    phenomenon: "actor_sight_update",
    modality: "sight",
    actorId: "player.jozz",
    subjectId: "player.jozz",
    spatial: { kind: "exact", position: { x: 720, y: 650 } },
    summary: "known actor visible",
    text: null,
    addressed: false,
  };
}

function setup() {
  const resident = new ResidentRuntime(profile);
  resident.enterRegion({ id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 }, 0, true);
  resident.ingestPercepts([recognizedSight(0)]);
  resident.ingestPercepts([speech("initial", 1, true)]);
  const owner = new ResidentCognitionOwner(resident, new CognitionGrounder(createFiveResidentNavigationGraph()));
  const batch = resident.takeCognitionBatch(1)!;
  const attempt = owner.prepare(batch)!;
  return { resident, owner, batch, attempt };
}

function communicateProposal() {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: "reply in the shared world",
      activity: {
        kind: "communicate",
        goal: "answer Jozz",
        targetActorId: "player.jozz",
        targetRegionId: null,
        targetPosition: null,
        text: "Jasne.",
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 5,
  };
}

function successFetch(): CognitionFetch {
  return async () => new Response(JSON.stringify({ ok: true, proposal: communicateProposal() }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function proposalArrival(arrival: ResidentCognitionLiveArrival) {
  expect(arrival.status).toBe("proposal");
  if (arrival.status !== "proposal") throw new Error(`expected proposal arrival, got ${arrival.status}`);
  return arrival;
}

function acceptDeliveryIntent() {
  return (proposal: Parameters<ResidentCognitionOwner["settleIntent"]>[1] extends never ? never : import("./cognition-contract").ResidentCognitionProposal, context: import("./cognition-contract").ResidentCognitionContext) => {
    if (proposal.activityDirective.kind !== "replace") return { status: "rejected" as const, detail: "replacement required" };
    const targetActorId = proposal.activityDirective.activity.targetActorId;
    if (!targetActorId || !context.knownActors.some((actor) => actor.id === targetActorId)) {
      return { status: "rejected" as const, detail: "target not privately known" };
    }
    return {
      status: "accepted" as const,
      intent: {
        kind: "deliver_message" as const,
        targetActorId,
        text: proposal.activityDirective.activity.text,
      },
    };
  };
}

describe("ResidentCognitionLiveHost transport/admission boundary", () => {
  it("keeps a successful provider arrival inert until an explicit resident/World admission tick", async () => {
    const { resident, owner, attempt } = setup();
    const beforeActivity = structuredClone(resident.publicState().activity);
    const host = new ResidentCognitionLiveHost(owner, "/cognition", successFetch());

    const arrival = proposalArrival(await host.request(attempt));

    expect(arrival).toMatchObject({
      version: 1,
      arrivalId: "resident-cognition-arrival:0",
      attemptId: attempt.id,
      residentId: "resident.mira",
      status: "proposal",
    });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(host.pendingArrivals()).toBe(1);
    expect(host.recentAdmissions()).toEqual([]);
    expect(resident.publicState().activity).toEqual(beforeActivity);

    const admitted = host.admit(arrival, 2, acceptDeliveryIntent());
    expect(admitted).toMatchObject({
      status: "applied",
      admissionTick: 2,
      settlement: {
        intent: { kind: "deliver_message", targetActorId: "player.jozz", text: "Jasne." },
      },
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(host.pendingArrivals()).toBe(0);
    expect(resident.publicState().activity).toEqual(beforeActivity);
    expect(host.recentAdmissions()).toEqual([expect.objectContaining({
      sequence: 0,
      arrivalId: arrival.arrivalId,
      attemptId: attempt.id,
      residentId: "resident.mira",
      admissionTick: 2,
      arrivalStatus: "proposal",
      outcomeStatus: "applied",
    })]);
  });

  it("evaluates addressed-attention staleness at admission and never calls intent grounding for a stale arrival", async () => {
    const { resident, owner, attempt } = setup();
    const host = new ResidentCognitionLiveHost(owner, "/cognition", successFetch());
    const arrival = proposalArrival(await host.request(attempt));
    resident.ingestPercepts([speech("interrupt", 2, true, "Mira, jednak zaczekaj")]);
    let groundingCalls = 0;

    const admitted = host.admit(arrival, 3, () => {
      groundingCalls += 1;
      return { status: "accepted", intent: { kind: "should_not_exist" as const } };
    });

    expect(admitted).toEqual({
      status: "stale",
      admissionTick: 3,
      settlement: { status: "stale", reason: "newer_addressed_attention" },
    });
    expect(groundingCalls).toBe(0);
    expect(owner.state().activeAttemptId).toBeNull();
    expect(host.pendingArrivals()).toBe(0);
    expect(resident.publicState().pendingCognitionReasonCount).toBeGreaterThanOrEqual(2);
    expect(host.recentAdmissions()[0]).toMatchObject({
      admissionTick: 3,
      outcomeStatus: "stale",
      detail: "newer_addressed_attention",
    });
  });

  it("keeps provider failure inert and requeues the exact causal batch only at explicit admission", async () => {
    const { resident, owner, batch, attempt } = setup();
    const fetcher: CognitionFetch = async () => { throw new Error("offline"); };
    const host = new ResidentCognitionLiveHost(owner, "/cognition", fetcher);

    const arrival = await host.request(attempt);
    expect(arrival).toMatchObject({
      status: "provider_error",
      code: "network",
      attemptId: attempt.id,
    });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(resident.publicState().pendingCognitionReasonCount).toBe(0);
    expect(host.pendingArrivals()).toBe(1);

    expect(host.admit(arrival, 2, acceptDeliveryIntent())).toEqual({
      status: "provider_error",
      admissionTick: 2,
      code: "network",
      abandonment: "abandoned",
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(host.pendingArrivals()).toBe(0);
    expect(resident.publicState().pendingCognitionReasonCount).toBeGreaterThanOrEqual(1);
    expect(resident.takeCognitionBatch(61)?.reasons[0]?.id).toBe(batch.reasons[0]!.id);
  });

  it("rejects cloned arrival authority without consuming the original exact arrival", async () => {
    const { owner, attempt } = setup();
    const host = new ResidentCognitionLiveHost(owner, "/cognition", successFetch());
    const arrival = proposalArrival(await host.request(attempt));
    const cloned = structuredClone(arrival);

    expect(host.admit(cloned, 2, acceptDeliveryIntent())).toEqual({
      status: "arrival_rejected",
      reason: "unknown_arrival",
    });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(host.pendingArrivals()).toBe(1);
    expect(host.admit(arrival, 3, acceptDeliveryIntent()).status).toBe("applied");
    expect(owner.state().activeAttemptId).toBeNull();
  });
});
