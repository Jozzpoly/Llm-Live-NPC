import { describe, expect, it } from "vitest";
import type { ResidentPercept, ResidentProfile } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentLifeChoiceLiveHost } from "./resident-life-choice-live-host";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const A = { matterId: "matter.mira.a", runId: "run.mira.a", taskId: "task.mira.a" } as const;
const B = { matterId: "matter.mira.b", runId: "run.mira.b", taskId: "task.mira.b" } as const;
const C = { matterId: "matter.mira.c", runId: "run.mira.c", taskId: "task.mira.c" } as const;
const MATTER_IDS = [A.matterId, B.matterId, C.matterId] as const;

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

function setupAmbiguity() {
  const resident = new ResidentRuntime(profile);
  resident.enterRegion({ id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 }, 0, true);

  const kernel = new ResidentContinuityKernel();
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  for (const spec of [A, B, C]) open(kernel, spec, 1);

  expect(arbitrator.request(A.runId)).toEqual({ status: "acquired", runId: A.runId });
  expect(arbitrator.request(B.runId)).toMatchObject({ status: "busy", focusedRunId: A.runId });
  expect(arbitrator.request(C.runId)).toMatchObject({ status: "busy", focusedRunId: A.runId });

  // This transport-composition fixture only needs the coarse body to become free;
  // physical completion was independently qualified by the Mira multi-matter World test.
  kernel.cancelMatter(A.matterId);
  kernel.retireRun(A.runId);
  expect(arbitrator.reconcile()).toEqual({
    status: "choice_required",
    candidateRunIds: [B.runId, C.runId],
  });
  resident.promoteSemanticPressure({
    id: "reason:test:live-composition:ambiguity",
    tick: 1,
    kind: "uncertainty",
    salience: 0.8,
    summary: "B and C require the same currently-free body.",
    evidenceIds: [B.runId, C.runId],
  });
  const batch = resident.takeCognitionBatch(31)!;

  const owner = new ResidentLifeChoiceOwner(resident);
  const life = captureResidentLifeCognitionView({ kernel, focus, arbitrator, matterIds: MATTER_IDS });
  const attempt = owner.prepare(batch, life)!;
  return { resident, batch, kernel, focus, arbitrator, owner, life, attempt };
}

function addressedSpeech(tick: number): ResidentPercept {
  return {
    id: `percept:mira:choice:${tick}`,
    occurrenceId: `occurrence:mira:choice:${tick}`,
    tick,
    phenomenon: "speech",
    modality: "hearing",
    actorId: null,
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "addressed resident pressure",
    text: "Mira?",
    addressed: true,
  };
}

function open(
  kernel: ResidentContinuityKernel,
  spec: { matterId: string; runId: string; taskId: string },
  tick: number,
) {
  const evidence = kernel.recordEvidence({
    id: `evidence:${spec.matterId}:${tick}`,
    tick,
    kind: "life_context",
    summary: `${spec.matterId} is one grounded resident commitment`,
  });
  kernel.openMatter({
    id: spec.matterId,
    originEvidenceId: evidence.id,
    semanticCourse: `continue ${spec.matterId}`,
  });
  kernel.bindRun({ matterId: spec.matterId, taskId: spec.taskId, runId: spec.runId });
}

function proposal(matterId = B.matterId) {
  return {
    version: 1,
    decision: {
      kind: "focus_matter",
      matterId,
      reason: "give this current commitment the free body next",
      supportEvidenceIds: [`evidence:${matterId}:1`],
      reviewAfterSeconds: 8,
    },
  };
}

describe("resident-life live choice + execution arbitration composition", () => {
  it("keeps an arrived provider choice inert, then admits it before the chosen exact run may take body focus", async () => {
    const state = setupAmbiguity();
    let receivedContext: unknown = null;
    const host = new ResidentLifeChoiceLiveHost(state.owner, "/life-choice", async (_input, init) => {
      receivedContext = JSON.parse(String(init?.body));
      return Response.json({ ok: true, proposal: proposal() });
    });

    const arrival = await host.request(state.attempt);
    expect(arrival.status).toBe("proposal");
    expect(receivedContext).toEqual(state.attempt.context);

    // Network completion owns no resident/body authority.
    expect(state.owner.state().activeAttemptId).toBe(state.attempt.id);
    expect(state.focus.focusedRun()).toBeNull();
    expect(state.arbitrator.deferredRunIds()).toEqual([B.runId, C.runId]);
    expect(state.kernel.canRunMutateWorld(B.runId)).toBe(true);
    expect(state.kernel.canRunMutateWorld(C.runId)).toBe(true);

    const currentLife = captureResidentLifeCognitionView({
      kernel: state.kernel,
      focus: state.focus,
      arbitrator: state.arbitrator,
      matterIds: MATTER_IDS,
    });
    const admitted = host.admit(arrival, 32, currentLife);
    expect(admitted).toMatchObject({
      status: "applied",
      settlement: { decision: { kind: "focus_matter", matterId: B.matterId } },
    });
    expect(state.focus.focusedRun()).toBeNull();

    // Even an admitted semantic preference still cannot focus the body by itself.
    expect(state.arbitrator.choose(B.runId)).toEqual({ status: "acquired", runId: B.runId });
    expect(state.focus.focusedRun()).toBe(B.runId);
    expect(state.arbitrator.deferredRunIds()).toEqual([C.runId]);
  });

  it("rejects an arrived B/C answer after C changes, then locally auto-handoffs the sole still-valid deferred B", async () => {
    const state = setupAmbiguity();
    const host = new ResidentLifeChoiceLiveHost(state.owner, "/life-choice", async () =>
      Response.json({ ok: true, proposal: proposal(B.matterId) }));
    const arrival = await host.request(state.attempt);
    expect(arrival.status).toBe("proposal");

    const newer = state.kernel.recordEvidence({
      id: "evidence:mira:c:newer",
      tick: 2,
      kind: "life_context",
      summary: "C changed materially while the provider answer was in flight",
    });
    state.kernel.advanceSemanticContext(C.matterId, newer.id);
    expect(state.kernel.canRunMutateWorld(C.runId)).toBe(false);

    const changedLife = captureResidentLifeCognitionView({
      kernel: state.kernel,
      focus: state.focus,
      arbitrator: state.arbitrator,
      matterIds: MATTER_IDS,
    });
    expect(host.admit(arrival, 32, changedLife)).toEqual({
      status: "stale",
      admissionTick: 2,
      settlement: { status: "stale", reason: "resident_life_changed_during_request" },
    });
    expect(state.focus.focusedRun()).toBeNull();

    // Reconciliation prunes the now-stale C demand. Exactly one legal demand remains,
    // so B may continue locally without trusting or replaying the stale provider answer.
    expect(state.arbitrator.reconcile()).toEqual({ status: "acquired_deferred", runId: B.runId });
    expect(state.focus.focusedRun()).toBe(B.runId);
    expect(state.arbitrator.deferredRunIds()).toEqual([]);
    expect(state.kernel.canRunMutateWorld(B.runId)).toBe(true);
  });
});
