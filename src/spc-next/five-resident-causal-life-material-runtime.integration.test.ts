import { describe, expect, it } from "vitest";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import {
  createFiveResidentRegionComposition,
  FIVE_RESIDENT_MATERIAL_OBJECTS,
} from "./five-resident-region";

const JANEK_ID = "resident.janek";
const CRATE_ID = FIVE_RESIDENT_MATERIAL_OBJECTS[0]!.id;
const RELOCATOR_ID = "player.r6-main-runtime-material-relocator";
const OLD_MATTER_ID = "matter.janek.r6.main-runtime.old-material";
const OLD_RUN_ID = "run.janek.r6.main-runtime.old-material";

describe("five-resident causal life material continuity", () => {
  it("reaches post-terminal material relevance and factual retry through the main five-resident runtime", () => {
    const composition = createFiveResidentRegionComposition();
    const runtime = new FiveResidentCausalLifeRuntime(composition);
    const { world } = composition;
    const janek = composition.runtimes[JANEK_ID];
    const life = runtime.life(JANEK_ID);
    if (!life) throw new Error("Janek recovered life was not claimed");

    expect(life.materialKnowledge?.observation(CRATE_ID)).toMatchObject({
      objectId: CRATE_ID,
      currentlyVisible: true,
    });

    // External World truth removes the exact object after Janek has privately seen it.
    const crate = world.materialObject(CRATE_ID);
    if (!crate || crate.location.kind !== "free") throw new Error("baseline crate is not free");
    world.addPlayer(RELOCATOR_ID, crate.location.position, { maxSpeed: 100_000 });
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "pickup",
      objectId: CRATE_ID,
    }).status).toBe("succeeded");
    moveActorOneTick(world, RELOCATOR_ID, { x: 3_000, y: 720 });
    const farRelocator = actorPosition(world, RELOCATOR_ID);
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "place",
      objectId: CRATE_ID,
      position: farRelocator,
    }).status).toBe("succeeded");

    // Bounded authored seed A: one resident-owned material matter. Everything after
    // its factual execution failure is exercised through the main runtime composition.
    const origin = life.kernel.recordEvidence({
      id: "evidence:janek:r6:main-runtime:old-material-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "Janek makes one bounded attempt for the familiar workshop crate.",
    });
    life.kernel.openMatter({
      id: OLD_MATTER_ID,
      originEvidenceId: origin.id,
      semanticCourse: "try the familiar workshop crate once",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try the familiar workshop crate once",
        objectId: CRATE_ID,
      },
    });
    life.matterScope.track(OLD_MATTER_ID);
    life.kernel.bindRun({
      matterId: OLD_MATTER_ID,
      taskId: "task.janek.r6.main-runtime.old-material",
      runId: OLD_RUN_ID,
    });
    expect(life.arbitrator.request(OLD_RUN_ID)).toEqual({
      status: "acquired",
      runId: OLD_RUN_ID,
    });

    let blockedOutcomeId: string | null = null;
    for (let guard = 0; guard < 420 && blockedOutcomeId === null; guard += 1) {
      const tick = runtime.advanceOneWorldTick();
      const step = tick.execution[JANEK_ID];
      if (step?.status !== "blocked") continue;
      expect(step).toMatchObject({
        matterId: OLD_MATTER_ID,
        runId: OLD_RUN_ID,
      });
      blockedOutcomeId = step.outcomeEvidence.id;
    }
    if (!blockedOutcomeId) throw new Error("main runtime never reached factual material blockage");

    expect(life.kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "active",
      activeRunId: null,
      lastOutcomeEvidenceId: blockedOutcomeId,
    });
    expect(life.materialKnowledge?.observation(CRATE_ID)).toMatchObject({
      currentlyVisible: false,
    });

    // The old episode is semantically finished. Terminalization must archive factual
    // provenance without keeping the old work alive.
    life.kernel.resolveMatter(OLD_MATTER_ID);
    life.worldAuthority.enforceMotionAuthority();
    expect(life.kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(life.kernel.archivedTerminalOutcomeEvidence(OLD_MATTER_ID)).toMatchObject({
      id: blockedOutcomeId,
      kind: "task_outcome",
      summary: expect.stringContaining("blocked:"),
    });

    // World returns the exact same object near Janek. No speech or direct request is
    // issued; main runtime post-World sampling must detect the private reacquisition.
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "pickup",
      objectId: CRATE_ID,
    }).status).toBe("succeeded");
    const janekPosition = actorPosition(world, JANEK_ID);
    moveActorOneTick(world, RELOCATOR_ID, {
      x: janekPosition.x + 30,
      y: janekPosition.y,
    });
    const returnedRelocator = actorPosition(world, RELOCATOR_ID);
    expect(world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "place",
      objectId: CRATE_ID,
      position: returnedRelocator,
    }).status).toBe("succeeded");

    let opportunity: Extract<
      NonNullable<ReturnType<FiveResidentCausalLifeRuntime["advanceOneWorldTick"]>["materialRelevance"][typeof JANEK_ID]>[number],
      { status: "fresh_opportunity" }
    > | null = null;
    for (let guard = 0; guard < 20 && !opportunity; guard += 1) {
      const tick = runtime.advanceOneWorldTick();
      const observed = tick.materialRelevance[JANEK_ID] ?? [];
      const found = observed.find((entry) => entry.status === "fresh_opportunity");
      if (found?.status === "fresh_opportunity") opportunity = found;
    }
    if (!opportunity) throw new Error("main runtime did not surface material reacquisition opportunity");
    expect(opportunity).toMatchObject({
      priorMatterId: OLD_MATTER_ID,
      objectId: CRATE_ID,
      priorOutcomeEvidence: { id: blockedOutcomeId },
    });
    expect(life.kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    const prepared = waitForJanekLifeIntent(runtime);
    expect(prepared.batch.reasons.some((reason) => reason.id === opportunity!.reasonId)).toBe(true);
    expect(prepared.batch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "the exact familiar crate is back, so one new bounded attempt is worth taking",
        intent: {
          kind: "acquire_material_object" as const,
          goal: "try to acquire the familiar workshop crate again",
          objectId: CRATE_ID,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };
    const settlement = life.lifeIntentOwner.settleCommitmentIntent(
      prepared.prepared.attempt,
      proposal,
      life.currentLifeView(),
      world.tick,
      (admittedProposal, providerContext) => life.reasonCommitments.groundCommitment({
        attempt: prepared.prepared.attempt,
        originReasonId: opportunity!.reasonId,
        proposal: admittedProposal,
        providerContext,
        groundingContext: janek.cognitionContext(prepared.batch, world.tick),
      }),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") {
      throw new Error(`main-runtime material commitment was not admitted: ${settlement.status}`);
    }

    const accepted = life.reasonCommitments.materializeCommitment({
      attempt: prepared.prepared.attempt,
      originReasonId: opportunity.reasonId,
      proposal: settlement.proposal,
      intent: settlement.intent,
      tick: world.tick,
    });
    expect(accepted.matter.id).not.toBe(OLD_MATTER_ID);
    expect(accepted.matter).toMatchObject({
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: CRATE_ID,
      },
      historicalSupport: [{
        relation: "prior_same_material_outcome",
        sourceMatterId: OLD_MATTER_ID,
        evidenceId: blockedOutcomeId,
      }],
    });
    expect(life.kernel.historicalSupportEvidence(accepted.matter.id)).toEqual([
      expect.objectContaining({
        relation: "prior_same_material_outcome",
        sourceMatterId: OLD_MATTER_ID,
        evidence: expect.objectContaining({ id: blockedOutcomeId }),
      }),
    ]);

    let completedMatterId: string | null = null;
    for (let guard = 0; guard < 180 && completedMatterId === null; guard += 1) {
      const tick = runtime.advanceOneWorldTick();
      const step = tick.execution[JANEK_ID];
      if (step?.status === "completed") completedMatterId = step.matterId;
      if (step?.status === "unsupported_intent") {
        throw new Error(`main runtime still treats material future as unsupported: ${step.intentKind}`);
      }
    }
    expect(completedMatterId).toBe(accepted.matter.id);
    expect(world.materialObject(CRATE_ID)).toMatchObject({
      location: { kind: "held", actorId: JANEK_ID },
    });
    expect(life.kernel.matter(OLD_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(life.kernel.matter(accepted.matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(life.kernel.matter(accepted.matter.id)?.historicalSupport).toBeUndefined();
    expect(life.kernel.historicalSupportEvidence(accepted.matter.id)).toEqual([]);
  });
});

function waitForJanekLifeIntent(runtime: FiveResidentCausalLifeRuntime) {
  for (let guard = 0; guard < 240; guard += 1) {
    const prepared = runtime.takeReadyLifeIntentAttempts()
      .find((entry) => entry.residentId === JANEK_ID);
    if (prepared) return prepared;
    runtime.advanceOneWorldTick();
  }
  throw new Error("Janek never produced a ready main-runtime life-intent attempt");
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
