import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContextWithDiagnostic } from "../../worker/spc-next-life-context";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import { RegionNavigationGraph, bidirectionalEdge } from "./region-navigation";
import { SpcWorldRuntime } from "./spc-world-runtime";

const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.fixture";
const CRATE_ID = "crate.r6.post-terminal";
const WORKSHOP_ID = "workshop";
const COMMONS_ID = "commons";

const HISTORY_MATTER_ID = "matter.janek.r6.post-terminal-friction";
const HISTORY_RUN_ID = "run.janek.r6.post-terminal-friction";
const CURRENT_MATTER_ID = "matter.janek.r6.same-later-arrival";
const CURRENT_RUN_ID = "run.janek.r6.same-later-arrival";

const EXECUTION_GUARD = 300;
const COGNITION_GUARD = 30;

/**
 * First paired falsifier for the non-obligation R6 frontier.
 *
 * Both Janeks inhabit the same factual World and later complete the exact same
 * self-owned travel. Neither receives fresh speech and neither receives authored
 * self/drives. The history twin alone previously attempted one exact material action,
 * factually received object_unavailable from World authority, reconciled that blocked
 * outcome, and TERMINATED the matter.
 *
 * The purpose is not to prove learned aversion. It is to prove that the current
 * substrate can present a clean "this happened to me before" difference to higher
 * cognition without lying that the old task is still open.
 */
describe("R6 post-terminal factual-history paired falsifier", () => {
  it("produces matched no-fresh-command reflection frames differing only by one resolved factual self-episode", () => {
    const control = buildSpecimen(false);
    const history = buildSpecimen(true);

    expect(control.request.batch.reasons).toHaveLength(1);
    expect(history.request.batch.reasons).toHaveLength(1);
    expect(control.request.batch.reasons[0]).toEqual(history.request.batch.reasons[0]);
    expect(control.request.batch.reasons[0]).toMatchObject({
      kind: "activity_completed",
      evidenceIds: [expect.any(String)],
    });
    expect(control.request.batch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);
    expect(history.request.batch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);

    expect(control.request.context.self).toBeUndefined();
    expect(history.request.context.self).toBeUndefined();
    expect(control.request.context.currentRegionId).toBe(COMMONS_ID);
    expect(history.request.context.currentRegionId).toBe(COMMONS_ID);
    expect(control.request.context.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(history.request.context.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });

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
      lastOutcomeEvidence: {
        kind: "task_outcome",
        sourceRunId: HISTORY_RUN_ID,
        summary: expect.stringContaining("object_unavailable"),
      },
      activeRun: null,
    });

    // Critical distinction: the old material episode is history, not unfinished
    // business. The later reflection has one identical current factual cause.
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

    for (const specimen of [control, history]) {
      const sanitized = sanitizeSpcNextLifeContextWithDiagnostic(specimen.request.context);
      expect(sanitized.diagnostic).toBeNull();
      expect(sanitized.context).not.toBeNull();
    }
  });

  it("keeps the resolved episode visible only as bounded history rather than reviving it after the later reflection", () => {
    const history = buildSpecimen(true);
    const oldMatter = history.life.kernel.matter(HISTORY_MATTER_ID);
    const oldHistoryView = history.request.context.life.matters.find(
      (matter) => matter.id === HISTORY_MATTER_ID,
    ) ?? null;

    expect(oldMatter).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    // Terminalization intentionally releases live evidence pins. Bounded historical
    // visibility comes from the recent-evidence window, not an immortal matter pin.
    expect(history.life.kernel.lastOutcomeEvidence(HISTORY_MATTER_ID)).toBeNull();
    expect(oldHistoryView?.lastOutcomeEvidence).toMatchObject({
      kind: "task_outcome",
      sourceRunId: HISTORY_RUN_ID,
      summary: expect.stringContaining("object_unavailable"),
    });
    expect(history.life.arbitrator.deferredRunIds()).not.toContain(HISTORY_RUN_ID);
    expect(history.life.focus.focusedRun()).toBeNull();

    // Merely taking the later cognition frame must not mutate the old episode back
    // into active work or manufacture a new material run.
    expect(history.life.kernel.matter(HISTORY_MATTER_ID)).toEqual(oldMatter);
    expect(history.life.kernel.lastOutcomeEvidence(HISTORY_MATTER_ID)).toBeNull();
    expect(history.request.context.life.matters.find(
      (matter) => matter.id === HISTORY_MATTER_ID,
    )).toEqual(oldHistoryView);
  });
});

