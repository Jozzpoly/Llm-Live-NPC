import { describe, expect, it } from "vitest";
import { distanceSquared, type ResidentActivity, type Vec2 } from "./contracts";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalCommunicateCommitmentAuthority } from "./resident-causal-communicate-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { deriveResidentLifeChoiceCandidateSupports } from "./resident-life-choice-causal-support";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentMessageDeliveryExecutor } from "./resident-message-delivery-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const IDA_ID = "resident.ida";
const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const MESSAGE = "Mira says the field well needs checking before dusk.";
const MAX_CONTACT_STEPS = 1_100;
const MAX_DELIVERY_STEPS = 1_300;

describe("Ida cognition-native causal message commitment", () => {
  it("accepts responsibility from private speech, creates local social continuity, and resolves only after factual World delivery", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];

    // Prehistory establishes only legal private identity/contact with Janek.
    establishIdaJanekContact(world, ida);

    const kernel = new ResidentContinuityKernel();
    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const worldAuthority = new ResidentWorldExecutionAuthority(IDA_ID, arbitrator, world);
    const lifeIntentOwner = new ResidentLifeIntentOwner(ida);
    const causal = new ResidentCausalCommunicateCommitmentAuthority({
      residentId: IDA_ID,
      resident: ida,
      world,
      kernel,
      arbitrator,
      authority: worldAuthority,
    });

    const playerPosition = actorPosition(world, PLAYER_ID);
    const idaPosition = actorPosition(world, IDA_ID);
    // Keep the request physically causal instead of relying on fixture-global hearing.
    if (distanceSquared(playerPosition, idaPosition) > 300 ** 2) {
      movePlayerNear(world, idaPosition);
    }

    const occurrence = world.speak(
      PLAYER_ID,
      `Ida, proszę przekaż Jankowi dokładnie: "${MESSAGE}"`,
      420,
      [IDA_ID],
    );
    world.step();

    let batch = ida.takeCognitionBatch(world.tick);
    for (let step = 0; step < 240 && !batch; step += 1) {
      world.step();
      batch = ida.takeCognitionBatch(world.tick);
    }
    expect(batch).not.toBeNull();
    if (!batch) return;

    const life = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: causal.acceptedMatterIds(),
    });
    const attempt = lifeIntentOwner.prepare(batch, life);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    expect(attempt.context.knownActors).toContainEqual(expect.objectContaining({
      id: JANEK_ID,
      lastKnownPosition: expect.any(Object),
    }));
    const requestPercept = attempt.context.recentPercepts.find(
      (percept) => percept.occurrenceId === occurrence.id,
    );
    expect(requestPercept).toMatchObject({
      phenomenon: "speech",
      modality: "hearing",
      addressed: true,
      text: occurrence.text,
    });

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "I accept responsibility for delivering the exact message to Janek",
        intent: {
          kind: "communicate" as const,
          goal: "deliver the accepted message to Janek",
          targetActorId: JANEK_ID,
          targetRegionId: null,
          targetPosition: null,
          text: MESSAGE,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };

    const settlement = lifeIntentOwner.settleCommitmentIntent(
      attempt,
      proposal,
      captureResidentLifeCognitionView({
        kernel,
        focus,
        arbitrator,
        matterIds: causal.acceptedMatterIds(),
      }),
      world.tick,
      (admittedProposal, providerContext) => causal.groundPrivateSpeechCommitment({
        attempt,
        occurrence,
        proposal: admittedProposal,
        providerContext,
        groundingContext: ida.cognitionContext(batch),
      }),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") return;

    const accepted = causal.materializePrivateSpeechCommitment({
      attempt,
      occurrence,
      proposal: settlement.proposal,
      intent: settlement.intent,
    });

    expect(accepted.matter.id).toContain("matter.ida.causal.");
    expect(accepted.runId).toContain("run.ida.causal.");
    expect(accepted.matter).toMatchObject({
      status: "active",
      semanticIntent: {
        kind: "communicate_actor",
        goal: "deliver the accepted message to Janek",
        targetActorId: JANEK_ID,
        text: MESSAGE,
      },
    });
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });
    expect(kernel.canRunMutateWorld(accepted.runId)).toBe(true);

    const obligationLife = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: causal.acceptedMatterIds(),
    });
    expect(obligationLife.matters).toContainEqual(expect.objectContaining({
      id: accepted.matter.id,
      originEvidence: expect.objectContaining({
        kind: "accepted_social_commitment",
      }),
    }));
    expect(deriveResidentLifeChoiceCandidateSupports(
      obligationLife,
      [accepted.matter.id],
    )).toEqual([
      expect.objectContaining({
        matterId: accepted.matter.id,
        facts: expect.arrayContaining([
          expect.objectContaining({
            evidenceId: obligationLife.matters.find(
              (matter) => matter.id === accepted.matter.id,
            )?.originEvidence?.id,
            evidenceKind: "accepted_social_commitment",
            relation: "open_social_responsibility",
          }),
        ]),
      }),
    ]);

    const durableIntent = accepted.matter.semanticIntent;
    expect(durableIntent?.kind).toBe("communicate_actor");
    if (!durableIntent || durableIntent.kind !== "communicate_actor") {
      throw new Error("Ida social commitment lost communicate-actor meaning");
    }

    const executor = new ResidentMessageDeliveryExecutor(
      accepted.runId,
      durableIntent.targetActorId,
      durableIntent.text,
      (actorId) => ida.cognitionContext({
        residentId: IDA_ID,
        requestedAtTick: world.tick,
        reasons: [],
      }).knownActors.find((actor) => actor.id === actorId) ?? null,
      worldAuthority,
      world,
    );

    let delivered = null;
    for (let step = 0; step < MAX_DELIVERY_STEPS; step += 1) {
      const local = executor.step();
      if (local.status === "delivered") {
        delivered = local;
        break;
      }
      expect(local.status).toBe("running");
      world.step();
    }
    expect(delivered).not.toBeNull();
    if (!delivered || delivered.status !== "delivered") return;
    expect(delivered.occurrence).toMatchObject({
      kind: "speech",
      actorId: IDA_ID,
      text: MESSAGE,
      addressedActorIds: [JANEK_ID],
    });

    const reconciled = kernel.reconcileRunOutcome({
      runId: accepted.runId,
      tick: delivered.occurrence.tick,
      status: "succeeded",
      summary: `Ida factually delivered accepted message through ${delivered.occurrence.id}`,
    });
    expect(reconciled.status).toBe("recorded");
    kernel.resolveMatter(accepted.matter.id);
    expect(kernel.matter(accepted.matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    const fulfilledLife = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: causal.acceptedMatterIds(),
    });
    const fulfilledSupport = deriveResidentLifeChoiceCandidateSupports(
      fulfilledLife,
      [accepted.matter.id],
    );
    expect(fulfilledSupport[0]?.facts).toEqual([
      expect.objectContaining({
        evidenceKind: "task_outcome",
        relation: "last_outcome",
        summary: expect.stringContaining("succeeded:"),
      }),
    ]);
    expect(fulfilledSupport[0]?.facts.some(
      (fact) => fact.relation === "open_social_responsibility",
    )).toBe(false);
    expect(fulfilledSupport[0]?.facts.some(
      (fact) => fact.evidenceKind === "accepted_social_commitment",
    )).toBe(false);
  });
});

