import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalTravelCommitmentAuthority } from "./resident-causal-travel-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const IDA_ID = "resident.ida";
const PLAYER_ID = "player.jozz";

describe("resident-generic causal travel adversarial authority", () => {
  it("rejects unfamiliar targets and cross-resident attempt identity before materialization", () => {
    const fixture = setup();

    const unfamiliar = {
      ...fixture.proposal,
      commitmentDecision: {
        ...fixture.proposal.commitmentDecision,
        intent: {
          ...fixture.proposal.commitmentDecision.intent,
          targetRegionId: "ruins",
        },
      },
    };
    expect(fixture.causal.groundPrivateSpeechCommitment({
      attempt: fixture.attempt,
      occurrence: fixture.occurrence,
      proposal: unfamiliar,
      providerContext: fixture.attempt.context,
      groundingContext: fixture.ida.cognitionContext(fixture.batch),
    })).toEqual({
      status: "rejected",
      detail: "commitment target lacks current resident-known route/destination",
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
      detail: "causal travel commitment resident mismatch",
    });

    expect(fixture.kernel.matterIds?.()).toBeUndefined();
    expect(fixture.causal.acceptedMatterIds()).toEqual([]);
    expect(fixture.focus.focusedRun()).toBeNull();
  });

  it("rejects a cloned grounded capability while preserving the exact one-shot original", () => {
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

    const cloned = structuredClone(settlement.intent);
    expect(() => fixture.causal.materializePrivateSpeechCommitment({
      attempt: fixture.attempt,
      occurrence: fixture.occurrence,
      proposal: settlement.proposal,
      intent: cloned,
    })).toThrow("grounded causal travel intent lacks exact admitted authority");
    expect(fixture.causal.acceptedMatterIds()).toEqual([]);
    expect(fixture.focus.focusedRun()).toBeNull();

    const accepted = fixture.causal.materializePrivateSpeechCommitment({
      attempt: fixture.attempt,
      occurrence: fixture.occurrence,
      proposal: settlement.proposal,
      intent: settlement.intent,
    });
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });
    expect(fixture.causal.acceptedMatterIds()).toEqual([accepted.matter.id]);
  });
});

function setup() {
  const composition = createFiveResidentRegionComposition({
    playerStart: { x: 3_000, y: 900 },
  });
  const { world } = composition;
  const ida = composition.runtimes[IDA_ID];
  world.setResidentActivity(IDA_ID, {
    id: "activity:ida:generic-adversarial-idle",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "generic causal adversarial idle",
  });
  world.step();

  const kernel = new ResidentContinuityKernel();
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  const authority = new ResidentWorldExecutionAuthority(IDA_ID, arbitrator, world);
  const owner = new ResidentLifeIntentOwner(ida);
  const causal = new ResidentCausalTravelCommitmentAuthority({
    residentId: IDA_ID,
    resident: ida,
    world,
    navigation: createFiveResidentNavigationGraph(),
    kernel,
    arbitrator,
    authority,
  });

  const occurrence = world.speak(
    PLAYER_ID,
    "Ida, zajrzyj później do znajomego warsztatu.",
    420,
    [IDA_ID],
  );
  world.step();

  let batch = ida.takeCognitionBatch(world.tick);
  for (let step = 0; step < 240 && !batch; step += 1) {
    world.step();
    batch = ida.takeCognitionBatch(world.tick);
  }
  if (!batch) throw new Error("Ida generic adversarial cognition never became ready");

  const life = captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: causal.acceptedMatterIds(),
  });
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("Ida generic adversarial attempt was not prepared");

  const proposal = {
    version: 1 as const,
    commitmentDecision: {
      kind: "accept" as const,
      reason: "accept a bounded continuing travel matter",
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

  return { world, ida, kernel, focus, arbitrator, authority, owner, causal, occurrence, batch, attempt, proposal };
}

function currentLife(fixture: ReturnType<typeof setup>) {
  return captureResidentLifeCognitionView({
    kernel: fixture.kernel,
    focus: fixture.focus,
    arbitrator: fixture.arbitrator,
    matterIds: fixture.causal.acceptedMatterIds(),
  });
}
