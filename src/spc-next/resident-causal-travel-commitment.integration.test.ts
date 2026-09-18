import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import {
  ResidentCausalTravelCommitmentAuthority,
} from "./resident-causal-travel-commitment";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";

const IDA_ID = "resident.ida";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_PREPARE_STEPS = 240;
const MAX_EXECUTION_STEPS = 2_000;

describe("resident-generic causal travel commitment", () => {
  it("lets Ida acquire and execute a private-speech commitment without Mira-specific identity or materialization code", () => {
    const composition = createFiveResidentRegionComposition();
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    world.setResidentActivity(IDA_ID, {
      id: "activity:ida:generic-causal-idle",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "generic causal travel specimen idle",
    });
    world.step();

    const kernel = new ResidentContinuityKernel();
    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const authority = new ResidentWorldExecutionAuthority(IDA_ID, arbitrator, world);
    const owner = new ResidentLifeIntentOwner(ida);
    const navigation = createFiveResidentNavigationGraph();
    const causal = new ResidentCausalTravelCommitmentAuthority({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
      kernel,
      arbitrator,
      authority,
    });

    const occurrence = world.speak(
      MIRA_ID,
      "Ida, kiedy będziesz mogła, zajrzyj do znajomego warsztatu.",
      REQUEST_RADIUS,
      [IDA_ID],
    );
    world.step();

    let batch = ida.takeCognitionBatch(world.tick);
    for (let step = 0; step < MAX_PREPARE_STEPS && !batch; step += 1) {
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
    const attempt = owner.prepare(batch, life);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "accept Mira's request as my own continuing commitment",
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
        kind: "travel_region",
        goal: "visit the familiar workshop",
        targetRegionId: "workshop",
      },
    });
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });
    expect(kernel.canRunMutateWorld(accepted.runId)).toBe(true);
    expect(causal.acceptedMatterIds()).toEqual([accepted.matter.id]);

    // The generic authority grants no special movement primitive. Execution still
    // happens through the existing resident-generic run/body/World authority stack.
    const executor = new ResidentGroundedTravelExecutor(
      accepted.runId,
      settlement.intent.destination,
      authority,
      world,
    );
    let arrived = false;
    for (let step = 0; step < MAX_EXECUTION_STEPS; step += 1) {
      const local = executor.step();
      if (local.status === "arrived") {
        arrived = true;
        break;
      }
      expect(local.status).toBe("running");
      world.step();
    }
    expect(arrived).toBe(true);

    const reconciled = kernel.reconcileRunOutcome({
      runId: accepted.runId,
      tick: world.tick,
      status: "succeeded",
      summary: "Ida physically reached the cognition-grounded workshop destination",
    });
    expect(reconciled.status).toBe("recorded");
    kernel.resolveMatter(accepted.matter.id);
    expect(kernel.matter(accepted.matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });
});