function buildSpecimen(withLivedHistory: boolean) {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 700, maxY: 300 },
    regions: [
      {
        id: WORKSHOP_ID,
        label: "Workshop",
        minX: 0,
        minY: 0,
        maxX: 250,
        maxY: 300,
      },
      {
        id: COMMONS_ID,
        label: "Commons",
        minX: 250,
        minY: 0,
        maxX: 700,
        maxY: 300,
      },
    ],
    anchors: [],
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  });

  world.addPlayer(PLAYER_ID, { x: 100, y: 150 });
  const janek = world.addResident(JANEK_ID, "Janek", { x: 120, y: 150 });
  world.familiarizeResidentWithRegions(JANEK_ID, [WORKSHOP_ID, COMMONS_ID]);
  world.addMaterialObject({
    id: CRATE_ID,
    label: "R6 factual-history crate",
    radius: 16,
    location: { kind: "free", position: { x: 100, y: 150 } },
  });

  // Current World truth is identical in both twins: the participant already holds
  // the crate. Only the history twin actually tried and experienced that unavailability.
  expect(world.attemptMaterialAction(PLAYER_ID, {
    kind: "pickup",
    objectId: CRATE_ID,
  })).toMatchObject({
    status: "succeeded",
    code: "picked_up",
  });

  const navigation = new RegionNavigationGraph(
    [
      { id: WORKSHOP_ID, destinationPoint: { x: 120, y: 150 } },
      { id: COMMONS_ID, destinationPoint: { x: 500, y: 150 } },
    ],
    bidirectionalEdge(WORKSHOP_ID, COMMONS_ID, 1),
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
      summary: "blocked: factual material attempt returned object_unavailable",
    });
    expect(outcome.status).toBe("recorded");
    life.kernel.resolveMatter(HISTORY_MATTER_ID);
    life.arbitrator.reconcile();
    life.worldAuthority.enforceMotionAuthority();
  }

  // Same later self-owned chapter in both twins. It supplies the single current
  // reflection cause without any fresh command or social obligation.
  const currentOrigin = life.kernel.recordEvidence({
    id: "evidence:janek:r6:same-later-arrival-origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Janek already has one bounded self-owned trip to the commons.",
  });
  life.kernel.openMatter({
    id: CURRENT_MATTER_ID,
    originEvidenceId: currentOrigin.id,
    semanticCourse: "go to the familiar commons and finish this bounded trip",
    semanticIntent: {
      kind: "travel_region",
      goal: "go to the familiar commons",
      targetRegionId: COMMONS_ID,
    },
  });
  life.matterScope.track(CURRENT_MATTER_ID);
  life.kernel.bindRun({
    matterId: CURRENT_MATTER_ID,
    taskId: "task.janek.r6.same-later-arrival",
    runId: CURRENT_RUN_ID,
  });
  expect(life.arbitrator.request(CURRENT_RUN_ID)).toMatchObject({
    status: "acquired",
    runId: CURRENT_RUN_ID,
  });

  const completion = completeFocused(execution, world);
  expect(completion.matterId).toBe(CURRENT_MATTER_ID);
  expect(completion.runId).toBe(CURRENT_RUN_ID);
  expect(janek.cognitionContext({
    residentId: JANEK_ID,
    requestedAtTick: world.tick,
    reasons: [],
  }).currentRegionId).toBe(COMMONS_ID);

  expect(life.outcomeReviewBridge.observe(
    completion.outcomeEvidence,
    world.tick,
  )).toMatchObject({ status: "scheduled" });

  const request = waitForRequest(cognition, execution, world);
  return {
    world,
    janek,
    life,
    cognition,
    execution,
    request,
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
      throw new Error(`R6 post-terminal later travel failed: ${step.status}`);
    }
    world.step();
  }
  throw new Error("R6 post-terminal later travel exceeded guard");
}

function waitForRequest(
  cognition: ResidentCausalCognitionLane,
  execution: ResidentCausalExecutionCoordinator,
  world: SpcWorldRuntime,
) {
  let request = cognition.takeReadyRequest();
  for (let index = 0; index < COGNITION_GUARD && !request; index += 1) {
    const step = execution.stepFocusedRun();
    if (step.status !== "idle" && step.status !== "running") {
      throw new Error(`R6 post-terminal unexpected execution while awaiting cognition: ${step.status}`);
    }
    world.step();
    request = cognition.takeReadyRequest();
  }
  if (!request) throw new Error("R6 post-terminal specimen produced no cognition request");
  return request;
}

function stripHistoricalEpisode(context: ResidentLifeCognitionContext) {
  const clone = structuredClone(context);
  clone.life.matters = clone.life.matters.filter(
    (matter) => matter.id !== HISTORY_MATTER_ID,
  );
  return clone;
}
