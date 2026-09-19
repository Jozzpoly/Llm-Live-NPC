import { describe, expect, it } from "vitest";
import { distanceSquared, type ResidentActivity, type Vec2 } from "./contracts";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

const IDA_ID = "resident.ida";
const PLAYER_ID = "player.jozz";
const REQUEST_RADIUS = 420;
const MAX_PREPARE_STEPS = 240;
const MAX_EXECUTION_STEPS = 2_000;
const JANEK_ID = "resident.janek";
const MESSAGE = "Mira says the field well needs checking before dusk.";
const HIDDEN_JANEK_POSITION = { x: 1_200, y: 720 };

describe("ResidentCausalExecutionCoordinator", () => {
  it("executes and reconciles a generic Ida travel matter without a bespoke vertical executor loop", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const navigation = createFiveResidentNavigationGraph();

    world.setResidentActivity(IDA_ID, {
      id: "activity:ida:generic-execution-idle",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "generic execution specimen idle",
    });
    world.step();

    const life = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
    });
    const execution = new ResidentCausalExecutionCoordinator(life);

    const occurrence = world.speak(
      PLAYER_ID,
      "Ida, kiedy będziesz mogła, zajrzyj do znajomego warsztatu.",
      REQUEST_RADIUS,
      [IDA_ID],
    );
    world.step();

    let prepared = life.takeReadyLifeIntentAttempt();
    for (let step = 0; step < MAX_PREPARE_STEPS && !prepared; step += 1) {
      world.step();
      prepared = life.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "accept the workshop visit as my own continuing matter",
        intent: {
          kind: "travel" as const,
          goal: "visit the familiar workshop",
          targetActorId: null,
          targetRegionId: "workshop",
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };

    const settlement = life.lifeIntentOwner.settleCommitmentIntent(
      prepared.attempt,
      proposal,
      life.currentLifeView(),
      world.tick,
      (admittedProposal, providerContext) => life.travelCommitments.groundPrivateSpeechCommitment({
        attempt: prepared!.attempt,
        occurrence,
        proposal: admittedProposal,
        providerContext,
        groundingContext: ida.cognitionContext(prepared!.batch),
      }),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") return;

    const accepted = life.travelCommitments.materializePrivateSpeechCommitment({
      attempt: prepared.attempt,
      occurrence,
      proposal: settlement.proposal,
      intent: settlement.intent,
    });
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });
    expect(life.focus.focusedRun()).toBe(accepted.runId);

    const reviewBeforeCompletion = ida.cognitionScheduleDiagnostics().nextQuietReviewTick;

    let terminal: ReturnType<typeof execution.stepFocusedRun> | null = null;
    for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
      const local = execution.stepFocusedRun();
      if (local.status === "running") {
        world.step();
        continue;
      }
      terminal = local;
      break;
    }

    expect(terminal).toMatchObject({
      status: "completed",
      matterId: accepted.matter.id,
      runId: accepted.runId,
      outcomeEvidence: {
        kind: "task_outcome",
      },
      arbitration: { status: "idle" },
    });
    if (!terminal || terminal.status !== "completed") return;

    expect(terminal.outcomeEvidence.summary).toContain("workshop");
    expect(life.kernel.matter(accepted.matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(life.focus.focusedRun()).toBeNull();
    expect(life.worldAuthority.motionOwner()).toBeNull();
    expect(life.currentLifeView().matters).toContainEqual(expect.objectContaining({
      id: accepted.matter.id,
      status: "resolved",
      activeRun: null,
      lastOutcomeEvidence: expect.objectContaining({
        id: terminal.outcomeEvidence.id,
        kind: "task_outcome",
      }),
    }));

    // Expected success is durable factual history, not automatically a new
    // semantic problem. No timer or outcome bridge is allowed to manufacture one.
    expect(ida.pendingCognitionReasons().some((reason) =>
      reason.evidenceIds.includes(terminal.outcomeEvidence.id)
    )).toBe(false);

    const reviewAfterCompletion = ida.cognitionScheduleDiagnostics().nextQuietReviewTick;
    expect(reviewAfterCompletion).toBe(reviewBeforeCompletion);
  });

  it("executes and reconciles a generic Ida communicate matter without a bespoke delivery vertical", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const navigation = createFiveResidentNavigationGraph();

    establishIdaJanekContact(world, ida);
    movePlayerNear(world, actorPosition(world, IDA_ID));

    world.setResidentActivity(IDA_ID, {
      id: "activity:ida:generic-communicate-idle",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "generic communicate execution specimen idle",
    });
    world.step();

    const life = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
    });
    const execution = new ResidentCausalExecutionCoordinator(life);

    const occurrence = world.speak(
      PLAYER_ID,
      `Ida, proszę przekaż Jankowi dokładnie: "${MESSAGE}"`,
      REQUEST_RADIUS,
      [IDA_ID],
    );
    world.step();

    let prepared = life.takeReadyLifeIntentAttempt();
    for (let step = 0; step < MAX_PREPARE_STEPS && !prepared; step += 1) {
      world.step();
      prepared = life.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "accept responsibility for delivering the exact message",
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

    const settlement = life.lifeIntentOwner.settleCommitmentIntent(
      prepared.attempt,
      proposal,
      life.currentLifeView(),
      world.tick,
      (admittedProposal, providerContext) => life.communicateCommitments.groundPrivateSpeechCommitment({
        attempt: prepared!.attempt,
        occurrence,
        proposal: admittedProposal,
        providerContext,
        groundingContext: ida.cognitionContext(prepared!.batch),
      }),
    );
    if (settlement.status !== "applied") {
      throw new Error(`generic communicate settlement failed: ${settlement.status} ${"reason" in settlement ? settlement.reason : ""} ${"detail" in settlement ? settlement.detail ?? "" : ""}`);
    }

    const accepted = life.communicateCommitments.materializePrivateSpeechCommitment({
      attempt: prepared.attempt,
      occurrence,
      proposal: settlement.proposal,
      intent: settlement.intent,
    });
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });

    let terminal: ReturnType<typeof execution.stepFocusedRun> | null = null;
    for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
      const local = execution.stepFocusedRun();
      if (local.status === "running") {
        world.step();
        continue;
      }
      terminal = local;
      break;
    }

    expect(terminal).toMatchObject({
      status: "completed",
      matterId: accepted.matter.id,
      runId: accepted.runId,
      outcomeEvidence: { kind: "task_outcome" },
      arbitration: { status: "idle" },
    });
    if (!terminal || terminal.status !== "completed") return;

    expect(terminal.outcomeEvidence.summary).toContain(JANEK_ID);
    expect(world.diagnostics().recentOccurrences).toContainEqual(expect.objectContaining({
      kind: "speech",
      actorId: IDA_ID,
      text: MESSAGE,
      addressedActorIds: [JANEK_ID],
    }));
    expect(life.kernel.matter(accepted.matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(life.focus.focusedRun()).toBeNull();
    expect(life.worldAuthority.motionOwner()).toBeNull();
    expect(ida.pendingCognitionReasons().some((reason) =>
      reason.evidenceIds.includes(terminal.outcomeEvidence.id)
    )).toBe(false);
  });

  it("reconciles blocked Ida communication without resolving the durable matter or oracle-tracking Janek", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const navigation = createFiveResidentNavigationGraph();

    establishIdaJanekContact(world, ida);
    movePlayerNear(world, actorPosition(world, IDA_ID));
    world.setResidentActivity(IDA_ID, {
      id: "activity:ida:generic-blocked-communicate-idle",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "generic blocked communicate specimen idle",
    });
    world.step();

    const life = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
    });
    const execution = new ResidentCausalExecutionCoordinator(life);

    const occurrence = world.speak(
      PLAYER_ID,
      `Ida, proszę przekaż Jankowi dokładnie: "${MESSAGE}"`,
      REQUEST_RADIUS,
      [IDA_ID],
    );
    world.step();

    let prepared = life.takeReadyLifeIntentAttempt();
    for (let step = 0; step < MAX_PREPARE_STEPS && !prepared; step += 1) {
      world.step();
      prepared = life.takeReadyLifeIntentAttempt();
    }
    if (!prepared) throw new Error("Ida blocked-message cognition never became ready");

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "accept responsibility for delivering the exact message",
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
      reviewAfterSeconds: 600,
    };

    const settlement = life.lifeIntentOwner.settleCommitmentIntent(
      prepared.attempt,
      proposal,
      life.currentLifeView(),
      world.tick,
      (admittedProposal, providerContext) => life.communicateCommitments.groundPrivateSpeechCommitment({
        attempt: prepared!.attempt,
        occurrence,
        proposal: admittedProposal,
        providerContext,
        groundingContext: ida.cognitionContext(prepared!.batch),
      }),
    );
    if (settlement.status !== "applied") {
      throw new Error(`blocked communicate settlement failed: ${settlement.status}`);
    }

    const accepted = life.communicateCommitments.materializePrivateSpeechCommitment({
      attempt: prepared.attempt,
      occurrence,
      proposal: settlement.proposal,
      intent: settlement.intent,
    });

    const beforeHidden = knownActor(ida, JANEK_ID, world.tick);
    expect(beforeHidden).toMatchObject({
      id: JANEK_ID,
      currentlyVisible: false,
      lastKnownPosition: expect.any(Object),
    });

    relocateJanekOutsideIdaKnowledge(world, ida, HIDDEN_JANEK_POSITION);
    expect(knownActor(ida, JANEK_ID, world.tick)).toEqual(beforeHidden);
    expect(actorPosition(world, JANEK_ID)).not.toEqual(beforeHidden!.lastKnownPosition);

    const reviewBeforeBlockedOutcome = ida.cognitionScheduleDiagnostics().nextQuietReviewTick;

    let terminal: ReturnType<typeof execution.stepFocusedRun> | null = null;
    for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
      const local = execution.stepFocusedRun();
      if (local.status === "running") {
        world.step();
        continue;
      }
      terminal = local;
      break;
    }

    expect(terminal).toMatchObject({
      status: "blocked",
      matterId: accepted.matter.id,
      runId: accepted.runId,
      outcomeEvidence: {
        kind: "task_outcome",
        summary: expect.stringContaining("recipient_absent_at_best_known_contact"),
      },
      arbitration: { status: "idle" },
    });
    if (!terminal || terminal.status !== "blocked") return;

    expect(world.diagnostics().recentOccurrences.filter((candidate) => (
      candidate.kind === "speech"
      && candidate.actorId === IDA_ID
      && candidate.text === MESSAGE
    ))).toEqual([]);

    expect(life.kernel.matter(accepted.matter.id)).toMatchObject({
      status: "active",
      activeRunId: null,
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: JANEK_ID,
        text: MESSAGE,
      },
    });
    expect(life.focus.focusedRun()).toBeNull();
    expect(life.worldAuthority.motionOwner()).toBeNull();
    expect(ida.cognitionScheduleDiagnostics().nextQuietReviewTick)
      .toBeLessThanOrEqual(reviewBeforeBlockedOutcome);
    expect(ida.pendingCognitionReasons()).toContainEqual(expect.objectContaining({
      kind: "activity_completed",
      evidenceIds: [terminal.outcomeEvidence.id],
      summary: expect.stringContaining("Factual run outcome requires resident interpretation"),
    }));

    expect(life.kernel.matter(accepted.matter.id)).toMatchObject({
      lastOutcomeSemanticRevision: 1,
    });

    // The retry guard is continuity truth, not coordinator-local memory.
    const reconstructedExecution = new ResidentCausalExecutionCoordinator(life);
    expect(reconstructedExecution.stepFocusedRun()).toEqual({ status: "idle" });
    expect(reconstructedExecution.reactivateReviewedMatter(accepted.matter.id)).toEqual({
      status: "rejected",
      matterId: accepted.matter.id,
      reason: "semantic_review_required",
    });

    reacquireJanekContact(world, ida);

    const review = life.kernel.beginSemanticProposal(accepted.matter.id);
    const current = life.kernel.matter(accepted.matter.id);
    expect(current?.semanticIntent?.kind).toBe("communicate_actor");
    if (!current?.semanticIntent) throw new Error("blocked matter lost durable intent");
    expect(life.kernel.commitSemanticProposal(review, {
      semanticCourse: "retry the accepted delivery after reviewing the factual block",
      semanticIntent: current.semanticIntent,
    })).toMatchObject({
      status: "applied",
      matter: {
        id: accepted.matter.id,
        semanticRevision: 2,
      },
    });

    const reactivated = reconstructedExecution.reactivateReviewedMatter(accepted.matter.id);
    expect(reactivated).toMatchObject({
      status: "acquired",
      matterId: accepted.matter.id,
    });
    if (reactivated.status !== "acquired") return;
    expect(reactivated.runId).not.toBe(accepted.runId);
    expect(life.kernel.canRunMutateWorld(reactivated.runId)).toBe(true);
    expect(life.focus.focusedRun()).toBe(reactivated.runId);
    expect(life.kernel.matter(accepted.matter.id)).toMatchObject({
      status: "active",
      semanticRevision: 2,
      activeRunId: reactivated.runId,
    });

    let recovered: ReturnType<typeof reconstructedExecution.stepFocusedRun> | null = null;
    for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
      const local = reconstructedExecution.stepFocusedRun();
      if (local.status === "running") {
        world.step();
        continue;
      }
      recovered = local;
      break;
    }
    expect(recovered).toMatchObject({
      status: "completed",
      matterId: accepted.matter.id,
      runId: reactivated.runId,
      outcomeEvidence: {
        kind: "task_outcome",
        summary: expect.stringContaining(JANEK_ID),
      },
    });
    expect(life.kernel.matter(accepted.matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      lastOutcomeSemanticRevision: 2,
    });
  });
});

