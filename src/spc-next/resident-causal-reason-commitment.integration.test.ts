import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

const MIRA_ID = "resident.mira";
const MAX_OPENING_STEPS = 1_200;
const MAX_EXECUTION_STEPS = 1_800;

describe("resident causal self-origin bootstrap", () => {
  it("turns authored activity completion into a durable generic matter and factual next chapter", () => {
    const composition = createFiveResidentRegionComposition({ playerStart: { x: 700, y: 700 } });
    const { world } = composition;
    const mira = composition.runtimes[MIRA_ID];

    // Recovered World authority disables legacy fastStep by design. Therefore the
    // causal-life substrate must be claimed only after the authored/local opening has
    // naturally reached its handoff boundary.
    let guard = 0;
    while (
      !mira.publicState().activity.reason.includes("completed activity:mira:initial")
      && guard < MAX_OPENING_STEPS
    ) {
      world.step();
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_OPENING_STEPS);

    const life = new ResidentCausalLifeSubstrate({
      residentId: MIRA_ID,
      resident: mira,
      world,
      navigation: createFiveResidentNavigationGraph(),
      identityNamespace: "mira",
    });
    const execution = new ResidentCausalExecutionCoordinator(life);

    let prepared = life.takeReadyLifeIntentAttempt();
    for (let step = 0; !prepared && step < 60; step += 1) {
      world.step();
      prepared = life.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;

    const originReason = prepared.batch.reasons.find((reason) => reason.kind === "activity_completed");
    expect(originReason).toBeDefined();
    if (!originReason) return;

    const proposal = workshopProposal();
    const settlement = life.lifeIntentOwner.settleCommitmentIntent(
      prepared.attempt,
      proposal,
      life.currentLifeView(),
      world.tick,
      (admittedProposal, providerContext) => life.reasonCommitments.groundCommitment({
        attempt: prepared.attempt,
        originReasonId: originReason.id,
        proposal: admittedProposal,
        providerContext,
        groundingContext: mira.cognitionContext({
          residentId: MIRA_ID,
          requestedAtTick: world.tick,
          reasons: structuredClone(prepared.batch.reasons),
        }),
      }),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") return;

    const accepted = life.reasonCommitments.materializeCommitment({
      attempt: prepared.attempt,
      originReasonId: originReason.id,
      proposal: settlement.proposal,
      intent: settlement.intent,
      tick: world.tick,
    });
    expect(accepted.originReason.id).toBe(originReason.id);
    expect(accepted.matter).toMatchObject({
      status: "active",
      semanticIntent: {
        kind: "travel_region",
        targetRegionId: "workshop",
      },
    });
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });
    expect(life.focus.focusedRun()).toBe(accepted.runId);

    let step = execution.stepFocusedRun();
    guard = 0;
    while (step.status === "running" && guard < MAX_EXECUTION_STEPS) {
      world.step();
      step = execution.stepFocusedRun();
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_EXECUTION_STEPS);
    expect(step.status).toBe("completed");
    if (step.status !== "completed") return;
    expect(step.matterId).toBe(accepted.matter.id);
    expect(step.runId).toBe(accepted.runId);
    expect(step.outcomeEvidence.kind).toBe("task_outcome");
    expect(life.kernel.matter(accepted.matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(life.focus.focusedRun()).toBeNull();

    const miraActor = world.publicSnapshot().actors.find((actor) => actor.id === MIRA_ID);
    expect(miraActor).toBeDefined();
    if (!miraActor) return;
    expect(world.regionAt(miraActor.position)?.id).toBe("workshop");

    // The new chapter must not be a hidden rewrite of the legacy local activity.
    expect(mira.publicState().activity).toMatchObject({
      kind: "idle",
      reason: expect.stringContaining("completed activity:mira:initial"),
    });
  });
});

function workshopProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "continue settlement responsibilities after finishing the opening walk",
      intent: {
        kind: "travel",
        goal: "go to the familiar workshop and continue my own next chapter there",
        targetActorId: null,
        targetRegionId: "workshop",
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 20,
  };
}
