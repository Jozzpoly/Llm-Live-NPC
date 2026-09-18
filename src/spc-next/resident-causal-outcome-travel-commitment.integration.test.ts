import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalOutcomeTravelCommitmentAuthority } from "./resident-causal-outcome-travel-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const IDA_ID = "resident.ida";
const SOURCE_MATTER = "matter.ida.completed.source";
const SOURCE_RUN = "run.ida.completed.source";

describe("resident-generic causal follow-up from own factual outcome", () => {
  it("lets Ida turn one exact recent completed outcome into a fresh bounded travel matter", () => {
    const composition = createFiveResidentRegionComposition();
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const kernel = new ResidentContinuityKernel();
    const scope = new ResidentLifeMatterScope(kernel);
    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const worldAuthority = new ResidentWorldExecutionAuthority(IDA_ID, arbitrator, world);
    const owner = new ResidentLifeIntentOwner(ida);
    const causal = new ResidentCausalOutcomeTravelCommitmentAuthority({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation: createFiveResidentNavigationGraph(),
      kernel,
      arbitrator,
      authority: worldAuthority,
      matterScope: scope,
    });

    kernel.recordEvidence({
      id: "evidence.ida.source",
      tick: world.tick,
      kind: "accepted_cognition_commitment",
      summary: "Ida previously accepted a bounded source matter",
    });
    kernel.openMatter({
      id: SOURCE_MATTER,
      originEvidenceId: "evidence.ida.source",
      semanticCourse: "inspect the local crossing",
    });
    kernel.bindRun({
      matterId: SOURCE_MATTER,
      taskId: "task.ida.completed.source",
      runId: SOURCE_RUN,
    });
    const outcome = kernel.reconcileRunOutcome({
      runId: SOURCE_RUN,
      tick: world.tick,
      status: "succeeded",
      summary: "Ida factually completed the crossing inspection",
    });
    expect(outcome.status).toBe("recorded");
    if (outcome.status !== "recorded") return;
    kernel.resolveMatter(SOURCE_MATTER);
    scope.track(SOURCE_MATTER);

    const life = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: scope.matterIds(),
    });
    expect(life.matters).toContainEqual(expect.objectContaining({
      id: SOURCE_MATTER,
      status: "resolved",
      lastOutcomeEvidence: expect.objectContaining({
        id: outcome.evidence.id,
        kind: "task_outcome",
      }),
    }));

    const batch = {
      residentId: IDA_ID,
      requestedAtTick: world.tick,
      reasons: [{
        id: "reason:ida:own-outcome-review",
        tick: world.tick,
        kind: "quiet_review" as const,
        salience: 0.1,
        summary: "Review my recently completed work.",
        evidenceIds: [],
      }],
    };
    const attempt = owner.prepare(batch, life);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "I completed that work and choose a bounded follow-up",
        intent: {
          kind: "travel" as const,
          goal: "visit the familiar workshop after my completed crossing inspection",
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
      life,
      world.tick,
      (admittedProposal, providerContext) => causal.groundLifeOutcomeCommitment({
        attempt,
        sourceMatterId: SOURCE_MATTER,
        proposal: admittedProposal,
        providerContext,
        groundingContext: ida.cognitionContext(batch),
      }),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") return;

    const expectedMatterId = `matter.ida.causal.outcome:${outcome.evidence.id}`;
    expect(kernel.matter(expectedMatterId)).toBeNull();

    const accepted = causal.materializeLifeOutcomeCommitment({
      attempt,
      sourceMatterId: SOURCE_MATTER,
      proposal: settlement.proposal,
      intent: settlement.intent,
      tick: world.tick,
    });

    expect(accepted.originOutcomeEvidence).toEqual(outcome.evidence);
    expect(accepted.matter).toMatchObject({
      id: expectedMatterId,
      status: "active",
      semanticIntent: {
        kind: "travel_region",
        goal: "visit the familiar workshop after my completed crossing inspection",
        targetRegionId: "workshop",
      },
    });
    expect(accepted.runId).toContain("run.ida.causal.outcome:");
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });
    expect(scope.matterIds()).toEqual([SOURCE_MATTER, expectedMatterId].sort((a, b) => a.localeCompare(b)));
    expect(causal.acceptedMatterIds()).toEqual(scope.matterIds());
    expect(kernel.canRunMutateWorld(accepted.runId)).toBe(true);
  });
});
