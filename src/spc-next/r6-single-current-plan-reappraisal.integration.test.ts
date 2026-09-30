import { describe, expect, it } from "vitest";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import {
  createFiveResidentRegionComposition,
  FIVE_RESIDENT_MATERIAL_OBJECTS,
} from "./five-resident-region";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

const JANEK = "resident.janek";
const C = "matter.janek.r6.single-plan-reappraisal";
const C_RUN = "run.janek.r6.single-plan-reappraisal.semantic-1";
const RUNTIME_C = "matter.janek.r6.single-plan-reappraisal.runtime-material";
const RUNTIME_C_RUN = "run.janek.r6.single-plan-reappraisal.runtime-material";
const RUNTIME_RELOCATOR = "player.r6.single-plan-reappraisal.relocator";
const CRATE = FIVE_RESIDENT_MATERIAL_OBJECTS[0]!.id;

describe("R6 single-current-plan autonomous reappraisal", () => {
  it("relinquishes the sole run-free current plan only through its exact factual outcome pressure", () => {
    const state = setupBlockedSinglePlan();
    const request = takeOutcomeRequest(state);
    const outcomeReason = exactOutcomeReason(request, state.blocked.evidence.id);

    expect(state.cognition.settleCommitment(
      request,
      {
        version: 1,
        commitmentDecision: {
          kind: "relinquish_matter",
          matterId: C,
          reason: "this exact factual block changed my judgement; stop carrying the workshop plan",
          supportEvidenceIds: [state.blocked.evidence.id],
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      outcomeReason.id,
    )).toMatchObject({
      status: "applied",
      residentId: JANEK,
      decision: "relinquish_matter",
      commitment: null,
    });

    expect(state.life.kernel.matter(C)).toMatchObject({
      id: C,
      status: "cancelled",
      activeRunId: null,
      semanticRevision: 2,
      lastOutcomeEvidenceId: state.blocked.evidence.id,
      lastOutcomeSemanticRevision: 1,
    });
    expect(state.life.kernel.canRunMutateWorld(C_RUN)).toBe(false);
    expect(state.life.arbitrator.reconcile()).toEqual({ status: "idle" });

    const revisionEvidence = state.life.kernel.recentEvidenceSnapshot().find(
      (evidence) => evidence.kind === "resident_relinquished_matter",
    );
    expect(revisionEvidence).toMatchObject({
      kind: "resident_relinquished_matter",
      summary: expect.stringContaining(state.blocked.evidence.id),
    });

    const execution = new ResidentCausalExecutionCoordinator(state.life);
    expect(execution.reactivateReviewedMatter(C)).toEqual({
      status: "rejected",
      matterId: C,
      reason: "matter_not_active",
    });
  });

  it("can explicitly continue the same sole current plan after factual review and lawfully bind semantic revision 2", () => {
    const state = setupBlockedSinglePlan();
    const request = takeOutcomeRequest(state);
    const outcomeReason = exactOutcomeReason(request, state.blocked.evidence.id);

    expect(state.cognition.settleCommitment(
      request,
      {
        version: 1,
        commitmentDecision: {
          kind: "continue_matter",
          matterId: C,
          reason: "this factual block does not end the plan; keep carrying the same workshop matter",
          supportEvidenceIds: [state.blocked.evidence.id],
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      outcomeReason.id,
    )).toMatchObject({
      status: "applied",
      residentId: JANEK,
      decision: "continue_matter",
      commitment: null,
    });

    expect(state.life.kernel.matter(C)).toMatchObject({
      id: C,
      status: "active",
      activeRunId: "run.janek.r6.single-plan-reappraisal.semantic-2",
      semanticRevision: 2,
      lastOutcomeEvidenceId: state.blocked.evidence.id,
      lastOutcomeSemanticRevision: 1,
    });
    expect(state.life.kernel.recentEvidenceSnapshot()).toContainEqual(expect.objectContaining({
      kind: "resident_continued_matter",
      summary: expect.stringContaining(state.blocked.evidence.id),
    }));
    expect(state.life.kernel.canRunMutateWorld(
      "run.janek.r6.single-plan-reappraisal.semantic-2",
    )).toBe(true);
    expect(state.life.arbitrator.reconcile()).toMatchObject({
      status: "already_focused",
      runId: "run.janek.r6.single-plan-reappraisal.semantic-2",
    });
  });

  it("rejects plain decline when it would consume the only factual review pressure and strand the current plan", () => {
    const state = setupBlockedSinglePlan();
    const request = takeOutcomeRequest(state);
    const outcomeReason = exactOutcomeReason(request, state.blocked.evidence.id);

    expect(state.cognition.settleCommitment(
      request,
      {
        version: 1,
        commitmentDecision: {
          kind: "decline",
          reason: "plain decline is not an existing-plan lifecycle decision",
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      outcomeReason.id,
    )).toEqual({
      status: "rejected",
      residentId: JANEK,
      reason: "intent_rejected",
      detail:
        "single-plan factual outcome requires explicit continue, relinquish, defer or clarify",
    });

    expect(state.life.kernel.matter(C)).toMatchObject({
      status: "active",
      activeRunId: null,
      semanticRevision: 1,
      lastOutcomeEvidenceId: state.blocked.evidence.id,
    });
  });

  it("reaches the same relinquishment through a factual blocked outcome produced by the main five-resident material executor", () => {
    const composition = createFiveResidentRegionComposition();
    const runtime = new FiveResidentCausalLifeRuntime(composition);
    const { world } = composition;
    const life = runtime.life(JANEK);
    if (!life) throw new Error("Janek recovered life was not claimed");

    expect(life.materialKnowledge?.observation(CRATE)).toMatchObject({
      objectId: CRATE,
      currentlyVisible: true,
    });

    const crate = world.materialObject(CRATE);
    if (!crate || crate.location.kind !== "free") throw new Error("baseline crate is not free");
    world.addPlayer(RUNTIME_RELOCATOR, crate.location.position, { maxSpeed: 100_000 });
    expect(world.attemptMaterialAction(RUNTIME_RELOCATOR, {
      kind: "pickup",
      objectId: CRATE,
    }).status).toBe("succeeded");
    moveActorOneTick(world, RUNTIME_RELOCATOR, { x: 3_000, y: 720 });
    const far = actorPosition(world, RUNTIME_RELOCATOR);
    expect(world.attemptMaterialAction(RUNTIME_RELOCATOR, {
      kind: "place",
      objectId: CRATE,
      position: far,
    }).status).toBe("succeeded");

    const origin = life.kernel.recordEvidence({
      id: "evidence:janek:r6:single-plan-reappraisal:runtime-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "Janek owns one current material plan before its factual execution outcome",
    });
    life.kernel.openMatter({
      id: RUNTIME_C,
      originEvidenceId: origin.id,
      semanticCourse: "try the familiar workshop crate once",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try the familiar workshop crate once",
        objectId: CRATE,
      },
    });
    life.matterScope.track(RUNTIME_C);
    life.kernel.bindRun({
      matterId: RUNTIME_C,
      taskId: "task.janek.r6.single-plan-reappraisal.runtime-material",
      runId: RUNTIME_C_RUN,
    });
    expect(life.arbitrator.request(RUNTIME_C_RUN)).toEqual({
      status: "acquired",
      runId: RUNTIME_C_RUN,
    });

    let blockedOutcomeId: string | null = null;
    for (let guard = 0; guard < 420 && blockedOutcomeId === null; guard += 1) {
      const tick = runtime.advanceOneWorldTick();
      const step = tick.execution[JANEK];
      if (step?.status !== "blocked" || step.matterId !== RUNTIME_C) continue;
      expect(step.runId).toBe(RUNTIME_C_RUN);
      blockedOutcomeId = step.outcomeEvidence.id;
    }
    if (!blockedOutcomeId) throw new Error("main runtime never produced factual material blockage");

    expect(life.kernel.matter(RUNTIME_C)).toMatchObject({
      status: "active",
      activeRunId: null,
      lastOutcomeEvidenceId: blockedOutcomeId,
      lastOutcomeSemanticRevision: 1,
    });
    expect(life.materialKnowledge?.observation(CRATE)).toMatchObject({
      currentlyVisible: false,
    });

    const cognition = new ResidentCausalCognitionLane(life);
    let request = cognition.takeReadyRequest();
    for (let guard = 0; guard < 180 && !request; guard += 1) {
      runtime.advanceOneWorldTick();
      request = cognition.takeReadyRequest();
    }
    if (!request) throw new Error("executor-produced outcome never became ready cognition");
    const reason = exactOutcomeReason(request, blockedOutcomeId);

    expect(cognition.settleCommitment(
      request,
      {
        version: 1,
        commitmentDecision: {
          kind: "relinquish_matter",
          matterId: RUNTIME_C,
          reason: "this exact factual object-unavailable outcome changes whether I keep this plan",
          supportEvidenceIds: [blockedOutcomeId],
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      reason.id,
    )).toMatchObject({
      status: "applied",
      decision: "relinquish_matter",
      commitment: null,
    });

    expect(life.kernel.matter(RUNTIME_C)).toMatchObject({
      status: "cancelled",
      activeRunId: null,
      semanticRevision: 2,
      lastOutcomeEvidenceId: blockedOutcomeId,
    });
    expect(life.arbitrator.reconcile()).toEqual({ status: "idle" });
  });

  it("rejects relinquishment whose cited support is not factual support attached to the exact current matter", () => {
    const state = setupBlockedSinglePlan();
    const request = takeOutcomeRequest(state);
    const outcomeReason = exactOutcomeReason(request, state.blocked.evidence.id);

    expect(state.cognition.settleCommitment(
      request,
      {
        version: 1,
        commitmentDecision: {
          kind: "relinquish_matter",
          matterId: C,
          reason: "try to use ordinary origin wording as deletion authority",
          supportEvidenceIds: [state.origin.id],
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      outcomeReason.id,
    )).toEqual({
      status: "rejected",
      residentId: JANEK,
      reason: "intent_rejected",
      detail: "single-plan review lacks exact target-local factual support",
    });

    expect(state.life.kernel.matter(C)).toMatchObject({
      id: C,
      status: "active",
      activeRunId: null,
      semanticRevision: 1,
      lastOutcomeEvidenceId: state.blocked.evidence.id,
    });
    expect(state.life.kernel.recentEvidenceSnapshot().some(
      (evidence) => evidence.kind === "resident_relinquished_matter",
    )).toBe(false);
  });
});

function setupBlockedSinglePlan() {
  const composition = createFiveResidentRegionComposition();
  const { world } = composition;
  const resident = composition.runtimes[JANEK];
  const life = new ResidentCausalLifeSubstrate({
    residentId: JANEK,
    resident,
    world,
    navigation: createFiveResidentNavigationGraph(),
  });

  const origin = life.kernel.recordEvidence({
    id: "evidence:janek:r6:single-plan-reappraisal:origin",
    tick: world.tick,
    kind: "accepted_cognition_commitment",
    summary: "Janek currently owns one ordinary workshop plan and no competing future",
  });
  const matter = life.kernel.openMatter({
    id: C,
    originEvidenceId: origin.id,
    semanticCourse: "go to the familiar workshop",
    semanticIntent: {
      kind: "travel_region",
      goal: "go to the familiar workshop",
      targetRegionId: "workshop",
    },
  });
  life.matterScope.track(matter.id);
  life.kernel.bindRun({
    matterId: C,
    taskId: "task.janek.r6.single-plan-reappraisal.semantic-1",
    runId: C_RUN,
  });
  expect(life.arbitrator.request(C_RUN)).toEqual({ status: "acquired", runId: C_RUN });

  const blocked = life.kernel.reconcileRunOutcome({
    runId: C_RUN,
    tick: world.tick,
    status: "blocked",
    summary: "the only current workshop plan hit one factual blocked outcome",
  });
  expect(blocked.status).toBe("recorded");
  if (blocked.status !== "recorded") throw new Error("single-plan outcome missing");
  expect(life.outcomeReviewBridge.observe(blocked.evidence, world.tick)).toEqual({
    status: "scheduled",
    outcomeEvidenceId: blocked.evidence.id,
  });

  return {
    composition,
    world,
    resident,
    life,
    origin,
    blocked,
    cognition: new ResidentCausalCognitionLane(life),
  };
}

function takeOutcomeRequest(state: ReturnType<typeof setupBlockedSinglePlan>) {
  let request = state.cognition.takeReadyRequest();
  for (let step = 0; step < 180 && !request; step += 1) {
    state.world.step();
    request = state.cognition.takeReadyRequest();
  }
  expect(request).not.toBeNull();
  if (!request) throw new Error("single-plan factual review produced no cognition request");
  return request;
}

function exactOutcomeReason(
  request: ReturnType<typeof takeOutcomeRequest>,
  outcomeEvidenceId: string,
) {
  const reason = request.batch.reasons.find(
    (candidate) => candidate.kind === "activity_completed"
      && candidate.evidenceIds.length === 1
      && candidate.evidenceIds[0] === outcomeEvidenceId,
  );
  expect(reason).toBeDefined();
  if (!reason) throw new Error("single-plan outcome reason missing");
  return reason;
}

function actorPosition(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  actorId: string,
) {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`actor missing: ${actorId}`);
  return { ...actor.position };
}

function moveActorOneTick(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  actorId: string,
  target: { x: number; y: number },
): void {
  const current = actorPosition(world, actorId);
  const dt = world.options.fixedDeltaSeconds;
  world.setActorMotionIntent(actorId, {
    x: (target.x - current.x) / dt,
    y: (target.y - current.y) / dt,
  });
  world.step();
  world.setActorMotionIntent(actorId, { x: 0, y: 0 });
}
