import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { RegionNavigationGraph } from "./region-navigation";
import { ResidentRuntime } from "./resident-runtime";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const OREN_ID = "resident.oren";
const NELA_ID = "resident.nela";
const REGION_ID = "r6-counterparty-history-room";
const STANDING_ID = "matter.oren.r6.counterparty-history.standing";
const CURRENT_NELA = "matter.oren.r6.counterparty-history.current-nela";
const CURRENT_NELA_RUN = "run.oren.r6.counterparty-history.current-nela";
const CURRENT_OTHER = "matter.oren.r6.counterparty-history.current-other";
const CURRENT_OTHER_RUN = "run.oren.r6.counterparty-history.current-other";
const CARRIER = "matter.oren.r6.counterparty-history.carrier";
const CARRIER_RUN = "run.oren.r6.counterparty-history.carrier";

describe("R6 durable counterparty-caused social history gap", () => {
  it("shows exact factual Nela release changes Oren now but disappears before a later Nela-vs-other choice", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 900, maxY: 700 },
      regions: [{
        id: REGION_ID,
        label: "R6 Counterparty History Room",
        minX: 0,
        minY: 0,
        maxX: 900,
        maxY: 700,
      }],
      anchors: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    const oren = world.addResident(OREN_ID, "Oren", { x: 420, y: 350 });
    world.addResident(NELA_ID, "Nela", { x: 500, y: 350 });
    world.familiarizeResidentWithRegions(OREN_ID, [REGION_ID]);
    world.familiarizeResidentWithRegions(NELA_ID, [REGION_ID]);
    world.step();

    const life = new ResidentCausalLifeSubstrate({
      residentId: OREN_ID,
      resident: oren,
      world,
      navigation: new RegionNavigationGraph(
        [{ id: REGION_ID, destinationPoint: { x: 420, y: 350 } }],
        [],
      ),
      identityNamespace: "oren-r6-counterparty-history",
    });

    const standingOrigin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.counterparty-history.standing-origin",
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
      id: "evidence.nela.r6.counterparty-history.release-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "Nela independently decided to release Oren.",
    });
    const speechMatter = "matter.nela.r6.counterparty-history.release";
    const speechRun = "run.nela.r6.counterparty-history.release";
    nelaKernel.openMatter({
      id: speechMatter,
      originEvidenceId: speechOrigin.id,
      semanticCourse: "release Oren from the standing commitment",
    });
    nelaKernel.bindRun({
      matterId: speechMatter,
      taskId: "task.nela.r6.counterparty-history.release",
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
    if (speech.status !== "applied") throw new Error("counterparty release speech lost authority");
    const occurrence = speech.occurrences[0]!;
    expect(nelaKernel.reconcileRunOutcome({
      runId: speechRun,
      tick: world.tick,
      status: "succeeded",
      summary: "Nela factually released Oren through addressed World speech.",
    }).status).toBe("recorded");
    nelaKernel.resolveMatter(speechMatter);

    world.step();
    const percept = oren.cognitionContext({
      residentId: OREN_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).recentPercepts.find((candidate) => candidate.occurrenceId === occurrence.id);
    expect(percept).toMatchObject({
      phenomenon: "speech",
      actorId: NELA_ID,
      addressed: true,
      text: occurrence.text,
    });

    const released = life.originatedSocialCommitments.releaseAfterCounterpartySpeech({
      matterId: STANDING_ID,
      occurrenceId: occurrence.id,
      tick: world.tick,
      reason: "Nela explicitly released the standing responsibility.",
    });
    expect(released.matter).toMatchObject({
      status: "resolved",
      activeRunId: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        counterpartyActorId: NELA_ID,
      },
    });
    expect(released.releaseEvidence).toMatchObject({
      kind: "resident_released_social_commitment",
      summary: expect.stringContaining(occurrence.id),
    });
    const releaseEvidenceId = released.releaseEvidence.id;
    expect(life.kernel.recentEvidenceSnapshot().some((entry) => entry.id === releaseEvidenceId))
      .toBe(true);

    // Ordinary later life advances far enough to evict both the heard speech and the
    // resident-owned release evidence from bounded recent context.
    for (let index = 0; index < 80; index += 1) {
      world.step();
      life.kernel.recordEvidence({
        id: `evidence.oren.r6.counterparty-history.churn.${index}`,
        tick: world.tick,
        kind: "later_life",
        summary: `ordinary unrelated later life after Nela release ${index}`,
      });
    }
    expect(life.kernel.recentEvidenceSnapshot().some((entry) => entry.id === releaseEvidenceId))
      .toBe(false);
    expect(life.kernel.terminalOutcomeArchiveSnapshot().some(
      (entry) => entry.evidence.id === releaseEvidenceId,
    )).toBe(false);
    expect(life.currentLifeView().matters.some((matter) => matter.id === STANDING_ID))
      .toBe(false);

    // Build a genuine later ambiguity while a temporary carrier prevents order bias.
    const carrierOrigin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.counterparty-history.carrier-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "temporary body owner for later Nela-vs-other ambiguity",
    });
    life.kernel.openMatter({
      id: CARRIER,
      originEvidenceId: carrierOrigin.id,
      semanticCourse: "temporary body owner",
    });
    life.matterScope.track(CARRIER);
    life.kernel.bindRun({
      matterId: CARRIER,
      taskId: "task.oren.r6.counterparty-history.carrier",
      runId: CARRIER_RUN,
    });
    expect(life.arbitrator.request(CARRIER_RUN)).toEqual({
      status: "acquired",
      runId: CARRIER_RUN,
    });

    const nelaCurrentOrigin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.counterparty-history.current-nela-origin",
      tick: world.tick,
      kind: "accepted_cognition_commitment",
      summary: "Oren independently has one current bounded reason to speak with Nela.",
    });
    life.kernel.openMatter({
      id: CURRENT_NELA,
      originEvidenceId: nelaCurrentOrigin.id,
      semanticCourse: "speak with Nela about the current situation",
      semanticIntent: {
        kind: "communicate_actor",
        goal: "speak with Nela about the current situation",
        targetActorId: NELA_ID,
        text: "Nela, porozmawiajmy o tym, co dzieje się teraz.",
      },
    });
    life.matterScope.track(CURRENT_NELA);
    life.kernel.bindRun({
      matterId: CURRENT_NELA,
      taskId: "task.oren.r6.counterparty-history.current-nela",
      runId: CURRENT_NELA_RUN,
    });
    expect(life.arbitrator.request(CURRENT_NELA_RUN)).toMatchObject({
      status: "busy",
      focusedRunId: CARRIER_RUN,
    });

    const otherOrigin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.counterparty-history.current-other-origin",
      tick: world.tick,
      kind: "accepted_cognition_commitment",
      summary: "Oren independently has one unrelated current workshop future.",
    });
    life.kernel.openMatter({
      id: CURRENT_OTHER,
      originEvidenceId: otherOrigin.id,
      semanticCourse: "visit the familiar room for an unrelated ordinary reason",
      semanticIntent: {
        kind: "travel_region",
        goal: "take the unrelated current route",
        targetRegionId: REGION_ID,
      },
    });
    life.matterScope.track(CURRENT_OTHER);
    life.kernel.bindRun({
      matterId: CURRENT_OTHER,
      taskId: "task.oren.r6.counterparty-history.current-other",
      runId: CURRENT_OTHER_RUN,
    });
    expect(life.arbitrator.request(CURRENT_OTHER_RUN)).toMatchObject({
      status: "busy",
      focusedRunId: CARRIER_RUN,
    });

    life.kernel.cancelMatter(CARRIER);
    life.kernel.retireRun(CARRIER_RUN);
    expect(life.arbitrator.reconcile()).toEqual({
      status: "choice_required",
      candidateRunIds: [CURRENT_NELA_RUN, CURRENT_OTHER_RUN].sort((a, b) => a.localeCompare(b)),
    });

    const choiceLife = life.currentLifeView();
    const currentNela = choiceLife.matters.find((matter) => matter.id === CURRENT_NELA);
    expect(currentNela).toMatchObject({
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: NELA_ID,
      },
    });
    // Current same-actor support can only recover terminal communicate_actor task
    // outcomes. Nela's factual release of Oren is neither one of Oren's communicate
    // task outcomes nor retained in the terminal task-outcome archive.
    expect(currentNela?.historicalSupport).toBeUndefined();

    oren.promoteSemanticPressure({
      id: "reason:oren:r6:counterparty-history:choice",
      tick: world.tick,
      kind: "uncertainty",
      salience: 0.82,
      summary: "Two current legal futures compete for one free body.",
      evidenceIds: [CURRENT_NELA_RUN, CURRENT_OTHER_RUN],
    });
    const batch = oren.takeCognitionBatch(world.tick + 30);
    if (!batch) throw new Error("counterparty-history characterization produced no choice batch");
    const owner = new ResidentLifeChoiceOwner(oren, 1 / 60);
    const attempt = owner.prepare(batch, choiceLife);
    if (!attempt) throw new Error("counterparty-history characterization produced no choice attempt");

    expect(attempt.candidateSupports.flatMap((candidate) => candidate.facts)
      .some((fact) => fact.evidenceId === releaseEvidenceId)).toBe(false);

    // The later judgement cannot simply cite the exact old release fact. Admission
    // rejects it because no current candidate owns an admissible causal relation to it.
    expect(owner.settle(
      attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: CURRENT_NELA,
          reason: "Nela previously factually released my standing responsibility and that old act matters to how I treat this new Nela future.",
          supportEvidenceIds: [releaseEvidenceId, nelaCurrentOrigin.id],
          reviewAfterSeconds: 30,
        },
      },
      choiceLife,
      world.tick + 30,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });
  });
});

function resident(id: string, name: string) {
  return new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id,
    name,
  });
}
