import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { ResidentCausalReasonCommitmentAuthority } from "./resident-causal-reason-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import {
  allowedChoiceSupportEvidenceIds,
} from "./resident-life-choice-causal-support";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import { RegionNavigationGraph } from "./region-navigation";
import { ResidentRuntime } from "./resident-runtime";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const MIRA_ID = "resident.mira";
const IDA_ID = "resident.ida";
const REGION_ID = "r6-cumulative-room";
const OLD_A = "matter.mira.r6.cumulative-runtime.old-a";
const OLD_B = "matter.mira.r6.cumulative-runtime.old-b";
const OLD_A_RUN = "run.mira.r6.cumulative-runtime.old-a";
const OLD_B_RUN = "run.mira.r6.cumulative-runtime.old-b";
const CARRIER = "matter.mira.r6.cumulative-runtime.carrier";
const CARRIER_RUN = "run.mira.r6.cumulative-runtime.carrier";
const OTHER = "matter.mira.r6.cumulative-runtime.other";
const OTHER_RUN = "run.mira.r6.cumulative-runtime.other";

describe("R6 cumulative same-actor factual history through normal current-matter production", () => {
  it("binds two old Ida outcomes to a new current Ida future and carries both into genuine later choice support", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 700 },
      regions: [{
        id: REGION_ID,
        label: "R6 cumulative room",
        minX: 0,
        minY: 0,
        maxX: 1_000,
        maxY: 700,
      }],
      anchors: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    const mira = world.addResident(MIRA_ID, "Mira", { x: 420, y: 350 });
    world.addResident(IDA_ID, "Ida", { x: 540, y: 350 });
    world.familiarizeResidentWithRegions(MIRA_ID, [REGION_ID]);
    world.familiarizeResidentWithRegions(IDA_ID, [REGION_ID]);
    world.step();

    const knownIda = mira.cognitionContext({
      residentId: MIRA_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).knownActors.find((actor) => actor.id === IDA_ID);
    expect(knownIda).toMatchObject({ id: IDA_ID, currentlyVisible: true });

    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 3,
      terminalOutcomeArchiveLimit: 8,
    });
    const matterScope = new ResidentLifeMatterScope(kernel);
    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const authority = new ResidentWorldExecutionAuthority(MIRA_ID, arbitrator, world);
    const lifeIntentOwner = new ResidentLifeIntentOwner(mira);
    const navigation = new RegionNavigationGraph(
      [{ id: REGION_ID, destinationPoint: { x: 420, y: 350 } }],
      [],
    );
    const commitments = new ResidentCausalReasonCommitmentAuthority({
      residentId: MIRA_ID,
      resident: mira,
      world,
      navigation,
      kernel,
      arbitrator,
      authority,
      matterScope,
      identityNamespace: "mira-r6-cumulative",
    });

    const oldAOutcome = terminalCommunicationEpisode(
      kernel,
      matterScope,
      OLD_A,
      OLD_A_RUN,
      "first ordinary factual exchange with Ida",
      2,
    );
    const oldBOutcome = terminalCommunicationEpisode(
      kernel,
      matterScope,
      OLD_B,
      OLD_B_RUN,
      "second independent ordinary factual exchange with Ida",
      10,
    );

    for (let index = 0; index < 6; index += 1) {
      world.step();
      kernel.recordEvidence({
        id: `evidence:mira:r6:cumulative-runtime:churn:${index}`,
        tick: world.tick,
        kind: "later_life",
        summary: `ordinary unrelated factual life after Ida episodes ${index}`,
      });
    }
    expect(kernel.recentEvidenceSnapshot().some(
      (entry) => entry.id === oldAOutcome.id || entry.id === oldBOutcome.id,
    )).toBe(false);
    expect(matterScope.matterIds().some((id) => id === OLD_A || id === OLD_B)).toBe(false);
    expect(kernel.archivedTerminalOutcomeEvidence(OLD_A)).toEqual(oldAOutcome);
    expect(kernel.archivedTerminalOutcomeEvidence(OLD_B)).toEqual(oldBOutcome);

    // Carrier owns the body before C/D are created, so neither candidate wins merely
    // because it was materialized first.
    const carrierOrigin = kernel.recordEvidence({
      id: "evidence:mira:r6:cumulative-runtime:carrier-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "temporary body owner used only to form normal deferred ambiguity",
    });
    kernel.openMatter({
      id: CARRIER,
      originEvidenceId: carrierOrigin.id,
      semanticCourse: "temporary body owner",
    });
    matterScope.track(CARRIER);
    kernel.bindRun({
      matterId: CARRIER,
      taskId: "task.mira.r6.cumulative-runtime.carrier",
      runId: CARRIER_RUN,
    });
    expect(arbitrator.request(CARRIER_RUN)).toEqual({
      status: "acquired",
      runId: CARRIER_RUN,
    });

    // Current C originates from one ordinary resident semantic reason. The proposal
    // itself contains no history field; same-actor factual genealogy must be attached
    // only by the production commitment authority after local admission.
    mira.promoteSemanticPressure({
      id: "reason:mira:r6:cumulative-runtime:current-ida",
      tick: world.tick,
      kind: "uncertainty",
      salience: 0.72,
      summary: "Mira has one current reason to speak with the already-known Ida.",
      evidenceIds: [],
    });
    const batch = waitForBatch(mira, world);
    const reason = batch.reasons.find(
      (candidate) => candidate.id === "reason:mira:r6:cumulative-runtime:current-ida",
    );
    expect(reason).toBeDefined();
    if (!reason) throw new Error("current Ida reason did not reach cognition");

    const beforeC = currentLife(kernel, matterScope, focus, arbitrator);
    expect(beforeC.matters.some((matter) => matter.id === OLD_A || matter.id === OLD_B)).toBe(false);
    const attempt = lifeIntentOwner.prepare(batch, beforeC, world.tick);
    if (!attempt) throw new Error("current Ida life intent was not prepared");

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "I have a current reason to speak with Ida now",
        intent: {
          kind: "communicate" as const,
          goal: "speak with Ida about the current situation",
          targetActorId: IDA_ID,
          targetRegionId: null,
          targetPosition: null,
          text: "Ida, chcę z tobą porozmawiać o tym, co dzieje się teraz.",
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };

    const settled = lifeIntentOwner.settleCommitmentIntent(
      attempt,
      proposal,
      currentLife(kernel, matterScope, focus, arbitrator),
      world.tick,
      (admittedProposal, providerContext) => commitments.groundCommitment({
        attempt,
        originReasonId: reason.id,
        proposal: admittedProposal,
        providerContext,
        groundingContext: mira.cognitionContext(batch, world.tick),
      }),
    );
    expect(settled.status).toBe("applied");
    if (settled.status !== "applied") {
      throw new Error(`current Ida commitment rejected: ${settled.status}`);
    }

    const currentIda = commitments.materializeCommitment({
      attempt,
      originReasonId: reason.id,
      proposal: settled.proposal,
      intent: settled.intent,
      tick: world.tick,
    });
    expect(currentIda.focusClaim).toMatchObject({
      status: "busy",
      focusedRunId: CARRIER_RUN,
    });
    expect(currentIda.matter).toMatchObject({
      status: "active",
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: IDA_ID,
      },
      historicalSupport: [
        {
          relation: "prior_same_actor_outcome",
          sourceMatterId: OLD_A,
          evidenceId: oldAOutcome.id,
        },
        {
          relation: "prior_same_actor_outcome",
          sourceMatterId: OLD_B,
          evidenceId: oldBOutcome.id,
        },
      ],
    });

    // D is a legal unrelated current future with no relationship-history support.
    const otherOrigin = kernel.recordEvidence({
      id: "evidence:mira:r6:cumulative-runtime:other-origin",
      tick: world.tick,
      kind: "accepted_cognition_commitment",
      summary: "Mira independently has one ordinary current workshop future.",
    });
    kernel.openMatter({
      id: OTHER,
      originEvidenceId: otherOrigin.id,
      semanticCourse: "visit the familiar workshop",
      semanticIntent: {
        kind: "travel_region",
        goal: "visit the familiar workshop",
        targetRegionId: REGION_ID,
      },
    });
    matterScope.track(OTHER);
    kernel.bindRun({
      matterId: OTHER,
      taskId: "task.mira.r6.cumulative-runtime.other",
      runId: OTHER_RUN,
    });
    expect(arbitrator.request(OTHER_RUN)).toMatchObject({
      status: "busy",
      focusedRunId: CARRIER_RUN,
    });

    kernel.cancelMatter(CARRIER);
    kernel.retireRun(CARRIER_RUN);
    const candidateRunIds = [currentIda.runId, OTHER_RUN]
      .sort((left, right) => left.localeCompare(right));
    expect(arbitrator.reconcile()).toEqual({
      status: "choice_required",
      candidateRunIds,
    });

    const choiceLife = currentLife(kernel, matterScope, focus, arbitrator);
    expect(choiceLife.matters.some((matter) => matter.id === OLD_A || matter.id === OLD_B))
      .toBe(false);
    expect(choiceLife.matters.find((matter) => matter.id === currentIda.matter.id))
      .toMatchObject({
        historicalSupport: [
          {
            relation: "prior_same_actor_outcome",
            sourceMatterId: OLD_A,
            evidence: { id: oldAOutcome.id, kind: "task_outcome" },
          },
          {
            relation: "prior_same_actor_outcome",
            sourceMatterId: OLD_B,
            evidence: { id: oldBOutcome.id, kind: "task_outcome" },
          },
        ],
      });

    mira.promoteSemanticPressure({
      id: "reason:mira:r6:cumulative-runtime:choice",
      tick: world.tick,
      kind: "uncertainty",
      salience: 0.82,
      summary: "Two current legal futures compete for one free body.",
      evidenceIds: candidateRunIds,
    });
    const choiceBatch = waitForBatch(mira, world);
    const owner = new ResidentLifeChoiceOwner(mira, world.options.fixedDeltaSeconds);
    const choiceAttempt = owner.prepare(choiceBatch, choiceLife);
    if (!choiceAttempt) throw new Error("cumulative same-actor choice attempt missing");

    const idaSupport = choiceAttempt.candidateSupports.find(
      (candidate) => candidate.matterId === currentIda.matter.id,
    );
    const otherSupport = choiceAttempt.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER,
    );
    expect(idaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: oldAOutcome.id,
        sourceMatterId: OLD_A,
        relation: "prior_same_actor_outcome",
      }),
      expect.objectContaining({
        evidenceId: oldBOutcome.id,
        sourceMatterId: OLD_B,
        relation: "prior_same_actor_outcome",
      }),
      expect.objectContaining({
        relation: "matter_origin",
      }),
    ]));
    expect(otherSupport?.facts.some(
      (fact) => fact.evidenceId === oldAOutcome.id || fact.evidenceId === oldBOutcome.id,
    )).toBe(false);

    // No priority is hard-coded. Both histories may be cited comparatively while the
    // unrelated candidate's ordinary origin remains candidate-local.
    expect(allowedChoiceSupportEvidenceIds(
      choiceAttempt.candidateSupports,
      currentIda.matter.id,
    )).toEqual(expect.arrayContaining([oldAOutcome.id, oldBOutcome.id]));
    expect(allowedChoiceSupportEvidenceIds(
      choiceAttempt.candidateSupports,
      OTHER,
    )).toEqual(expect.arrayContaining([oldAOutcome.id, oldBOutcome.id]));
    expect(allowedChoiceSupportEvidenceIds(
      choiceAttempt.candidateSupports,
      currentIda.matter.id,
    )).not.toContain(otherOrigin.id);

    expect(owner.settle(
      choiceAttempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: OTHER,
          reason: "the two earlier factual Ida episodes belong to the competing Ida future, so I may still choose the unrelated future instead",
          supportEvidenceIds: [oldAOutcome.id, oldBOutcome.id, otherOrigin.id],
          reviewAfterSeconds: 30,
        },
      },
      choiceLife,
      world.tick,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: OTHER,
      },
    });

    expect(kernel.matter(OLD_A)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(kernel.matter(OLD_B)).toMatchObject({ status: "resolved", activeRunId: null });
  });
});

