import { describe, expect, it } from "vitest";
import { distanceSquared, type ResidentActivity, type Vec2 } from "./contracts";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalCommunicateCommitmentAuthority } from "./resident-causal-communicate-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentMessageDeliveryExecutor } from "./resident-message-delivery-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const IDA_ID = "resident.ida";
const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const MESSAGE = "Mira says the field well needs checking before dusk.";
const HIDDEN_JANEK_POSITION = { x: 1_200, y: 720 };
const MAX_STEPS = 1_500;

describe("Ida cognition-native social commitment relational epistemics", () => {
  it("blocks at stale private contact instead of oracle-tracking a secretly moved Janek, leaving the durable matter unresolved", () => {
    const fixture = prepareAcceptedMessageCommitment();
    const beforeHidden = knownJanek(fixture.ida, fixture.world.tick);
    expect(beforeHidden).toMatchObject({
      id: JANEK_ID,
      currentlyVisible: false,
      lastKnownPosition: expect.any(Object),
    });

    relocateJanekOutsideIdaKnowledge(fixture.world, HIDDEN_JANEK_POSITION);
    const afterHidden = knownJanek(fixture.ida, fixture.world.tick);
    expect(afterHidden).toEqual(beforeHidden);
    expect(actorPosition(fixture.world, JANEK_ID)).not.toEqual(beforeHidden?.lastKnownPosition);

    const durable = fixture.accepted.matter.semanticIntent;
    expect(durable?.kind).toBe("communicate_actor");
    if (!durable || durable.kind !== "communicate_actor") {
      throw new Error("social commitment lost durable communicate intent");
    }

    const executor = new ResidentMessageDeliveryExecutor(
      fixture.accepted.runId,
      durable.targetActorId,
      durable.text,
      (actorId) => fixture.ida.cognitionContext({
        residentId: IDA_ID,
        requestedAtTick: fixture.world.tick,
        reasons: [],
      }).knownActors.find((actor) => actor.id === actorId) ?? null,
      fixture.worldAuthority,
      fixture.world,
    );

    let terminal: ReturnType<typeof executor.step> | null = null;
    for (let step = 0; step < MAX_STEPS; step += 1) {
      terminal = executor.step();
      if (terminal.status !== "running") break;
      fixture.world.step();
    }

    expect(terminal).toMatchObject({
      status: "blocked",
      runId: fixture.accepted.runId,
      recipientId: JANEK_ID,
      reason: "recipient_absent_at_best_known_contact",
    });
    if (!terminal || terminal.status !== "blocked") return;

    expect(fixture.world.diagnostics().recentOccurrences.filter((occurrence) => (
      occurrence.kind === "speech"
      && occurrence.actorId === IDA_ID
      && occurrence.text === MESSAGE
    ))).toEqual([]);

    const reconciled = fixture.kernel.reconcileRunOutcome({
      runId: fixture.accepted.runId,
      tick: fixture.world.tick,
      status: "blocked",
      summary: terminal.reason,
    });
    expect(reconciled.status).toBe("recorded");
    expect(fixture.kernel.matter(fixture.accepted.matter.id)).toMatchObject({
      status: "active",
      activeRunId: null,
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: JANEK_ID,
        text: MESSAGE,
      },
    });
    expect(fixture.focus.focusedRun()).toBeNull();
    expect(fixture.worldAuthority.motionOwner()).toBeNull();
  });
});

function prepareAcceptedMessageCommitment() {
  const composition = createFiveResidentRegionComposition({
    playerStart: { x: 3_000, y: 900 },
  });
  const { world } = composition;
  const ida = composition.runtimes[IDA_ID];

  establishContactAndRetreat(world, ida);

  const kernel = new ResidentContinuityKernel();
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  const worldAuthority = new ResidentWorldExecutionAuthority(IDA_ID, arbitrator, world);
  const owner = new ResidentLifeIntentOwner(ida);
  const causal = new ResidentCausalCommunicateCommitmentAuthority({
    residentId: IDA_ID,
    resident: ida,
    world,
    kernel,
    arbitrator,
    authority: worldAuthority,
  });

  movePlayerNear(world, actorPosition(world, IDA_ID));
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
  if (!batch) throw new Error("Ida message cognition never became ready");

  const life = captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: causal.acceptedMatterIds(),
  });
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("Ida message cognition attempt was not prepared");

  const proposal = {
    version: 1 as const,
    commitmentDecision: {
      kind: "accept" as const,
      reason: "accept responsibility for the exact message",
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

  const settlement = owner.settleCommitmentIntent(
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
  if (settlement.status !== "applied") {
    throw new Error(`Ida message settlement failed: ${settlement.status}`);
  }
  const accepted = causal.materializePrivateSpeechCommitment({
    attempt,
    occurrence,
    proposal: settlement.proposal,
    intent: settlement.intent,
  });
  return { world, ida, kernel, focus, arbitrator, worldAuthority, causal, accepted };
}

function establishContactAndRetreat(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  ida: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
) {
  world.setResidentActivity(
    IDA_ID,
    travelActivity("ida-contact", actorPosition(world, JANEK_ID), "legally meet Janek"),
  );
  let acquired = false;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    world.step();
    if (knownJanek(ida, world.tick)?.currentlyVisible) {
      acquired = true;
      break;
    }
  }
  if (!acquired) throw new Error("Ida never legally acquired Janek contact");

  const home = { x: 3_050, y: 880 };
  world.setResidentActivity(IDA_ID, travelActivity("ida-retreat", home, "return to crossroads"));
  for (let step = 0; step < MAX_STEPS; step += 1) {
    world.step();
    if (distanceSquared(actorPosition(world, IDA_ID), home) <= 20 ** 2
      && knownJanek(ida, world.tick)
      && !knownJanek(ida, world.tick)!.currentlyVisible) {
      world.setResidentActivity(IDA_ID, idleActivity("ida-stale-contact"));
      world.step();
      return;
    }
  }
  throw new Error("Ida did not retreat from Janek with stale contact");
}

function relocateJanekOutsideIdaKnowledge(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  target: Vec2,
) {
  world.setResidentActivity(
    JANEK_ID,
    travelActivity("janek-hidden-relocation", target, "hidden relocation outside Ida knowledge"),
  );
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (distanceSquared(actorPosition(world, JANEK_ID), target) <= 18 ** 2) {
      world.setResidentActivity(JANEK_ID, idleActivity("janek-hidden-hold"));
      world.step();
      return;
    }
    world.step();
  }
  throw new Error("hidden Janek relocation exceeded guard");
}

function knownJanek(
  ida: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
  tick: number,
) {
  return ida.cognitionContext({
    residentId: IDA_ID,
    requestedAtTick: tick,
    reasons: [],
  }).knownActors.find((actor) => actor.id === JANEK_ID) ?? null;
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
    reason: "hold",
  };
}