function establishIdaJanekContact(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  ida: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
) {
  const janekPosition = actorPosition(world, JANEK_ID);
  world.setResidentActivity(IDA_ID, travelActivity("ida-contact", janekPosition, "physically meet Janek"));
  let seen = false;
  for (let step = 0; step < MAX_CONTACT_STEPS; step += 1) {
    world.step();
    const contact = ida.cognitionContext({
      residentId: IDA_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).knownActors.find((actor) => actor.id === JANEK_ID);
    if (contact?.currentlyVisible) {
      seen = true;
      break;
    }
  }
  if (!seen) throw new Error("Ida never legally acquired Janek identity/contact");

  // Return to Ida's familiar crossroads area so delivery later requires reacquisition.
  const crossroads = { x: 3_050, y: 880 };
  world.setResidentActivity(IDA_ID, travelActivity("ida-retreat", crossroads, "return after contact"));
  for (let step = 0; step < MAX_CONTACT_STEPS; step += 1) {
    world.step();
    const position = actorPosition(world, IDA_ID);
    const contact = ida.cognitionContext({
      residentId: IDA_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).knownActors.find((actor) => actor.id === JANEK_ID);
    if (distanceSquared(position, crossroads) <= 20 ** 2 && contact && !contact.currentlyVisible) {
      world.setResidentActivity(IDA_ID, idleActivity("ida-after-contact"));
      world.step();
      return;
    }
  }
  throw new Error("Ida did not retreat while preserving stale Janek contact");
}

function movePlayerNear(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  target: Vec2,
) {
  for (let step = 0; step < 900; step += 1) {
    const current = actorPosition(world, PLAYER_ID);
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 120) {
      world.setActorMotionIntent(PLAYER_ID, { x: 0, y: 0 });
      world.step();
      return;
    }
    world.setActorMotionIntent(PLAYER_ID, {
      x: (dx / distance) * 150,
      y: (dy / distance) * 150,
    });
    world.step();
  }
  throw new Error("player never physically reached Ida");
}

function actorPosition(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  actorId: string,
): Vec2 {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`missing actor ${actorId}`);
  return { ...actor.position };
}

function travelActivity(id: string, targetPosition: Vec2, reason: string): ResidentActivity {
  return {
    id: `activity:${id}`,
    kind: "travel",
    targetActorId: null,
    targetPosition: { ...targetPosition },
    text: null,
    speed: 110,
    reason,
  };
}

function idleActivity(id: string): ResidentActivity {
  return {
    id: `activity:${id}`,
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "hold after legal contact prehistory",
  };
}
