import { describe, expect, it } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalCommunicateCommitmentAuthority } from "./resident-causal-communicate-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const IDA_ID = "resident.ida";
const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const MESSAGE = "Please check the field well before dusk.";

describe("resident causal communicate authority adversarial boundaries", () => {
  it("rejects unknown recipient and cross-resident attempt before continuity exists", () => {
    const fixture = setup();

    const unknownProposal = {
      ...fixture.proposal,
      commitmentDecision: {
        ...fixture.proposal.commitmentDecision,
        intent: {
          ...fixture.proposal.commitmentDecision.intent,
          targetActorId: "resident.unknown",
        },
      },
    };
    expect(fixture.causal.groundPrivateSpeechCommitment({
      attempt: fixture.attempt,
      occurrence: fixture.occurrence,
      proposal: unknownProposal,
      providerContext: fixture.attempt.context,
      groundingContext: fixture.ida.cognitionContext(fixture.batch),
    })).toEqual({
      status: "rejected",
      detail: "communicate target is not resident-known at admission",
    });

    const forgedAttempt = {
      ...fixture.attempt,
      residentId: "resident.mira",
    };
    expect(fixture.causal.groundPrivateSpeechCommitment({
      attempt: forgedAttempt,
      occurrence: fixture.occurrence,
      proposal: fixture.proposal,
      providerContext: fixture.attempt.context,
      groundingContext: fixture.ida.cognitionContext(fixture.batch),
    })).toEqual({
      status: "rejected",
      detail: "causal communicate commitment resident mismatch",
    });

    expect(fixture.causal.acceptedMatterIds()).toEqual([]);
    expect(fixture.focus.focusedRun()).toBeNull();
  });

  it("rejects a cloned grounded social capability while preserving the exact one-shot original", () => {
    const fixture = setup();
    const settlement = fixture.owner.settleCommitmentIntent(
      fixture.attempt,
      fixture.proposal,
      currentLife(fixture),
      fixture.world.tick,
      (proposal, providerContext) => fixture.causal.groundPrivateSpeechCommitment({
        attempt: fixture.attempt,
        occurrence: fixture.occurrence,
        proposal,
        providerContext,
        groundingContext: fixture.ida.cognitionContext(fixture.batch),
      }),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") return;

    const clone = structuredClone(settlement.intent);
    expect(() => fixture.causal.materializePrivateSpeechCommitment({
      attempt: fixture.attempt,
      occurrence: fixture.occurrence,
      proposal: settlement.proposal,
      intent: clone,
    })).toThrow("grounded causal communicate intent lacks exact admitted authority");
    expect(fixture.causal.acceptedMatterIds()).toEqual([]);
    expect(fixture.focus.focusedRun()).toBeNull();

    const accepted = fixture.causal.materializePrivateSpeechCommitment({
      attempt: fixture.attempt,
      occurrence: fixture.occurrence,
      proposal: settlement.proposal,
      intent: settlement.intent,
    });
    expect(accepted.matter.semanticIntent).toEqual({
      kind: "communicate_actor",
      goal: "deliver the accepted message to Janek",
      targetActorId: JANEK_ID,
      text: MESSAGE,
    });
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });
  });
});

function setup() {
  const composition = createFiveResidentRegionComposition({
    playerStart: { x: 1_980, y: 790 },
  });
  const { world } = composition;
  const ida = composition.runtimes[IDA_ID];

  world.setResidentActivity(IDA_ID, {
    id: "activity:ida:adversarial-contact",
    kind: "travel",
    targetActorId: null,
    targetPosition: { x: 1_900, y: 720 },
    text: null,
    speed: 110,
    reason: "legally acquire Janek identity",
  });
  let seen = false;
  for (let step = 0; step < 1_100; step += 1) {
    world.step();
    if (ida.cognitionContext({
      residentId: IDA_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).knownActors.some((actor) => actor.id === JANEK_ID && actor.currentlyVisible)) {
      seen = true;
      break;
    }
  }
  if (!seen) throw new Error("Ida never acquired Janek identity");
  world.setResidentActivity(IDA_ID, {
    id: "activity:ida:adversarial-idle",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "hold near known recipient",
  });
  world.step();

  const kernel = new ResidentContinuityKernel();
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  const authority = new ResidentWorldExecutionAuthority(IDA_ID, arbitrator, world);
  const owner = new ResidentLifeIntentOwner(ida);
  const causal = new ResidentCausalCommunicateCommitmentAuthority({
    residentId: IDA_ID,
    resident: ida,
    world,
    kernel,
    arbitrator,
    authority,
  });

  movePlayerNear(world, actorPosition(world, IDA_ID));
  const occurrence = world.speak(
    PLAYER_ID,
    `Ida, tell Janek exactly: "${MESSAGE}"`,
    420,
    [IDA_ID],
  );
  world.step();

  let batch = ida.takeCognitionBatch(world.tick);
  for (let step = 0; step < 240 && !batch; step += 1) {
    world.step();
    batch = ida.takeCognitionBatch(world.tick);
  }
  if (!batch) throw new Error("Ida social adversarial cognition never became ready");

  const attempt = owner.prepare(batch, captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: causal.acceptedMatterIds(),
  }));
  if (!attempt) throw new Error("Ida social adversarial attempt was not prepared");

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

  return { world, ida, kernel, focus, arbitrator, authority, owner, causal, occurrence, batch, attempt, proposal };
}

function movePlayerNear(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  target: { x: number; y: number },
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
) {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`missing actor ${actorId}`);
  return { ...actor.position };
}

function currentLife(fixture: Pick<ReturnType<typeof setup>, "kernel" | "focus" | "arbitrator" | "causal">) {
  return captureResidentLifeCognitionView({
    kernel: fixture.kernel,
    focus: fixture.focus,
    arbitrator: fixture.arbitrator,
    matterIds: fixture.causal.acceptedMatterIds(),
  });
}
