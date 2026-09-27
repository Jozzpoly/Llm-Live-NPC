import { describe, expect, it } from "vitest";
import { ResidentCausalOutcomeTravelCommitmentAuthority } from "./resident-causal-outcome-travel-commitment";
import { ResidentCausalReasonCommitmentAuthority } from "./resident-causal-reason-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import {
  allowedChoiceSupportEvidenceIds,
} from "./resident-life-choice-causal-support";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentLifeChoiceReviewBridge } from "./resident-life-choice-review-bridge";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import { ResidentLifeOutcomeReviewBridge } from "./resident-life-outcome-review-bridge";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import {
  ResidentMaterialMatterRelevanceBridge,
  sampleRecognizedMaterialObservation,
} from "./resident-material-matter-relevance-bridge";
import { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import { bidirectionalEdge, RegionNavigationGraph } from "./region-navigation";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const RESIDENT_ID = "resident.janek";
const RELOCATOR_ID = "player.r6-competing-relocator";
const OBJECT_ID = "crate.r6.endogenous-competing";

const OLD_MATTER_ID = "matter.janek.r6.endogenous-competing.old-material";
const OLD_RUN_ID = "run.janek.r6.endogenous-competing.old-material";
const CARRIER_MATTER_ID = "matter.janek.r6.endogenous-competing.carrier";
const CARRIER_RUN_ID = "run.janek.r6.endogenous-competing.carrier";

const YARD = "yard";
const WORKSHOP = "workshop";
const FIELDS = "fields";

const YARD_POINT = Object.freeze({ x: 120, y: 120 });
const WORKSHOP_POINT = Object.freeze({ x: 720, y: 120 });
const FIELDS_POINT = Object.freeze({ x: 1_220, y: 120 });
const OBJECT_START = Object.freeze({ x: 150, y: 120 });
const OBJECT_RETURN = Object.freeze({ x: 180, y: 120 });

describe("R6 endogenous competing-future factual-history chain", () => {
  it("carries delayed terminal material history through a fresh same-object future into later genuine choice pressure", () => {
    const world = createWorld();
    const resident = world.addResident(RESIDENT_ID, "Janek", { ...YARD_POINT });
    world.familiarizeResidentWithRegions(RESIDENT_ID, [YARD, WORKSHOP, FIELDS]);
    world.addMaterialObject({
      id: OBJECT_ID,
      label: "Familiar R6 Competing Crate",
      radius: 18,
      location: { kind: "free", position: { ...OBJECT_START } },
    });

    const navigation = createNavigation();
    const knowledge = new ResidentMaterialKnowledge(RESIDENT_ID, [OBJECT_ID], world);
    knowledge.sample();
    expect(knowledge.observation(OBJECT_ID)).toMatchObject({ currentlyVisible: true });

    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 8,
      terminalOutcomeArchiveLimit: 8,
    });
    const matterScope = new ResidentLifeMatterScope(kernel);
    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const authority = new ResidentWorldExecutionAuthority(RESIDENT_ID, arbitrator, world);
    const lifeIntentOwner = new ResidentLifeIntentOwner(resident);
    const choiceReviewBridge = new ResidentLifeChoiceReviewBridge(resident);
    const outcomeReviewBridge = new ResidentLifeOutcomeReviewBridge(resident);
    const materialRelevance = new ResidentMaterialMatterRelevanceBridge(resident, kernel);

    const oldOrigin = kernel.recordEvidence({
      id: "evidence:janek:r6:endogenous-competing:old-origin",
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
      taskId: "task.janek.r6.endogenous-competing.old-material",
      runId: OLD_RUN_ID,
    });
    expect(arbitrator.request(OLD_RUN_ID)).toEqual({
      status: "acquired",
      runId: OLD_RUN_ID,
    });

    // World truth changes independently. Janek still has the previously acquired
    // private sight fact until his local knowledge samples again.
    world.addPlayer(RELOCATOR_ID, { ...OBJECT_START }, { maxSpeed: 100_000 });
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
      throw new Error(`old material run unexpectedly ended as ${blocked.status}`);
    }

    const oldReconciliation = kernel.reconcileRunOutcome({
      runId: OLD_RUN_ID,
      tick: blocked.materialOutcome?.tick ?? world.tick,
      status: "blocked",
      summary: "blocked: factual material pickup returned object_unavailable",
    });
    expect(oldReconciliation.status).toBe("recorded");
    if (oldReconciliation.status !== "recorded") {
      throw new Error("old material blocked outcome was not recorded");
    }
    const oldOutcome = oldReconciliation.evidence;
    kernel.resolveMatter(OLD_MATTER_ID);
    authority.enforceMotionAuthority();
    expect(kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    // Normal private sampling now learns only that the familiar object is not
    // currently visible; hidden holder/world coordinates are not imported.
    knowledge.sample();
    expect(knowledge.observation(OBJECT_ID)).toMatchObject({ currentlyVisible: false });

    // B is ordinary resident life already underway. It is a carrier, not one of the
    // final competing futures.
    const carrierOrigin = kernel.recordEvidence({
      id: "evidence:janek:r6:endogenous-competing:carrier-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "Janek has an ordinary current reason to visit the familiar workshop.",
    });
    kernel.openMatter({
      id: CARRIER_MATTER_ID,
      originEvidenceId: carrierOrigin.id,
      semanticCourse: "visit the familiar workshop",
      semanticIntent: {
        kind: "travel_region",
        goal: "visit the familiar workshop",
        targetRegionId: WORKSHOP,
      },
    });
    matterScope.track(CARRIER_MATTER_ID);
    kernel.bindRun({
      matterId: CARRIER_MATTER_ID,
      taskId: "task.janek.r6.endogenous-competing.carrier",
      runId: CARRIER_RUN_ID,
    });
    expect(arbitrator.request(CARRIER_RUN_ID)).toEqual({
      status: "acquired",
      runId: CARRIER_RUN_ID,
    });

    // While B really owns the body, the external actor returns the exact same object
    // into Janek's sight. This is a World event, not fixture-owned life JSON.
    moveActorOneTick(world, RELOCATOR_ID, { ...OBJECT_RETURN });
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "place",
      objectId: OBJECT_ID,
      position: { ...OBJECT_RETURN },
    }).status).toBe("succeeded");

    const sampled = sampleRecognizedMaterialObservation(knowledge, OBJECT_ID);
    expect(sampled.previous).toMatchObject({ currentlyVisible: false });
    expect(sampled.current).toMatchObject({ currentlyVisible: true });

    const opportunityLife = currentLife(kernel, matterScope, focus, arbitrator);
    const opportunity = materialRelevance.observeReacquisition(
      sampled.previous,
      sampled.current,
      opportunityLife,
    );
    expect(opportunity).toMatchObject({
      status: "fresh_opportunity",
      priorMatterId: OLD_MATTER_ID,
      objectId: OBJECT_ID,
      priorOutcomeEvidence: { id: oldOutcome.id },
    });
    if (opportunity.status !== "fresh_opportunity") {
      throw new Error(`unexpected material relevance outcome: ${opportunity.status}`);
    }

    const materialBatch = waitForCognitionBatch(resident, world);
    expect(materialBatch.reasons).toContainEqual(expect.objectContaining({
      id: opportunity.reasonId,
      kind: "direct_world_change",
      evidenceIds: [opportunity.evidence.id, oldOutcome.id],
    }));

    const materialLife = currentLife(kernel, matterScope, focus, arbitrator);
    const materialAttempt = lifeIntentOwner.prepare(
      materialBatch,
      materialLife,
      world.tick,
    );
    if (!materialAttempt) throw new Error("fresh material future was not prepared");

    const materialProposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "the exact reacquired familiar crate is worth one new bounded attempt",
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

    const reasonCommitments = new ResidentCausalReasonCommitmentAuthority({
      residentId: RESIDENT_ID,
      resident,
      world,
      navigation,
      kernel,
      arbitrator,
      authority,
      materialKnowledge: knowledge,
      matterScope,
      identityNamespace: "janek",
    });
    const materialSettlement = lifeIntentOwner.settleCommitmentIntent(
      materialAttempt,
      materialProposal,
      currentLife(kernel, matterScope, focus, arbitrator),
      world.tick,
      (proposal, providerContext) => reasonCommitments.groundCommitment({
        attempt: materialAttempt,
        originReasonId: opportunity.reasonId,
        proposal,
        providerContext,
        groundingContext: resident.cognitionContext(materialBatch, world.tick),
      }),
    );
    expect(materialSettlement.status).toBe("applied");
    if (materialSettlement.status !== "applied") {
      throw new Error(`fresh material decision failed: ${materialSettlement.status}`);
    }

    const materialFuture = reasonCommitments.materializeCommitment({
      attempt: materialAttempt,
      originReasonId: opportunity.reasonId,
      proposal: materialSettlement.proposal,
      intent: materialSettlement.intent,
      tick: world.tick,
    });
    expect(materialFuture.matter.id).not.toBe(OLD_MATTER_ID);
    expect(materialFuture.matter).toMatchObject({
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
    expect(kernel.historicalSupportEvidence(materialFuture.matter.id)).toEqual([{
      relation: "prior_same_material_outcome",
      sourceMatterId: OLD_MATTER_ID,
      evidence: oldOutcome,
    }]);
    expect(materialFuture.focusClaim).toEqual({
      status: "busy",
      runId: materialFuture.runId,
      focusedRunId: CARRIER_RUN_ID,
    });
    expect(arbitrator.deferredRunIds()).toEqual([materialFuture.runId]);
    expect(kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    // Ordinary unrelated factual life now advances enough to evict A from the bounded
    // recent-evidence window. C remains current, so its exact causal provenance keeps
    // only A's factual task outcome pinned; the old matter itself must disappear from
    // current life before the later C-vs-D ambiguity is formed.
    for (let index = 0; index < 12; index += 1) {
      kernel.recordEvidence({
        id: `evidence:janek:r6:endogenous-competing:unrelated-churn:${index}`,
        tick: world.tick + index + 1,
        kind: "later_life",
        summary: `ordinary unrelated factual life after material future creation ${index}`,
      });
    }
    expect(kernel.recentEvidenceSnapshot().some(
      (evidence) => evidence.id === oldOutcome.id,
    )).toBe(false);
    expect(kernel.archivedTerminalOutcomeEvidence(OLD_MATTER_ID)).toEqual(oldOutcome);
    const delayedLife = currentLife(kernel, matterScope, focus, arbitrator);
    expect(delayedLife.matters.some((matter) => matter.id === OLD_MATTER_ID)).toBe(false);
    expect(delayedLife.matters.find(
      (matter) => matter.id === materialFuture.matter.id,
    )).toMatchObject({
      historicalSupport: [{
        relation: "prior_same_material_outcome",
        sourceMatterId: OLD_MATTER_ID,
        evidence: { id: oldOutcome.id, kind: "task_outcome" },
      }],
    });

    // B now completes factually. We intentionally do NOT call reconcile() at this
    // boundary: C is already a legal deferred future, and normal semantic handling of
    // B's own factual outcome is allowed to generate D before policy chooses a body owner.
    const carrierExecutor = new ResidentGroundedTravelExecutor(
      CARRIER_RUN_ID,
      { ...WORKSHOP_POINT },
      authority,
      world,
    );
    const carrierTerminal = runTravelToTerminal(carrierExecutor, world);
    expect(carrierTerminal.status).toBe("arrived");
    if (carrierTerminal.status !== "arrived") {
      throw new Error(`carrier travel failed: ${carrierTerminal.status}`);
    }
    const carrierReconciliation = kernel.reconcileRunOutcome({
      runId: CARRIER_RUN_ID,
      tick: world.tick,
      status: "succeeded",
      summary: "arrived at the familiar workshop through the ordinary carrier future",
    });
    expect(carrierReconciliation.status).toBe("recorded");
    if (carrierReconciliation.status !== "recorded") {
      throw new Error("carrier factual outcome was not recorded");
    }
    const carrierOutcome = carrierReconciliation.evidence;
    kernel.resolveMatter(CARRIER_MATTER_ID);
    authority.enforceMotionAuthority();
    expect(focus.focusedRun()).toBeNull();
    expect(arbitrator.deferredRunIds()).toEqual([materialFuture.runId]);

    // D is endogenous: it is generated from B's own exact factual completed outcome,
    // not fresh speech, a direct command or authored personality prose.
    expect(outcomeReviewBridge.observe(carrierOutcome, world.tick)).toEqual({
      status: "scheduled",
      outcomeEvidenceId: carrierOutcome.id,
    });
    const outcomeBatch = waitForCognitionBatch(resident, world);
    const outcomeReason = outcomeBatch.reasons.find(
      (reason) => reason.kind === "activity_completed"
        && reason.evidenceIds.includes(carrierOutcome.id),
    );
    expect(outcomeReason).toBeDefined();
    if (!outcomeReason) throw new Error("carrier outcome did not generate semantic pressure");
    expect(outcomeBatch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);

    const outcomeLife = currentLife(kernel, matterScope, focus, arbitrator);
    const outcomeAttempt = lifeIntentOwner.prepare(
      outcomeBatch,
      outcomeLife,
      world.tick,
    );
    if (!outcomeAttempt) throw new Error("carrier outcome future was not prepared");

    const ordinaryFutureProposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "after reaching the workshop, continue with one ordinary visit to the familiar fields",
        intent: {
          kind: "travel" as const,
          goal: "visit the familiar fields",
          targetActorId: null,
          targetRegionId: FIELDS,
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };

    const outcomeCommitments = new ResidentCausalOutcomeTravelCommitmentAuthority({
      residentId: RESIDENT_ID,
      resident,
      world,
      navigation,
      kernel,
      arbitrator,
      authority,
      matterScope,
      identityNamespace: "janek",
    });
    const ordinarySettlement = lifeIntentOwner.settleCommitmentIntent(
      outcomeAttempt,
      ordinaryFutureProposal,
      currentLife(kernel, matterScope, focus, arbitrator),
      world.tick,
      (proposal, providerContext) => outcomeCommitments.groundLifeOutcomeCommitment({
        attempt: outcomeAttempt,
        sourceMatterId: CARRIER_MATTER_ID,
        proposal,
        providerContext,
        groundingContext: resident.cognitionContext(outcomeBatch, world.tick),
      }),
    );
    expect(ordinarySettlement.status).toBe("applied");
    if (ordinarySettlement.status !== "applied") {
      throw new Error(`ordinary outcome future failed: ${ordinarySettlement.status}`);
    }

    const ordinaryFuture = outcomeCommitments.materializeLifeOutcomeCommitment({
      attempt: outcomeAttempt,
      sourceMatterId: CARRIER_MATTER_ID,
      proposal: ordinarySettlement.proposal,
      intent: ordinarySettlement.intent,
      tick: world.tick,
    });
    expect(ordinaryFuture.matter).toMatchObject({
      status: "active",
      semanticIntent: {
        kind: "travel_region",
        targetRegionId: FIELDS,
      },
    });
    // Free body + one already-deferred legal C means later D joins ambiguity instead
    // of winning because it happened to arrive later.
    expect(ordinaryFuture.focusClaim).toEqual({
      status: "deferred",
      runId: ordinaryFuture.runId,
    });
    expect(focus.focusedRun()).toBeNull();

    const candidateRunIds = [materialFuture.runId, ordinaryFuture.runId]
      .sort((left, right) => left.localeCompare(right));
    expect(arbitrator.deferredRunIds()).toEqual(candidateRunIds);

    const arbitration = arbitrator.reconcile();
    expect(arbitration).toEqual({
      status: "choice_required",
      candidateRunIds,
    });
    expect(choiceReviewBridge.observe(arbitration, world.tick)).toEqual({
      status: "scheduled",
      candidateRunIds,
    });

    const choiceBatch = waitForCognitionBatch(resident, world);
    expect(choiceBatch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);
    const choiceReason = choiceBatch.reasons.find((reason) => (
      reason.kind === "uncertainty"
      && [...reason.evidenceIds].sort((a, b) => a.localeCompare(b))
        .every((id, index) => id === candidateRunIds[index])
      && reason.evidenceIds.length === candidateRunIds.length
    ));
    expect(choiceReason).toBeDefined();

    const choiceLife = currentLife(kernel, matterScope, focus, arbitrator);
    const choiceOwner = new ResidentLifeChoiceOwner(resident, world.options.fixedDeltaSeconds);
    const choiceAttempt = choiceOwner.prepare(choiceBatch, choiceLife);
    if (!choiceAttempt) throw new Error("endogenous competing-future choice was not prepared");

    expect(choiceAttempt.candidateMatterIds).toEqual(
      [materialFuture.matter.id, ordinaryFuture.matter.id]
        .sort((left, right) => left.localeCompare(right)),
    );
    expect(choiceAttempt.context.self).toBeUndefined();

    // A is no longer current life and is not smuggled back into the provider context.
    // Its exact factual outcome survives only as typed provenance on current C.
    expect(choiceAttempt.context.life.matters.some(
      (matter) => matter.id === OLD_MATTER_ID,
    )).toBe(false);
    expect(choiceAttempt.context.life.matters.find(
      (matter) => matter.id === materialFuture.matter.id,
    )).toMatchObject({
      historicalSupport: [{
        relation: "prior_same_material_outcome",
        sourceMatterId: OLD_MATTER_ID,
        evidence: {
          id: oldOutcome.id,
          kind: "task_outcome",
        },
      }],
    });

    const materialSupport = choiceAttempt.candidateSupports.find(
      (candidate) => candidate.matterId === materialFuture.matter.id,
    );
    const ordinarySupport = choiceAttempt.candidateSupports.find(
      (candidate) => candidate.matterId === ordinaryFuture.matter.id,
    );
    expect(materialSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: oldOutcome.id,
        sourceMatterId: OLD_MATTER_ID,
        relation: "prior_same_material_outcome",
      }),
      expect.objectContaining({
        relation: "matter_origin",
      }),
    ]));
    expect(ordinarySupport?.facts.some((fact) => fact.evidenceId === oldOutcome.id)).toBe(false);

    // Comparative attribution stays legal in either direction, while ordinary
    // cross-candidate origins remain forbidden.
    expect(allowedChoiceSupportEvidenceIds(
      choiceAttempt.candidateSupports,
      materialFuture.matter.id,
    )).toContain(oldOutcome.id);
    expect(allowedChoiceSupportEvidenceIds(
      choiceAttempt.candidateSupports,
      ordinaryFuture.matter.id,
    )).toContain(oldOutcome.id);

    // Coherent non-action remains an admissible behavior. This proves the runtime
    // chain generated an actual choice boundary rather than secretly hard-coding C.
    expect(choiceOwner.settle(
      choiceAttempt,
      {
        version: 1,
        decision: {
          kind: "defer_all",
          reason: "both futures are legal, but neither needs the body this instant",
          reviewAfterSeconds: 12,
        },
      },
      choiceLife,
      world.tick,
    )).toMatchObject({
      status: "applied",
      decision: { kind: "defer_all" },
    });
    expect(focus.focusedRun()).toBeNull();
    expect(arbitrator.deferredRunIds()).toEqual(candidateRunIds);

    // The old episode never reopens anywhere in the chain.
    expect(kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });
});

