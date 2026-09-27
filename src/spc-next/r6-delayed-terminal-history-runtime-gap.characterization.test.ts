import { describe, expect, it } from "vitest";
import { ResidentCausalReasonCommitmentAuthority } from "./resident-causal-reason-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import {
  ResidentMaterialMatterRelevanceBridge,
  sampleRecognizedMaterialObservation,
} from "./resident-material-matter-relevance-bridge";
import { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import { RegionNavigationGraph } from "./region-navigation";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const RESIDENT_ID = "resident.janek";
const RELOCATOR_ID = "player.r6-delayed-history-relocator";
const OBJECT_ID = "crate.r6.delayed-history";
const OLD_MATTER_ID = "matter.janek.r6.delayed-history.old";
const OLD_RUN_ID = "run.janek.r6.delayed-history.old";

describe("R6 delayed terminal-history factual recall boundary", () => {
  it("keeps finished work out of current life while exact later reacquisition can recover one bounded factual self-outcome", () => {
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
    expect(kernel.recentEvidenceSnapshot().some(
      (evidence) => evidence.id === oldOutcome.id,
    )).toBe(true);

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
    expect(kernel.recentEvidenceSnapshot().some(
      (evidence) => evidence.id === oldOutcome.id,
    )).toBe(false);
    // Terminalization already released the live outcome pin; the only near-term
    // projection route was the bounded recent-evidence window that has now churned.
    expect(kernel.lastOutcomeEvidence(OLD_MATTER_ID)).toBeNull();
    expect(kernel.archivedTerminalOutcomeEvidence(OLD_MATTER_ID)).toEqual(oldOutcome);

    const lifeAfterChurn = currentLife(kernel, matterScope, focus, arbitrator);
    expect(lifeAfterChurn.matters.some((matter) => matter.id === OLD_MATTER_ID)).toBe(false);

    // The important durability boundary is reconstruction, not merely an in-process
    // cache. All body work is terminal/idle here, so restoring committed continuity
    // cannot smuggle volatile focus/provider authority across the boundary.
    expect(authority.release()).toBe(true);
    const restoredKernel = new ResidentContinuityKernel({
      committedSnapshot: kernel.snapshotCommittedState(),
    });
    const restoredMatterScope = new ResidentLifeMatterScope(restoredKernel);
    const restoredFocus = new ResidentExecutionFocusAuthority(restoredKernel);
    const restoredArbitrator = new ResidentExecutionArbitrator(restoredKernel, restoredFocus);
    const restoredAuthority = new ResidentWorldExecutionAuthority(
      RESIDENT_ID,
      restoredArbitrator,
      world,
    );
    expect(restoredKernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      lastOutcomeEvidenceId: oldOutcome.id,
    });
    expect(restoredKernel.lastOutcomeEvidence(OLD_MATTER_ID)).toBeNull();
    expect(restoredKernel.archivedTerminalOutcomeEvidence(OLD_MATTER_ID)).toEqual(oldOutcome);
    const restoredLifeAfterChurn = currentLife(
      restoredKernel,
      restoredMatterScope,
      restoredFocus,
      restoredArbitrator,
    );
    expect(restoredLifeAfterChurn.matters).toEqual([]);

    // The exact same object factually returns after ordinary life has advanced
    // and committed resident continuity has been reconstructed.
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

    const relevance = new ResidentMaterialMatterRelevanceBridge(resident, restoredKernel);
    const opportunity = relevance.observeReacquisition(
      sampled.previous,
      sampled.current,
      restoredLifeAfterChurn,
    );
    expect(opportunity).toMatchObject({
      status: "fresh_opportunity",
      priorMatterId: OLD_MATTER_ID,
      objectId: OBJECT_ID,
      priorOutcomeEvidence: oldOutcome,
    });
    if (opportunity.status !== "fresh_opportunity") {
      throw new Error(`delayed factual history was not reconnected: ${opportunity.status}`);
    }

    // Crucially, archive-backed recall does not reinsert old work into current life.
    expect(currentLife(
      restoredKernel,
      restoredMatterScope,
      restoredFocus,
      restoredArbitrator,
    ).matters.some((matter) => matter.id === OLD_MATTER_ID)).toBe(false);
    expect(restoredKernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(restoredKernel.lastOutcomeEvidence(OLD_MATTER_ID)).toBeNull();
    expect(restoredKernel.archivedTerminalOutcomeEvidence(OLD_MATTER_ID)).toEqual(oldOutcome);

    const batch = waitForCognitionBatch(resident, world);
    expect(batch.reasons).toContainEqual(expect.objectContaining({
      id: opportunity.reasonId,
      kind: "direct_world_change",
      evidenceIds: [opportunity.evidence.id, oldOutcome.id],
      summary: expect.stringContaining(oldOutcome.summary),
    }));

    const decisionLife = currentLife(
      restoredKernel,
      restoredMatterScope,
      restoredFocus,
      restoredArbitrator,
    );
    expect(decisionLife.matters.some((matter) => matter.id === OLD_MATTER_ID)).toBe(false);

    const lifeIntentOwner = new ResidentLifeIntentOwner(resident);
    const attempt = lifeIntentOwner.prepare(batch, decisionLife, world.tick);
    if (!attempt) throw new Error("delayed-history material decision was not prepared");
    expect(attempt.context.life.matters.some((matter) => matter.id === OLD_MATTER_ID)).toBe(false);

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "the reacquired familiar object is worth one new bounded attempt after the earlier factual failure",
        intent: {
          kind: "acquire_material_object" as const,
          goal: "try to acquire the familiar crate again",
          objectId: OBJECT_ID,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };

    const causal = new ResidentCausalReasonCommitmentAuthority({
      residentId: RESIDENT_ID,
      resident,
      world,
      navigation: new RegionNavigationGraph(
        [{ id: "yard", destinationPoint: { x: 120, y: 120 } }],
        [],
      ),
      kernel: restoredKernel,
      arbitrator: restoredArbitrator,
      authority: restoredAuthority,
      materialKnowledge: knowledge,
      matterScope: restoredMatterScope,
      identityNamespace: "janek",
    });
    const settlement = lifeIntentOwner.settleCommitmentIntent(
      attempt,
      proposal,
      currentLife(
        restoredKernel,
        restoredMatterScope,
        restoredFocus,
        restoredArbitrator,
      ),
      world.tick,
      (admittedProposal, providerContext) => causal.groundCommitment({
        attempt,
        originReasonId: opportunity.reasonId,
        proposal: admittedProposal,
        providerContext,
        groundingContext: resident.cognitionContext(batch, world.tick),
      }),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") {
      throw new Error(`delayed-history material commitment failed: ${settlement.status}`);
    }

    // Semantic admission still creates no World/body authority until the exact
    // locally grounded intent is materialized.
    expect(restoredFocus.focusedRun()).toBeNull();
    expect(restoredKernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    const accepted = causal.materializeCommitment({
      attempt,
      originReasonId: opportunity.reasonId,
      proposal: settlement.proposal,
      intent: settlement.intent,
      tick: world.tick,
    });
    expect(accepted.matter.id).not.toBe(OLD_MATTER_ID);
    expect(accepted.matter).toMatchObject({
      status: "active",
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: OBJECT_ID,
      },
      historicalSupport: [{
        relation: "prior_same_material_outcome",
        sourceMatterId: OLD_MATTER_ID,
        evidenceId: oldOutcome.id,
      }],
    });
    expect(restoredKernel.historicalSupportEvidence(accepted.matter.id)).toEqual([{
      relation: "prior_same_material_outcome",
      sourceMatterId: OLD_MATTER_ID,
      evidence: oldOutcome,
    }]);
    expect(accepted.focusClaim).toEqual({
      status: "acquired",
      runId: accepted.runId,
    });
    expect(restoredKernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(restoredKernel.archivedTerminalOutcomeEvidence(OLD_MATTER_ID)).toEqual(oldOutcome);

    // The new episode can now act through ordinary material World authority; the
    // archive supplied provenance only, never execution.
    const retry = new ResidentMaterialPickupExecutor(
      accepted.runId,
      OBJECT_ID,
      knowledge,
      restoredAuthority,
      world,
    );
    let retryStep = retry.step();
    for (let guard = 0; retryStep.status === "running" && guard < 300; guard += 1) {
      world.step();
      knowledge.sample();
      retryStep = retry.step();
    }
    expect(retryStep.status).toBe("succeeded");
    expect(world.materialObject(OBJECT_ID)).toMatchObject({
      location: { kind: "held", actorId: RESIDENT_ID },
    });
    if (retryStep.status !== "succeeded") {
      throw new Error("delayed-history retry unexpectedly remained non-terminal");
    }
    const retryOutcome = restoredKernel.reconcileRunOutcome({
      runId: accepted.runId,
      tick: retryStep.materialOutcome.tick,
      status: "succeeded",
      summary: "factual delayed-history retry picked up the exact familiar object",
    });
    expect(retryOutcome.status).toBe("recorded");
    restoredKernel.resolveMatter(accepted.matter.id);
    restoredAuthority.enforceMotionAuthority();
    expect(restoredKernel.matter(accepted.matter.id)?.historicalSupport).toBeUndefined();
    expect(restoredKernel.historicalSupportEvidence(accepted.matter.id)).toEqual([]);
    expect(restoredKernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
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

function waitForCognitionBatch(
  resident: ReturnType<SpcWorldRuntime["addResident"]>,
  world: SpcWorldRuntime,
) {
  let batch = resident.takeCognitionBatch(world.tick);
  for (let step = 0; !batch && step < 240; step += 1) {
    world.step();
    batch = resident.takeCognitionBatch(world.tick);
  }
  if (!batch) throw new Error("delayed-history cognition batch did not become ready");
  return batch;
}
