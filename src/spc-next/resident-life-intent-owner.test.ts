import { describe, expect, it } from "vitest";
import type { ResidentCognitionProposal } from "./cognition-contract";
import type { ResidentPercept, ResidentProfile } from "./contracts";
import {
  ResidentLifeIntentOwner,
  type ResidentLifeIntentAdmission,
} from "./resident-life-intent-owner";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
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

const hearth = { id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 } as const;
const workshop = { id: "workshop", label: "Workshop", minX: 1_400, minY: 0, maxX: 2_700, maxY: 1_500 } as const;

function addressedSpeech(id: string, tick: number, text = "Mira, zajrzysz do warsztatu?"): ResidentPercept {
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
    text,
    addressed: true,
  };
}

function setup() {
  const resident = new ResidentRuntime(profile);
  resident.enterRegion(hearth, 0, true);
  resident.familiarizeRegion(workshop, 0);
  resident.setActivity({
    id: "activity:mira:local-idle",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "local scaffold idle while recovered life owns the body",
  }, 0);
  resident.ingestPercepts([addressedSpeech("initial", 1)]);
  const batch = resident.takeCognitionBatch(1);
  if (!batch) throw new Error("expected addressed cognition batch");
  return { resident, batch, owner: new ResidentLifeIntentOwner(resident) };
}

function lifeView(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [
      {
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
      },
    ],
    body: { focusedRunId: "run.mira.a", deferredRunIds: [] },
  };
}

function proposal() {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: "accept the addressed workshop request as a continuing intent",
      activity: {
        kind: "travel",
        goal: "visit the familiar workshop after the current matter",
        targetActorId: null,
        targetRegionId: "workshop",
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 20,
  };
}

function admitWorkshop(): (
  proposalValue: ResidentCognitionProposal,
  context: ResidentLifeCognitionContext,
) => ResidentLifeIntentAdmission<{ targetRegionId: string }> {
  return (_proposalValue, context) => {
    if (context.life.body.focusedRunId !== "run.mira.a") {
      return { status: "rejected", detail: "recovered life truth missing" };
    }
    return { status: "accepted", intent: { targetRegionId: "workshop" } };
  };
}

describe("ResidentLifeIntentOwner", () => {
  it("exposes local activity only as local truth while preserving authoritative recovered life", () => {
    const { owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    expect(attempt.context.contract).toBe("resident_life_cognition_v1");
    expect(attempt.context.localActivity).toMatchObject({
      kind: "idle",
      reason: "local scaffold idle while recovered life owns the body",
    });
    expect(Object.hasOwn(attempt.context, "currentActivity")).toBe(false);
    expect(attempt.context.life.body).toEqual({ focusedRunId: "run.mira.a", deferredRunIds: [] });
    expect(attempt.context.reasons.some((reason) => reason.kind === "heard_speech")).toBe(true);
  });

  it("snapshots provider context at dispatch time while preserving older causal reason time", () => {
    const { owner, batch } = setup();
    expect(batch.requestedAtTick).toBe(1);

    const initial = lifeView();
    const life: ResidentLifeCognitionView = {
      ...structuredClone(initial),
      matters: initial.matters.map((matter, index) => index === 0
        ? {
            ...structuredClone(matter),
            status: "resolved",
            lastOutcomeEvidence: {
              id: "evidence:mira:a:outcome",
              tick: 40,
              kind: "task_outcome",
              summary: "A completed factually at tick 40",
            },
            activeRun: null,
          }
        : structuredClone(matter)),
      body: { focusedRunId: null, deferredRunIds: [] },
    };

    const attempt = owner.prepare(batch, life, 50);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    expect(attempt.batch.requestedAtTick).toBe(1);
    expect(attempt.context.tick).toBe(50);
    expect(attempt.context.reasons.every((reason) => reason.tick <= attempt.context.tick)).toBe(true);
    expect(attempt.context.life.matters[0]?.lastOutcomeEvidence?.tick).toBe(40);
  });

  it("admits a bounded legacy proposal against the frozen private evidence while giving the admission callback truthful life context", () => {
    const { resident, owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life)!;

    const settlement = owner.settleIntent(attempt, proposal(), life, 2, admitWorkshop());
    expect(settlement).toEqual({
      status: "applied",
      proposal: expect.objectContaining({
        activityDirective: expect.objectContaining({ kind: "replace" }),
      }),
      intent: { targetRegionId: "workshop" },
    });
    expect(owner.state().activeAttemptId).toBeNull();
    expect(resident.publicState().pendingCognitionReasonCount).toBe(0);
  });

  it("rejects malformed provider output and requeues the exact causal batch", () => {
    const { resident, owner, batch } = setup();
    const attempt = owner.prepare(batch, lifeView())!;

    expect(owner.settleIntent(attempt, { version: 1, activityDirective: { kind: "fabricated" } }, lifeView(), 2, admitWorkshop())).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });
    expect(resident.takeCognitionBatch(61)?.reasons.some((reason) => reason.id === batch.reasons[0]?.id)).toBe(true);
  });

  it("rejects a cloned attempt handle without consuming the real authority", () => {
    const { owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life)!;
    const cloned = structuredClone(attempt);

    expect(owner.settleIntent(cloned, proposal(), life, 2, admitWorkshop())).toEqual({
      status: "rejected",
      reason: "unknown_attempt",
    });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(owner.settleIntent(attempt, proposal(), life, 2, admitWorkshop()).status).toBe("applied");
  });

  it("makes the old intent stale after newer addressed attention", () => {
    const { resident, owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life)!;
    resident.ingestPercepts([addressedSpeech("newer", 2, "Mira, jednak poczekaj!")]);

    expect(owner.settleIntent(attempt, proposal(), life, 2, admitWorkshop())).toEqual({
      status: "stale",
      reason: "newer_addressed_attention",
    });
    expect(resident.publicState().pendingCognitionReasonCount).toBeGreaterThanOrEqual(2);
  });

  it("makes the old intent stale after local activity changes", () => {
    const { resident, owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life)!;
    resident.setActivity({
      id: "activity:mira:new-local",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "local state changed while cognition was in flight",
    }, 2);

    expect(owner.settleIntent(attempt, proposal(), life, 2, admitWorkshop())).toEqual({
      status: "stale",
      reason: "local_activity_changed_during_request",
    });
  });

  it("makes the old intent stale after recovered resident-life truth changes", () => {
    const { owner, batch } = setup();
    const initial = lifeView();
    const attempt = owner.prepare(batch, initial)!;
    const changed: ResidentLifeCognitionView = {
      ...structuredClone(initial),
      matters: initial.matters.map((matter, index) => index === 0
        ? {
            ...structuredClone(matter),
            activeRun: matter.activeRun
              ? { ...structuredClone(matter.activeRun), bodyState: "unfocused" }
              : null,
          }
        : structuredClone(matter)),
      body: {
        ...structuredClone(initial.body),
        focusedRunId: null,
      },
    };

    expect(owner.settleIntent(attempt, proposal(), changed, 2, admitWorkshop())).toEqual({
      status: "stale",
      reason: "resident_life_changed_during_request",
    });
  });

  it("requeues the causal batch when the active attempt is abandoned", () => {
    const { resident, owner, batch } = setup();
    const attempt = owner.prepare(batch, lifeView())!;

    expect(owner.abandon(attempt)).toBe(true);
    expect(owner.abandon(attempt)).toBe(false);
    expect(resident.takeCognitionBatch(61)?.reasons.some((reason) => reason.id === batch.reasons[0]?.id)).toBe(true);
  });
});
