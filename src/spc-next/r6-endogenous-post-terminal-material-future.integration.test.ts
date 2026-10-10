import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { ResidentCausalReasonCommitmentAuthority } from "./resident-causal-reason-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
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
const OBJECT_ID = "crate.r6.endogenous-material";
const OLD_MATTER_ID = "matter.janek.r6.endogenous-material.old";
const OLD_RUN_ID = "run.janek.r6.endogenous-material.old";
const RELOCATOR_ID = "player.r6-material-relocator";

describe("R6 endogenous post-terminal material future", () => {
  it("turns real private reacquisition into a consciously accepted NEW matter and factual pickup without reopening old history", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 2_000, maxY: 1_000 },
      regions: [{
        id: "yard",
        label: "Yard",
        minX: 0,
        minY: 0,
        maxX: 2_000,
        maxY: 1_000,
      }],
      anchors: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    const resident = world.addResident(RESIDENT_ID, "Janek", { x: 120, y: 120 });
    world.familiarizeResidentWithRegions(RESIDENT_ID, ["yard"]);
    world.addMaterialObject({
      id: OBJECT_ID,
      label: "Familiar R6 Crate",
      radius: 18,
      location: { kind: "free", position: { x: 150, y: 120 } },
    });

    const knowledge = new ResidentMaterialKnowledge(RESIDENT_ID, [OBJECT_ID], world);
    knowledge.sample();
    expect(knowledge.observation(OBJECT_ID)).toMatchObject({ currentlyVisible: true });

    const kernel = new ResidentContinuityKernel();
    const scope = new ResidentLifeMatterScope(kernel);
    const origin = kernel.recordEvidence({
      id: "evidence:janek:r6:endogenous-material:old-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "Janek earlier made one bounded attempt involving the familiar crate.",
    });
    kernel.openMatter({
      id: OLD_MATTER_ID,
      originEvidenceId: origin.id,
      semanticCourse: "try the familiar crate once",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try the familiar crate once",
        objectId: OBJECT_ID,
      },
    });
    scope.track(OLD_MATTER_ID);
    kernel.bindRun({
      matterId: OLD_MATTER_ID,
      taskId: "task.janek.r6.endogenous-material.old",
      runId: OLD_RUN_ID,
    });

    // External World movement makes the recognized object unavailable before the
    // old attempt is factually reconciled.
    world.addPlayer(RELOCATOR_ID, { x: 150, y: 120 }, { maxSpeed: 100_000 });
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "pickup",
      objectId: OBJECT_ID,
    }).status).toBe("succeeded");
    world.setActorMotionIntent(RELOCATOR_ID, { x: 60_000, y: 0 });
    world.step();
    world.setActorMotionIntent(RELOCATOR_ID, { x: 0, y: 0 });
    const farRelocator = world.publicSnapshot().actors.find((actor) => actor.id === RELOCATOR_ID)!;
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "place",
      objectId: OBJECT_ID,
      position: farRelocator.position,
    }).status).toBe("succeeded");
    knowledge.sample();
    expect(knowledge.observation(OBJECT_ID)).toMatchObject({ currentlyVisible: false });

    const oldOutcome = kernel.reconcileRunOutcome({
      runId: OLD_RUN_ID,
      tick: world.tick,
      status: "blocked",
      summary: "blocked: factual material attempt returned object_unavailable",
    });
    expect(oldOutcome.status).toBe("recorded");
    kernel.resolveMatter(OLD_MATTER_ID);
    expect(kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const authority = new ResidentWorldExecutionAuthority(RESIDENT_ID, arbitrator, world);
    const relevance = new ResidentMaterialMatterRelevanceBridge(resident, kernel);

    // A later external World change returns the exact object to Janek's sight.
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "pickup",
      objectId: OBJECT_ID,
    }).status).toBe("succeeded");
    const relocatorBeforeReturn = world.publicSnapshot().actors.find(
      (actor) => actor.id === RELOCATOR_ID,
    )!;
    const returnTarget = { x: 180, y: 120 };
    const dt = world.options.fixedDeltaSeconds;
    world.setActorMotionIntent(RELOCATOR_ID, {
      x: (returnTarget.x - relocatorBeforeReturn.position.x) / dt,
      y: (returnTarget.y - relocatorBeforeReturn.position.y) / dt,
    });
    world.step();
    world.setActorMotionIntent(RELOCATOR_ID, { x: 0, y: 0 });
    const returnedRelocator = world.publicSnapshot().actors.find(
      (actor) => actor.id === RELOCATOR_ID,
    )!;
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "place",
      objectId: OBJECT_ID,
      position: returnedRelocator.position,
    }).status).toBe("succeeded");

    const sampled = sampleRecognizedMaterialObservation(knowledge, OBJECT_ID);
    expect(sampled.previous).toMatchObject({ currentlyVisible: false });
    expect(sampled.current).toMatchObject({ currentlyVisible: true });

    const lifeBeforeOpportunity = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: scope.matterIds(),
    });
    const opportunity = relevance.observeReacquisition(
      sampled.previous,
      sampled.current,
      lifeBeforeOpportunity,
    );
    expect(opportunity).toMatchObject({
      status: "fresh_opportunity",
      priorMatterId: OLD_MATTER_ID,
      objectId: OBJECT_ID,
      priorOutcomeEvidence: { id: oldOutcome.status === "recorded" ? oldOutcome.evidence.id : "" },
    });
    if (opportunity.status !== "fresh_opportunity") {
      throw new Error(`unexpected material opportunity: ${opportunity.status}`);
    }

    let batch = resident.takeCognitionBatch(world.tick);
    for (let wait = 0; !batch && wait < 180; wait += 1) {
      world.step();
      batch = resident.takeCognitionBatch(world.tick);
    }
    if (!batch) throw new Error("material reacquisition did not produce cognition");
    expect(batch.reasons).toContainEqual(expect.objectContaining({
      id: opportunity.reasonId,
      kind: "direct_world_change",
      evidenceIds: [opportunity.evidence.id, opportunity.priorOutcomeEvidence.id],
    }));

    const lifeAtDecision = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: scope.matterIds(),
    });
    const owner = new ResidentLifeIntentOwner(resident);
    const attempt = owner.prepare(batch, lifeAtDecision, world.tick);
    if (!attempt) throw new Error("material reacquisition life-intent attempt was not prepared");

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "the factual reacquisition makes one new bounded attempt worth taking",
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
      navigation: createFiveResidentNavigationGraph(),
      kernel,
      arbitrator,
      authority,
      materialKnowledge: knowledge,
      matterScope: scope,
      identityNamespace: "janek",
    });
    const settlement = owner.settleCommitmentIntent(
      attempt,
      proposal,
      lifeAtDecision,
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
      throw new Error(`material commitment failed admission: ${settlement.status}`);
    }

    // Semantic admission alone has still not created continuity/body authority.
    expect(kernel.matter(OLD_MATTER_ID)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(focus.focusedRun()).toBeNull();

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
    });
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });
    expect(focus.focusedRun()).toBe(accepted.runId);
    expect(kernel.matter(OLD_MATTER_ID)).toMatchObject({ status: "resolved", activeRunId: null });

    const executor = new ResidentMaterialPickupExecutor(
      accepted.runId,
      OBJECT_ID,
      knowledge,
      authority,
      world,
    );
    let local = executor.step();
    let guard = 0;
    while (local.status === "running" && guard < 300) {
      world.step();
      knowledge.sample();
      local = executor.step();
      guard += 1;
    }
    expect(local.status).toBe("succeeded");
    if (local.status !== "succeeded") {
      throw new Error(`new material future did not factually succeed: ${local.status}`);
    }
    const newOutcome = kernel.reconcileRunOutcome({
      runId: accepted.runId,
      tick: local.materialOutcome.tick,
      status: "succeeded",
      summary: `picked up ${OBJECT_ID} through the fresh post-terminal material matter`,
    });
    expect(newOutcome.status).toBe("recorded");
    kernel.resolveMatter(accepted.matter.id);
    authority.enforceMotionAuthority();

    expect(world.materialObject(OBJECT_ID)).toMatchObject({
      location: { kind: "held", actorId: RESIDENT_ID },
    });
    expect(kernel.matter(OLD_MATTER_ID)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(kernel.matter(accepted.matter.id)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(authority.recentActionFacts()).toContainEqual(expect.objectContaining({
      runId: accepted.runId,
      action: { kind: "material_pickup", objectId: OBJECT_ID },
      resolution: expect.objectContaining({
        status: "resolved",
        outcomeStatus: "succeeded",
      }),
    }));
  });
});