function establishIdaJanekContact(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  ida: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
) {
  const janek = actorPosition(world, JANEK_ID);
  world.setResidentActivity(
    IDA_ID,
    travelActivity("ida-generic-contact", janek, "legally acquire Janek contact"),
  );

  let acquired = false;
  for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
    world.step();
    const known = ida.cognitionContext({
      residentId: IDA_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).knownActors.find((actor) => actor.id === JANEK_ID);
    if (known?.currentlyVisible) {
      acquired = true;
      break;
    }
  }
  if (!acquired) throw new Error("Ida never legally acquired Janek contact");

  // Retreat after legal identity/contact acquisition. This preserves only Ida's
  // stale private Janek contact before the later request and avoids making the
  // request share one tiny recent-percept window with dense live contact churn.
  const crossroads = { x: 3_050, y: 880 };
  world.setResidentActivity(
    IDA_ID,
    travelActivity("ida-generic-retreat", crossroads, "return after legal Janek contact"),
  );
  for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
    world.step();
    const position = actorPosition(world, IDA_ID);
    const known = ida.cognitionContext({
      residentId: IDA_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).knownActors.find((actor) => actor.id === JANEK_ID);
    if (distanceSquared(position, crossroads) <= 20 ** 2 && known && !known.currentlyVisible) {
      world.setResidentActivity(IDA_ID, {
        id: "activity:ida:generic-after-contact",
        kind: "idle",
        targetActorId: null,
        targetPosition: null,
        text: null,
        speed: null,
        reason: "hold after legal Janek contact prehistory",
      });
      world.step();
      return;
    }
  }
  throw new Error("Ida did not retreat while preserving stale Janek contact");
}

