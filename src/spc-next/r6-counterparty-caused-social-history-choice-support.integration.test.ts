import { describe, expect, it } from "vitest";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { allowedChoiceSupportEvidenceIds } from "./resident-life-choice-causal-support";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { RegionNavigationGraph } from "./region-navigation";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const OREN_ID = "resident.oren";
const NELA_ID = "resident.nela";
const IDA_ID = "resident.ida";
const REGION_ID = "r6-counterparty-support-room";
const STANDING_ID = "matter.oren.r6.counterparty-support.standing";
const CARRIER = "matter.oren.r6.counterparty-support.carrier";
const CARRIER_RUN = "run.oren.r6.counterparty-support.carrier";
const OTHER = "matter.oren.r6.counterparty-support.other";
const OTHER_RUN = "run.oren.r6.counterparty-support.other";

describe("R6 durable counterparty-caused social history through normal current-matter production", () => {
  it("binds exact old Nela release to a later current Nela future after the old matter leaves current life", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 700 },
      regions: [{
        id: REGION_ID,
        label: "R6 Counterparty Support Room",
        minX: 0,
        minY: 0,
        maxX: 1_000,
        maxY: 700,
      }],
      anchors: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    const oren = world.addResident(OREN_ID, "Oren", { x: 420, y: 350 });
    world.addResident(NELA_ID, "Nela", { x: 500, y: 350 });
    world.addResident(IDA_ID, "Ida", { x: 580, y: 350 });
    for (const id of [OREN_ID, NELA_ID, IDA_ID]) {
      world.familiarizeResidentWithRegions(id, [REGION_ID]);
    }
    world.step();

    const life = new ResidentCausalLifeSubstrate({
      residentId: OREN_ID,
      resident: oren,
      world,
      navigation: new RegionNavigationGraph(
        [{ id: REGION_ID, destinationPoint: { x: 420, y: 350 } }],
        [],
      ),
      identityNamespace: "oren-r6-counterparty-support",
    });

    const standingOrigin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.counterparty-support.standing-origin",
      tick: world.tick,
      kind: "resident_originated_social_commitment",
      summary: "Oren factually made one standing commitment to Nela.",
    });
    life.kernel.openMatter({
      id: STANDING_ID,
      originEvidenceId: standingOrigin.id,
      semanticCourse: "remain available to Nela until she releases the commitment",
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: "remain available to Nela",
        counterpartyActorId: NELA_ID,
        commitment: "Tak, zostanę tutaj, dopóki nie powiesz, że mogę iść.",
      },
    });
    life.matterScope.track(STANDING_ID);

    const nelaKernel = new ResidentContinuityKernel();
    const nelaAuthority = new ResidentWorldExecutionAuthority(NELA_ID, nelaKernel, world);
    const speechOrigin = nelaKernel.recordEvidence({
      id: "evidence.nela.r6.counterparty-support.release-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "Nela independently decided to release Oren.",
    });
    const speechMatter = "matter.nela.r6.counterparty-support.release";
    const speechRun = "run.nela.r6.counterparty-support.release";
    nelaKernel.openMatter({
      id: speechMatter,
      originEvidenceId: speechOrigin.id,
      semanticCourse: "release Oren from the standing commitment",
    });
    nelaKernel.bindRun({
      matterId: speechMatter,
      taskId: "task.nela.r6.counterparty-support.release",
      runId: speechRun,
    });
    const speech = nelaAuthority.apply({
      runId: speechRun,
      effects: [{
        kind: "speech",
        text: "Dzięki, możesz już iść. Nie musisz tu dłużej zostawać.",
        radius: 420,
        addressedActorIds: [OREN_ID],
      }],
    });
    expect(speech.status).toBe("applied");
    if (speech.status !== "applied") throw new Error("Nela release speech lost authority");
    const occurrence = speech.occurrences[0]!;
    expect(nelaKernel.reconcileRunOutcome({
      runId: speechRun,
      tick: world.tick,
      status: "succeeded",
      summary: "Nela factually released Oren through addressed World speech.",
    }).status).toBe("recorded");
    nelaKernel.resolveMatter(speechMatter);
    world.step();

    const released = life.originatedSocialCommitments.releaseAfterCounterpartySpeech({
      matterId: STANDING_ID,
      occurrenceId: occurrence.id,
      tick: world.tick,
      reason: "Nela explicitly released the standing responsibility.",
    });
    const releaseEvidence = released.releaseEvidence;
    expect(life.kernel.terminalSocialOutcomeArchiveSnapshot()).toEqual([
      {
        matterId: STANDING_ID,
        counterpartyActorId: NELA_ID,
        occurrenceId: occurrence.id,
        evidence: releaseEvidence,
      },
    ]);

    // Push release beyond bounded recent/current life; the dedicated social archive is
    // now the only resident-owned durable provenance for that counterparty act.
    for (let index = 0; index < 80; index += 1) {
      world.step();
      life.kernel.recordEvidence({
        id: `evidence.oren.r6.counterparty-support.churn.${index}`,
        tick: world.tick,
        kind: "later_life",
        summary: `ordinary unrelated later life after Nela release ${index}`,
      });
    }
    expect(life.kernel.recentEvidenceSnapshot().some((entry) => entry.id === releaseEvidence.id))
      .toBe(false);
    expect(life.currentLifeView().matters.some((matter) => matter.id === STANDING_ID))
      .toBe(false);

    // Same archive does not imply anything about another actor.
    expect(life.kernel.terminalSocialOutcomeArchiveSnapshot().some(
      (entry) => entry.counterpartyActorId === IDA_ID,
    )).toBe(false);

    const carrierOrigin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.counterparty-support.carrier-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "temporary body owner used only to create later genuine ambiguity",
    });
    life.kernel.openMatter({
      id: CARRIER,
      originEvidenceId: carrierOrigin.id,
      semanticCourse: "temporary body owner",
    });
    life.matterScope.track(CARRIER);
    life.kernel.bindRun({
      matterId: CARRIER,
      taskId: "task.oren.r6.counterparty-support.carrier",
      runId: CARRIER_RUN,
    });
    expect(life.arbitrator.request(CARRIER_RUN)).toEqual({
      status: "acquired",
      runId: CARRIER_RUN,
    });

    oren.promoteSemanticPressure({
      id: "reason:oren:r6:counterparty-support:current-nela",
      tick: world.tick,
      kind: "uncertainty",
      salience: 0.72,
      summary: "Oren independently has one current reason to speak with Nela.",
      evidenceIds: [],
    });
    const batch = waitForBatch(oren, world);
    const reason = batch.reasons.find(
      (candidate) => candidate.id === "reason:oren:r6:counterparty-support:current-nela",
    );
    if (!reason) throw new Error("current Nela reason did not reach cognition");
    const attempt = life.lifeIntentOwner.prepare(batch, life.currentLifeView(), world.tick);
    if (!attempt) throw new Error("current Nela life intent was not prepared");

    const proposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "I have one current reason to speak with Nela now.",
        intent: {
          kind: "communicate" as const,
          goal: "speak with Nela about the current situation",
          targetActorId: NELA_ID,
          targetRegionId: null,
          targetPosition: null,
          text: "Nela, porozmawiajmy o tym, co dzieje się teraz.",
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };

    const settled = life.lifeIntentOwner.settleCommitmentIntent(
      attempt,
      proposal,
      life.currentLifeView(),
      world.tick,
      (admittedProposal, providerContext) => life.reasonCommitments.groundCommitment({
        attempt,
        originReasonId: reason.id,
        proposal: admittedProposal,
        providerContext,
        groundingContext: oren.cognitionContext(batch, world.tick),
      }),
    );
    expect(settled.status).toBe("applied");
    if (settled.status !== "applied") {
      throw new Error(`current Nela commitment rejected: ${settled.status}`);
    }

    const currentNela = life.reasonCommitments.materializeCommitment({
      attempt,
      originReasonId: reason.id,
      proposal: settled.proposal,
      intent: settled.intent,
      tick: world.tick,
    });
    expect(currentNela.focusClaim).toMatchObject({
      status: "busy",
      focusedRunId: CARRIER_RUN,
    });
    expect(currentNela.matter).toMatchObject({
      status: "active",
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: NELA_ID,
      },
      historicalSupport: [{
        relation: "prior_counterparty_social_outcome",
        sourceMatterId: STANDING_ID,
        evidenceId: releaseEvidence.id,
      }],
    });

    const otherOrigin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.counterparty-support.other-origin",
      tick: world.tick,
      kind: "accepted_cognition_commitment",
      summary: "Oren independently has one unrelated current room future.",
    });
    life.kernel.openMatter({
      id: OTHER,
      originEvidenceId: otherOrigin.id,
      semanticCourse: "take the unrelated current route",
      semanticIntent: {
        kind: "travel_region",
        goal: "take the unrelated current route",
        targetRegionId: REGION_ID,
      },
    });
    life.matterScope.track(OTHER);
    life.kernel.bindRun({
      matterId: OTHER,
      taskId: "task.oren.r6.counterparty-support.other",
      runId: OTHER_RUN,
    });
    expect(life.arbitrator.request(OTHER_RUN)).toMatchObject({
      status: "busy",
      focusedRunId: CARRIER_RUN,
    });

    life.kernel.cancelMatter(CARRIER);
    life.kernel.retireRun(CARRIER_RUN);
    const candidateRunIds = [currentNela.runId, OTHER_RUN].sort((a, b) => a.localeCompare(b));
    expect(life.arbitrator.reconcile()).toEqual({
      status: "choice_required",
      candidateRunIds,
    });

    const choiceLife = life.currentLifeView();
    expect(choiceLife.matters.some((matter) => matter.id === STANDING_ID)).toBe(false);
    expect(choiceLife.matters.find((matter) => matter.id === currentNela.matter.id))
      .toMatchObject({
        historicalSupport: [{
          relation: "prior_counterparty_social_outcome",
          sourceMatterId: STANDING_ID,
          evidence: {
            id: releaseEvidence.id,
            kind: "resident_released_social_commitment",
          },
        }],
      });

    oren.promoteSemanticPressure({
      id: "reason:oren:r6:counterparty-support:choice",
      tick: world.tick,
      kind: "uncertainty",
      salience: 0.82,
      summary: "Two current legal futures compete for one free body.",
      evidenceIds: candidateRunIds,
    });
    const choiceBatch = waitForBatch(oren, world);
    const owner = new ResidentLifeChoiceOwner(oren, world.options.fixedDeltaSeconds);
    const choiceAttempt = owner.prepare(choiceBatch, choiceLife);
    if (!choiceAttempt) throw new Error("counterparty social choice attempt missing");

    const nelaSupport = choiceAttempt.candidateSupports.find(
      (candidate) => candidate.matterId === currentNela.matter.id,
    );
    const otherSupport = choiceAttempt.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER,
    );
    expect(nelaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: releaseEvidence.id,
        sourceMatterId: STANDING_ID,
        relation: "prior_counterparty_social_outcome",
        evidenceKind: "resident_released_social_commitment",
      }),
    ]));
    expect(otherSupport?.facts.some((fact) => fact.evidenceId === releaseEvidence.id)).toBe(false);

    expect(allowedChoiceSupportEvidenceIds(
      choiceAttempt.candidateSupports,
      currentNela.matter.id,
    )).toContain(releaseEvidence.id);
    expect(allowedChoiceSupportEvidenceIds(
      choiceAttempt.candidateSupports,
      OTHER,
    )).toContain(releaseEvidence.id);

    expect(owner.settle(
      choiceAttempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: OTHER,
          reason: "Nela's exact earlier release belongs to the competing Nela future and may matter comparatively while I choose the unrelated future.",
          supportEvidenceIds: [releaseEvidence.id, otherOrigin.id],
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

    expect(life.kernel.matter(STANDING_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });
});

function waitForBatch(
  resident: ReturnType<SpcWorldRuntime["addResident"]>,
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
