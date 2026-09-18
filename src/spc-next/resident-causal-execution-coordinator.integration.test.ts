import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

const IDA_ID = "resident.ida";
const PLAYER_ID = "player.jozz";
const REQUEST_RADIUS = 420;
const MAX_PREPARE_STEPS = 240;
const MAX_EXECUTION_STEPS = 2_000;

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
      lastOutcomeEvidence: {
        id: terminal.outcomeEvidence.id,
        kind: "task_outcome",
      },
    }));

    const reviewAfterCompletion = ida.cognitionScheduleDiagnostics().nextQuietReviewTick;
    expect(reviewAfterCompletion).toBeLessThanOrEqual(reviewBeforeCompletion);
  });
});