function terminalCommunicationEpisode(
  kernel: ResidentContinuityKernel,
  scope: ResidentLifeMatterScope,
  matterId: string,
  runId: string,
  label: string,
  tick: number,
) {
  const origin = kernel.recordEvidence({
    id: `evidence:${matterId}:origin`,
    tick,
    kind: "life_context",
    summary: label,
  });
  kernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: label,
    semanticIntent: {
      kind: "communicate_actor",
      goal: label,
      targetActorId: IDA_ID,
      text: `${label}.`,
    },
  });
  scope.track(matterId);
  kernel.bindRun({
    matterId,
    taskId: `task.${matterId}`,
    runId,
  });
  const reconciled = kernel.reconcileRunOutcome({
    runId,
    tick: tick + 1,
    status: "succeeded",
    summary: `factually delivered ${label}`,
  });
  expect(reconciled.status).toBe("recorded");
  if (reconciled.status !== "recorded") {
    throw new Error("cumulative same-actor old episode failed to reconcile");
  }
  kernel.resolveMatter(matterId);
  return reconciled.evidence;
}

function currentLife(
  kernel: ResidentContinuityKernel,
  scope: ResidentLifeMatterScope,
  focus: ResidentExecutionFocusAuthority,
  arbitrator: ResidentExecutionArbitrator,
) {
  return captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: scope.matterIds(),
  });
}

function waitForBatch(
  resident: ResidentRuntime,
  world: SpcWorldRuntime,
) {
  let batch = resident.takeCognitionBatch(world.tick);
  for (let guard = 0; !batch && guard < 240; guard += 1) {
    world.step();
    batch = resident.takeCognitionBatch(world.tick);
  }
  if (!batch) throw new Error("resident cognition batch did not become ready");
  return batch;
}
