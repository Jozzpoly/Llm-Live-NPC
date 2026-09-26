import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContextWithDiagnostic } from "../../worker/spc-next-life-context";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { RegionNavigationGraph, bidirectionalEdge } from "./region-navigation";
import { SpcWorldRuntime } from "./spc-world-runtime";

const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.fixture";
const CRATE_ID = "crate.r6.post-terminal";
const WORKSHOP_ID = "workshop";
const YARD_ID = "yard";

const HISTORY_MATTER_ID = "matter.janek.r6.post-terminal-friction";
const HISTORY_RUN_ID = "run.janek.r6.post-terminal-friction";
const EXECUTION_GUARD = 180;

/**
 * First paired falsifier for the non-obligation R6 frontier.
 *
 * Both Janeks receive the same current factual material reacquisition and no fresh
 * speech, command, standing obligation or authored self/drives. The history twin alone
 * previously attempted the same material identity through World authority, factually
 * received object_unavailable, reconciled that blocked outcome and TERMINATED the
 * matter.
 *
 * The test does not claim learned aversion/preference. It proves that current
 * higher-cognition can be shown one clean "this happened to me before" difference
 * without pretending the old task is still open. Live semantic judgement is a later
 * evidence plane.
 */
describe("R6 post-terminal factual-history paired falsifier", () => {
  it("produces matched current-reacquisition frames differing only by one resolved factual self-episode", () => {
    const control = buildSpecimen(false);
    const history = buildSpecimen(true);

    expect(control.request.batch.reasons).toHaveLength(1);
    expect(history.request.batch.reasons).toHaveLength(1);
    expect(control.request.batch.reasons[0]).toEqual(history.request.batch.reasons[0]);
    expect(control.request.batch.reasons[0]).toMatchObject({
      kind: "direct_world_change",
      summary: expect.stringContaining(CRATE_ID),
      evidenceIds: [expect.any(String)],
    });
    expect(control.request.batch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);
    expect(history.request.batch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);

    expect(control.request.context.self).toBeUndefined();
    expect(history.request.context.self).toBeUndefined();
    expect(control.request.context.currentRegionId).toBe(YARD_ID);
    expect(history.request.context.currentRegionId).toBe(YARD_ID);
    expect(control.request.context.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(history.request.context.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });

    expect(control.previousMaterialObservation).toMatchObject({
      objectId: CRATE_ID,
      currentlyVisible: false,
    });
    expect(history.previousMaterialObservation).toEqual(control.previousMaterialObservation);
    expect(control.currentMaterialObservation).toMatchObject({
      objectId: CRATE_ID,
      currentlyVisible: true,
      lastKnownPosition: { x: 480, y: 150 },
    });
    expect(history.currentMaterialObservation).toEqual(control.currentMaterialObservation);

    const controlHistory = control.request.context.life.matters.filter(
      (matter) => matter.id === HISTORY_MATTER_ID,
    );
    const livedHistory = history.request.context.life.matters.filter(
      (matter) => matter.id === HISTORY_MATTER_ID,
    );
    expect(controlHistory).toHaveLength(0);
    expect(livedHistory).toHaveLength(1);
    expect(livedHistory[0]).toMatchObject({
      id: HISTORY_MATTER_ID,
      status: "resolved",
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: CRATE_ID,
      },
      originEvidence: null,
      semanticEvidence: null,
      lastOutcomeEvidence: {
        kind: "task_outcome",
        sourceRunId: HISTORY_RUN_ID,
        summary: expect.stringContaining("object_unavailable"),
      },
      activeRun: null,
    });

    // Current factual World/private state is equivalent. The only intended semantic
    // difference is one bounded terminal episode from this resident's own prior life.
    expect(stripHistoricalEpisode(control.request.context))
      .toEqual(stripHistoricalEpisode(history.request.context));

    expect(history.historyWorldAction).toMatchObject({
      status: "resolved",
      materialOutcome: {
        status: "rejected",
        code: "object_unavailable",
        actorId: JANEK_ID,
        objectId: CRATE_ID,
      },
    });
    expect(history.life.kernel.matter(HISTORY_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(history.life.arbitrator.deferredRunIds()).not.toContain(HISTORY_RUN_ID);
    expect(history.life.focus.focusedRun()).toBeNull();

    for (const specimen of [control, history]) {
      const sanitized = sanitizeSpcNextLifeContextWithDiagnostic(specimen.request.context);
      expect(sanitized.diagnostic).toBeNull();
      expect(sanitized.context).not.toBeNull();
    }
  });

  it("keeps both action and non-action legal instead of hard-coding an aversion from the old failure", () => {
    const control = buildSpecimen(false);
    const history = buildSpecimen(true);

    const controlOrigin = control.request.batch.reasons[0]!;
    const historyOrigin = history.request.batch.reasons[0]!;

    const accepted: ResidentLifeIntentProposal = {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "the currently visible familiar crate makes one bounded return to the workshop worth checking",
        intent: {
          kind: "travel",
          goal: "return to the familiar workshop because the crate is visibly present again",
          targetActorId: null,
          targetRegionId: WORKSHOP_ID,
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 600,
    };
    const declined: ResidentLifeIntentProposal = {
      version: 1,
      commitmentDecision: {
        kind: "decline",
        reason: "do not create a new continuing matter from this reacquisition",
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 600,
    };

    const controlSettlement = control.cognition.settleCommitment(
      control.request,
      accepted,
      controlOrigin.id,
    );
    expect(controlSettlement).toMatchObject({
      status: "applied",
      residentId: JANEK_ID,
      decision: "accept",
      commitment: {
        matterId: expect.any(String),
        runId: expect.any(String),
      },
    });
    if (controlSettlement.status !== "applied" || !controlSettlement.commitment) {
      throw new Error("R6 post-terminal control travel was not admitted");
    }
    const completion = completeFocused(control.execution, control.world);
    expect(completion.runId).toBe(controlSettlement.commitment.runId);
    expect(control.janek.cognitionContext({
      residentId: JANEK_ID,
      requestedAtTick: control.world.tick,
      reasons: [],
    }).currentRegionId).toBe(WORKSHOP_ID);

    const oldMatterBeforeDecline = history.life.kernel.matter(HISTORY_MATTER_ID);
    const historySettlement = history.cognition.settleCommitment(
      history.request,
      declined,
      historyOrigin.id,
    );
    expect(historySettlement).toEqual({
      status: "applied",
      residentId: JANEK_ID,
      decision: "decline",
      commitment: null,
    });
    expect(history.life.currentLifeView().body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(history.life.kernel.matter(HISTORY_MATTER_ID)).toEqual(oldMatterBeforeDecline);
    expect(history.janek.pendingCognitionReasons()).toEqual([]);
  });
});

function buildSpecimen(withLivedHistory: boolean) {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_500, maxY: 300 },
    regions: [
      {
        id: WORKSHOP_ID,
        label: "Workshop",
        minX: 0,
        minY: 0,
        maxX: 500,
        maxY: 300,
      },
      {
        id: YARD_ID,
        label: "Yard",
        minX: 500,
        minY: 0,
        maxX: 1_500,
        maxY: 300,
      },
    ],
    anchors: [],
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  });

  world.addPlayer(PLAYER_ID, { x: 480, y: 150 }, { maxSpeed: 60_000 });
  const janek = world.addResident(JANEK_ID, "Janek", { x: 520, y: 150 });
  world.familiarizeResidentWithRegions(JANEK_ID, [WORKSHOP_ID, YARD_ID]);
  world.addMaterialObject({
    id: CRATE_ID,
    label: "R6 factual-history crate",
    radius: 16,
    location: { kind: "free", position: { x: 480, y: 150 } },
  });

  const materialKnowledge = new ResidentMaterialKnowledge(JANEK_ID, [CRATE_ID], world);
  expect(materialKnowledge.sample()[0]).toMatchObject({
    objectId: CRATE_ID,
    currentlyVisible: true,
    lastKnownPosition: { x: 480, y: 150 },
  });

  const navigation = new RegionNavigationGraph(
    [
      { id: WORKSHOP_ID, destinationPoint: { x: 450, y: 150 } },
      { id: YARD_ID, destinationPoint: { x: 700, y: 150 } },
    ],
    bidirectionalEdge(WORKSHOP_ID, YARD_ID, 1),
  );
  const life = new ResidentCausalLifeSubstrate({
    residentId: JANEK_ID,
    resident: janek,
    world,
    navigation,
    identityNamespace: "janek-r6-post-terminal",
  });
  const cognition = new ResidentCausalCognitionLane(life);
  const execution = new ResidentCausalExecutionCoordinator(life);

  // Identical current World prehistory in both twins: the player takes the crate.
  expect(world.attemptMaterialAction(PLAYER_ID, {
    kind: "pickup",
    objectId: CRATE_ID,
  })).toMatchObject({
    status: "succeeded",
    code: "picked_up",
  });

  let historyWorldAction: ReturnType<typeof life.worldAuthority.act> | null = null;
  if (withLivedHistory) {
    const origin = life.kernel.recordEvidence({
      id: "evidence:janek:r6:post-terminal-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "Janek decides to try the familiar material object once.",
    });
    life.kernel.openMatter({
      id: HISTORY_MATTER_ID,
      originEvidenceId: origin.id,
      semanticCourse: "try to acquire the familiar material object once",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try the familiar material object once",
        objectId: CRATE_ID,
      },
    });
    life.matterScope.track(HISTORY_MATTER_ID);
    life.kernel.bindRun({
      matterId: HISTORY_MATTER_ID,
      taskId: "task.janek.r6.post-terminal-friction",
      runId: HISTORY_RUN_ID,
    });
    expect(life.arbitrator.request(HISTORY_RUN_ID)).toMatchObject({
      status: "acquired",
      runId: HISTORY_RUN_ID,
    });

    historyWorldAction = life.worldAuthority.act(HISTORY_RUN_ID, {
      kind: "material_pickup",
      objectId: CRATE_ID,
    });
    expect(historyWorldAction).toMatchObject({
      status: "resolved",
      materialOutcome: {
        status: "rejected",
        code: "object_unavailable",
      },
    });

    const outcome = life.kernel.reconcileRunOutcome({
      runId: HISTORY_RUN_ID,
      tick: world.tick,
      status: "blocked",
      summary: "factual material attempt returned object_unavailable",
    });
    expect(outcome.status).toBe("recorded");
    life.kernel.resolveMatter(HISTORY_MATTER_ID);
    life.arbitrator.reconcile();
    life.worldAuthority.enforceMotionAuthority();
  }

  // Move the held object outside Janek's sight in the same factual way in both twins.
  world.setActorMotionIntent(PLAYER_ID, { x: 60_000, y: 0 });
  world.step();
  world.setActorMotionIntent(PLAYER_ID, { x: 0, y: 0 });
  materialKnowledge.sample();
  const previousMaterialObservation = materialKnowledge.observation(CRATE_ID);
  expect(previousMaterialObservation).toMatchObject({
    objectId: CRATE_ID,
    currentlyVisible: false,
  });

  // Bring it back to the exact workshop-edge location and place it. This is the one
  // current factual cue both twins receive.
  world.setActorMotionIntent(PLAYER_ID, { x: -55_200, y: 0 });
  world.step();
  world.setActorMotionIntent(PLAYER_ID, { x: 0, y: 0 });
  expect(world.attemptMaterialAction(PLAYER_ID, {
    kind: "place",
    objectId: CRATE_ID,
    position: { x: 480, y: 150 },
  })).toMatchObject({
    status: "succeeded",
    code: "placed",
  });

  materialKnowledge.sample();
  const currentMaterialObservation = materialKnowledge.observation(CRATE_ID);
  expect(currentMaterialObservation).toMatchObject({
    objectId: CRATE_ID,
    currentlyVisible: true,
    lastKnownPosition: { x: 480, y: 150 },
  });
  if (!currentMaterialObservation || !previousMaterialObservation) {
    throw new Error("R6 post-terminal material reacquisition observation missing");
  }

  // Explicit R6 probe boundary: this is not a new global R2 policy. We promote one
  // exact, already-factual private reacquisition so the paired experiment can ask
  // whether prior terminal life changes semantic judgement. The reason itself owns
  // no body authority and creates no continuing matter.
  const reacquiredEvidence = life.kernel.recordEvidence({
    id: `evidence:janek:r6:material-reacquired:${world.tick}`,
    tick: world.tick,
    kind: "material_reacquired_probe",
    summary:
      `Recognized familiar material object ${CRATE_ID} is privately visible again at (${currentMaterialObservation.lastKnownPosition.x}, ${currentMaterialObservation.lastKnownPosition.y}).`,
  });
  janek.promoteSemanticPressure({
    id: "reason:resident.janek:r6:material-reacquired",
    tick: world.tick,
    kind: "direct_world_change",
    salience: 0.75,
    summary:
      `Familiar material object ${CRATE_ID} is visibly present again near the workshop after an earlier absence.`,
    evidenceIds: [reacquiredEvidence.id],
  });

  const request = cognition.takeReadyRequest();
  if (!request) throw new Error("R6 post-terminal reacquisition produced no cognition request");

  return {
    world,
    janek,
    life,
    cognition,
    execution,
    request,
    materialKnowledge,
    previousMaterialObservation,
    currentMaterialObservation,
    historyWorldAction,
  };
}

function completeFocused(
  execution: ResidentCausalExecutionCoordinator,
  world: SpcWorldRuntime,
) {
  for (let index = 0; index < EXECUTION_GUARD; index += 1) {
    const step = execution.stepFocusedRun();
    if (step.status === "completed") {
      world.step();
      return step;
    }
    if (step.status !== "running") {
      throw new Error(`R6 post-terminal accepted travel failed: ${step.status}`);
    }
    world.step();
  }
  throw new Error("R6 post-terminal accepted travel exceeded guard");
}

function stripHistoricalEpisode(context: ResidentLifeCognitionContext) {
  const clone = structuredClone(context);
  clone.life.matters = clone.life.matters.filter(
    (matter) => matter.id !== HISTORY_MATTER_ID,
  );
  return clone;
}
