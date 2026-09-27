import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import {
  ResidentMaterialMatterRelevanceBridge,
  sampleRecognizedMaterialObservation,
} from "./resident-material-matter-relevance-bridge";
import { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const RESIDENT_ID = "resident.janek";
const RELOCATOR_ID = "player.r6-delayed-history-relocator";
const OBJECT_ID = "crate.r6.delayed-history";
const OLD_MATTER_ID = "matter.janek.r6.delayed-history.old";
const OLD_RUN_ID = "run.janek.r6.delayed-history.old";

describe("R6 delayed terminal-history runtime gap", () => {
  it("loses legal causal access to a factual terminal self-episode after ordinary unrelated evidence churn", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_600, maxY: 600 },
      regions: [{
        id: "yard",
        label: "Yard",
        minX: 0,
        minY: 0,
        maxX: 1_600,
        maxY: 600,
      }],
      anchors: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    const resident = world.addResident(RESIDENT_ID, "Janek", { x: 120, y: 120 });
    world.familiarizeResidentWithRegions(RESIDENT_ID, ["yard"]);
    world.addMaterialObject({
      id: OBJECT_ID,
      label: "Delayed-history crate",
      radius: 18,
      location: { kind: "free", position: { x: 150, y: 120 } },
    });

    const knowledge = new ResidentMaterialKnowledge(RESIDENT_ID, [OBJECT_ID], world);
    knowledge.sample();
    expect(knowledge.observation(OBJECT_ID)).toMatchObject({ currentlyVisible: true });

    // Small capacity makes ordinary later factual life reach the same retention
    // boundary quickly; it does not change the semantics of that boundary.
    const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 4 });
    const matterScope = new ResidentLifeMatterScope(kernel);
    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const authority = new ResidentWorldExecutionAuthority(RESIDENT_ID, arbitrator, world);

    const oldOrigin = kernel.recordEvidence({
      id: "evidence:janek:r6:delayed-history:old-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "Janek begins one bounded attempt involving the familiar crate.",
    });
    kernel.openMatter({
      id: OLD_MATTER_ID,
      originEvidenceId: oldOrigin.id,
      semanticCourse: "try the familiar crate once",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try the familiar crate once",
        objectId: OBJECT_ID,
      },
    });
    matterScope.track(OLD_MATTER_ID);
    kernel.bindRun({
      matterId: OLD_MATTER_ID,
      taskId: "task.janek.r6.delayed-history.old",
      runId: OLD_RUN_ID,
    });
    expect(arbitrator.request(OLD_RUN_ID)).toEqual({
      status: "acquired",
      runId: OLD_RUN_ID,
    });

    world.addPlayer(RELOCATOR_ID, { x: 150, y: 120 }, { maxSpeed: 100_000 });
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "pickup",
      objectId: OBJECT_ID,
    }).status).toBe("succeeded");
    moveActorOneTick(world, RELOCATOR_ID, { x: 1_420, y: 120 });

    const oldExecutor = new ResidentMaterialPickupExecutor(
      OLD_RUN_ID,
      OBJECT_ID,
      knowledge,
      authority,
      world,
    );
    const blocked = oldExecutor.step();
    expect(blocked).toMatchObject({
      status: "blocked",
      materialOutcome: {
        status: "rejected",
        code: "object_unavailable",
        objectId: OBJECT_ID,
      },
    });
    if (blocked.status !== "blocked") {
      throw new Error(`old delayed-history material run ended as ${blocked.status}`);
    }

    const oldReconciliation = kernel.reconcileRunOutcome({
      runId: OLD_RUN_ID,
      tick: blocked.materialOutcome?.tick ?? world.tick,
      status: "blocked",
      summary: "blocked: factual material pickup returned object_unavailable",
    });
    expect(oldReconciliation.status).toBe("recorded");
    if (oldReconciliation.status !== "recorded") {
      throw new Error("old delayed-history outcome was not recorded");
    }
    const oldOutcome = oldReconciliation.evidence;
    kernel.resolveMatter(OLD_MATTER_ID);
    authority.enforceMotionAuthority();
    knowledge.sample();
    expect(knowledge.observation(OBJECT_ID)).toMatchObject({ currentlyVisible: false });

    expect(currentLife(kernel, matterScope, focus, arbitrator).matters).toContainEqual(
      expect.objectContaining({
        id: OLD_MATTER_ID,
        status: "resolved",
        lastOutcomeEvidence: expect.objectContaining({ id: oldOutcome.id }),
        activeRun: null,
      }),
    );

    // Two unrelated factual travel episodes are enough to move A's outcome outside
    // this deliberately small recent-evidence window. They use real body authority,
    // factual arrival and normal run reconciliation rather than synthetic filler text.
    executeOrdinaryTravelEpisode({
      suffix: "later-1",
      destination: { x: 320, y: 120 },
      world,
      kernel,
      matterScope,
      focus,
      arbitrator,
      authority,
    });
    expect(kernel.lastOutcomeEvidence(OLD_MATTER_ID)).not.toBeNull();

    executeOrdinaryTravelEpisode({
      suffix: "later-2",
      destination: { x: 480, y: 120 },
      world,
      kernel,
      matterScope,
      focus,
      arbitrator,
      authority,
    });

    expect(kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      lastOutcomeEvidenceId: oldOutcome.id,
    });
    expect(kernel.lastOutcomeEvidence(OLD_MATTER_ID)).toBeNull();

    const lifeAfterChurn = currentLife(kernel, matterScope, focus, arbitrator);
    expect(lifeAfterChurn.matters.some((matter) => matter.id === OLD_MATTER_ID)).toBe(false);

    // The exact same object factually returns after ordinary life has advanced.
    const self = world.publicSnapshot().actors.find((actor) => actor.id === RESIDENT_ID);
    if (!self) throw new Error("Janek body missing after ordinary life churn");
    moveActorOneTick(world, RELOCATOR_ID, {
      x: self.position.x + 30,
      y: self.position.y,
    });
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "place",
      objectId: OBJECT_ID,
      position: { x: self.position.x + 30, y: self.position.y },
    }).status).toBe("succeeded");

    const sampled = sampleRecognizedMaterialObservation(knowledge, OBJECT_ID);
    expect(sampled.previous).toMatchObject({ currentlyVisible: false });
    expect(sampled.current).toMatchObject({ currentlyVisible: true });

    const relevance = new ResidentMaterialMatterRelevanceBridge(resident, kernel);
    expect(relevance.observeReacquisition(
      sampled.previous,
      sampled.current,
      lifeAfterChurn,
    )).toEqual({
      status: "not_relevant",
      objectId: OBJECT_ID,
    });

    // This is the earned delayed-history gap. Homeostasis remains correct: A does
    // not reopen. But there is also no legal causal surface left for the resident to
    // know that this exact current opportunity connects to its own earlier factual
    // failure, so no history-sensitive semantic pressure can be produced.
    expect(kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(resident.pendingCognitionReasons()).toEqual([]);
  });
});