function knownActor(
  resident: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
  actorId: string,
  tick: number,
) {
  return resident.cognitionContext({
    residentId: IDA_ID,
    requestedAtTick: tick,
    reasons: [],
  }).knownActors.find((actor) => actor.id === actorId) ?? null;
}

function relocateJanekOutsideIdaKnowledge(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  ida: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
  target: Vec2,
) {
  const before = knownActor(ida, JANEK_ID, world.tick);
  world.setResidentActivity(
    JANEK_ID,
    travelActivity("janek-generic-hidden-relocation", target, "hidden relocation outside Ida knowledge"),
  );

  for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
    if (distanceSquared(actorPosition(world, JANEK_ID), target) <= 18 ** 2) {
      world.setResidentActivity(JANEK_ID, {
        id: "activity:janek-generic-hidden-hold",
        kind: "idle",
        targetActorId: null,
        targetPosition: null,
        text: null,
        speed: null,
        reason: "hold after hidden relocation",
      });
      world.step();
      if (knownActor(ida, JANEK_ID, world.tick) !== null && before !== null) return;
      throw new Error("Ida lost Janek identity during hidden relocation");
    }
    world.step();
  }
  throw new Error("hidden Janek relocation exceeded guard");
}

function reacquireJanekContact(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  ida: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
) {
  const idaPosition = actorPosition(world, IDA_ID);
  world.setResidentActivity(
    JANEK_ID,
    travelActivity("janek-generic-return-to-ida", idaPosition, "return into Ida private contact"),
  );

  for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
    world.step();
    const contact = knownActor(ida, JANEK_ID, world.tick);
    if (contact?.currentlyVisible) {
      world.setResidentActivity(JANEK_ID, {
        id: "activity:janek-generic-return-hold",
        kind: "idle",
        targetActorId: null,
        targetPosition: null,
        text: null,
        speed: null,
        reason: "hold after factual reacquisition by Ida",
      });
      world.step();
      return;
    }
  }
  throw new Error("Ida never factually reacquired Janek after blocked delivery");
}

function movePlayerNear(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  target: Vec2,
) {
  for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
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