function createWorld() {
  return new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_600, maxY: 500 },
    regions: [
      { id: YARD, label: "Yard", minX: 0, minY: 0, maxX: 499, maxY: 500 },
      { id: WORKSHOP, label: "Workshop", minX: 500, minY: 0, maxX: 999, maxY: 500 },
      { id: FIELDS, label: "Fields", minX: 1_000, minY: 0, maxX: 1_600, maxY: 500 },
    ],
    anchors: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
}

function createNavigation() {
  return new RegionNavigationGraph(
    [
      { id: YARD, destinationPoint: { ...YARD_POINT } },
      { id: WORKSHOP, destinationPoint: { ...WORKSHOP_POINT } },
      { id: FIELDS, destinationPoint: { ...FIELDS_POINT } },
    ],
    [
      ...bidirectionalEdge(YARD, WORKSHOP, 1),
      ...bidirectionalEdge(WORKSHOP, FIELDS, 1),
    ],
  );
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
  if (!batch) throw new Error("resident cognition batch did not become ready");
  return batch;
}

function runTravelToTerminal(
  executor: ResidentGroundedTravelExecutor,
  world: SpcWorldRuntime,
) {
  let step = executor.step();
  for (let guard = 0; step.status === "running" && guard < 1_200; guard += 1) {
    world.step();
    step = executor.step();
  }
  return step;
}