function executeOrdinaryTravelEpisode(input: {
  suffix: string;
  destination: { x: number; y: number };
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  matterScope: ResidentLifeMatterScope;
  focus: ResidentExecutionFocusAuthority;
  arbitrator: ResidentExecutionArbitrator;
  authority: ResidentWorldExecutionAuthority;
}): void {
  const matterId = `matter.janek.r6.delayed-history.${input.suffix}`;
  const runId = `run.janek.r6.delayed-history.${input.suffix}`;
  const origin = input.kernel.recordEvidence({
    id: `evidence:janek:r6:delayed-history:${input.suffix}:origin`,
    tick: input.world.tick,
    kind: "life_context",
    summary: `Janek has one unrelated ordinary factual travel episode: ${input.suffix}.`,
  });
  input.kernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: `complete unrelated ordinary travel episode ${input.suffix}`,
    semanticIntent: {
      kind: "travel_region",
      goal: `continue ordinary life episode ${input.suffix}`,
      targetRegionId: "yard",
    },
  });
  input.matterScope.track(matterId);
  input.kernel.bindRun({
    matterId,
    taskId: `task.janek.r6.delayed-history.${input.suffix}`,
    runId,
  });
  expect(input.arbitrator.request(runId)).toEqual({ status: "acquired", runId });

  const executor = new ResidentGroundedTravelExecutor(
    runId,
    input.destination,
    input.authority,
    input.world,
  );
  let local = executor.step();
  for (let guard = 0; local.status === "running" && guard < 600; guard += 1) {
    input.world.step();
    local = executor.step();
  }
  expect(local.status).toBe("arrived");
  if (local.status !== "arrived") {
    throw new Error(`ordinary delayed-history travel failed: ${local.status}`);
  }

  const outcome = input.kernel.reconcileRunOutcome({
    runId,
    tick: input.world.tick,
    status: "succeeded",
    summary: `completed unrelated ordinary factual travel episode ${input.suffix}`,
  });
  expect(outcome.status).toBe("recorded");
  input.kernel.resolveMatter(matterId);
  input.authority.enforceMotionAuthority();
  expect(input.arbitrator.reconcile()).toEqual({ status: "idle" });
}

function currentLife(
  kernel: ResidentContinuityKernel,
  matterScope: ResidentLifeMatterScope,
  focus: ResidentExecutionFocusAuthority,
  arbitrator: ResidentExecutionArbitrator,
) {
  return captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: matterScope.matterIds(),
  });
}

function moveActorOneTick(
  world: SpcWorldRuntime,
  actorId: string,
  target: { x: number; y: number },
): void {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`actor missing: ${actorId}`);
  const dt = world.options.fixedDeltaSeconds;
  world.setActorMotionIntent(actorId, {
    x: (target.x - actor.position.x) / dt,
    y: (target.y - actor.position.y) / dt,
  });
  world.step();
  world.setActorMotionIntent(actorId, { x: 0, y: 0 });
}
