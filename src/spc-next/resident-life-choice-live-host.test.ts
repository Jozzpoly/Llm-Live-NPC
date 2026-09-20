import { describe, expect, it } from "vitest";
import type { ResidentPercept, ResidentProfile } from "./contracts";
import type { CognitionFetch } from "./resident-cognition-live-host";
import {
  ResidentLifeChoiceLiveHost,
  type ResidentLifeChoiceLiveArrival,
} from "./resident-life-choice-live-host";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
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
  resident.promoteSemanticPressure({
    id: "reason:test:life-choice-host:ambiguity",
    tick: 1,
    kind: "uncertainty",
    salience: 0.8,
    summary: "B and C require the same currently-free body.",
    evidenceIds: ["run.mira.b", "run.mira.c"],
  });
  const batch = resident.takeCognitionBatch(31)!;
  const owner = new ResidentLifeChoiceOwner(resident);
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
    summary: "addressed speech",
    text: "Mira, chwila!",
    addressed: true,
  };
}

function lifeView(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [matter("matter.mira.b", "run.mira.b"), matter("matter.mira.c", "run.mira.c")],
    body: { focusedRunId: null, deferredRunIds: ["run.mira.b", "run.mira.c"] },
  };
}

function matter(id: string, runId: string) {
  const evidence = {
    id: `evidence:life-choice-host:${id}`,
    tick: 0,
    kind: "life_context",
    summary: `${id} is a grounded continuing matter.`,
  };
  return {
    id,
    status: "active" as const,
    semanticRevision: 1,
    semanticCourse: `continue ${id}`,
    suspendedByMatterId: null,
    originEvidence: evidence,
    semanticEvidence: evidence,
    lastOutcomeEvidence: null,
    activeRun: {
      runId,
      taskId: `task:${id}`,
      semanticRevision: 1,
      canMutateWorld: true,
      bodyState: "deferred" as const,
    },
  };
}

function proposal(matterId = "matter.mira.b") {
  return {
    version: 1,
    decision: {
      kind: "focus_matter",
      matterId,
      reason: "give this continuing matter the free body next",
      supportEvidenceIds: [`evidence:life-choice-host:${matterId}`],
      reviewAfterSeconds: 8,
    },
  };
}

function successFetch(): CognitionFetch {
  return async () => new Response(JSON.stringify({ ok: true, proposal: proposal() }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function proposalArrival(arrival: ResidentLifeChoiceLiveArrival) {
  expect(arrival.status).toBe("proposal");
  if (arrival.status !== "proposal") throw new Error(`expected proposal arrival, got ${arrival.status}`);
  return arrival;
}

describe("ResidentLifeChoiceLiveHost transport/admission boundary", () => {
  it("keeps provider completion inert until explicit admission against fresh resident-life truth", async () => {
    const { owner, life, attempt } = setup();
    const host = new ResidentLifeChoiceLiveHost(owner, "/life-choice", successFetch());

    const arrival = proposalArrival(await host.request(attempt));
    expect(arrival).toMatchObject({
      version: 1,
      arrivalId: "resident-life-choice-arrival:0",
      attemptId: attempt.id,
      residentId: "resident.mira",
      status: "proposal",
    });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(host.pendingArrivals()).toBe(1);
    expect(host.recentAdmissions()).toEqual([]);

    expect(host.admit(arrival, 32, life)).toMatchObject({
      status: "applied",
      admissionTick: 2,
      settlement: { decision: { kind: "focus_matter", matterId: "matter.mira.b" } },
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(host.pendingArrivals()).toBe(0);
    expect(host.recentAdmissions()).toEqual([expect.objectContaining({
      sequence: 0,
      arrivalId: arrival.arrivalId,
      admissionTick: 2,
      outcomeStatus: "applied",
      detail: "focus_matter",
    })]);
  });

  it("rejects an old arrived choice when life truth changes before admission", async () => {
    const { resident, owner, life, attempt } = setup();
    const host = new ResidentLifeChoiceLiveHost(owner, "/life-choice", successFetch());
    const arrival = proposalArrival(await host.request(attempt));
    const changed = structuredClone(life) as ResidentLifeCognitionView;
    const mutable = changed.matters[0] as { semanticRevision: number; semanticCourse: string };
    mutable.semanticRevision = 2;
    mutable.semanticCourse = "B changed while the provider answer was waiting for admission";

    expect(host.admit(arrival, 33, changed)).toEqual({
      status: "stale",
      admissionTick: 3,
      settlement: { status: "stale", reason: "resident_life_changed_during_request" },
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(resident.publicState().pendingCognitionReasonCount).toBeGreaterThanOrEqual(1);
    expect(host.recentAdmissions()[0]).toMatchObject({
      outcomeStatus: "stale",
      detail: "resident_life_changed_during_request",
    });
  });

  it("keeps provider failure inert and requeues the exact causal batch only at explicit admission", async () => {
    const { resident, batch, owner, life, attempt } = setup();
    const fetcher: CognitionFetch = async () => { throw new Error("offline"); };
    const host = new ResidentLifeChoiceLiveHost(owner, "/life-choice", fetcher);

    const arrival = await host.request(attempt);
    expect(arrival).toMatchObject({ status: "provider_error", code: "network", attemptId: attempt.id });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(resident.publicState().pendingCognitionReasonCount).toBe(0);

    expect(host.admit(arrival, 2, life)).toEqual({
      status: "provider_error",
      admissionTick: 2,
      code: "network",
      abandonment: "abandoned",
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(resident.takeCognitionBatch(91)?.reasons[0]?.id).toBe(batch.reasons[0]!.id);
  });

  it("rejects cloned arrival authority without consuming the exact host-owned arrival", async () => {
    const { owner, life, attempt } = setup();
    const host = new ResidentLifeChoiceLiveHost(owner, "/life-choice", successFetch());
    const arrival = proposalArrival(await host.request(attempt));
    const cloned = structuredClone(arrival);

    expect(host.admit(cloned, 32, life)).toEqual({ status: "arrival_rejected", reason: "unknown_arrival" });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(host.pendingArrivals()).toBe(1);
    expect(host.admit(arrival, 33, life).status).toBe("applied");
  });
});
