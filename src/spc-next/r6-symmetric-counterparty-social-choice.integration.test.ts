import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { allowedChoiceSupportEvidenceIds } from "./resident-life-choice-causal-support";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { RegionNavigationGraph } from "./region-navigation";
import { ResidentRuntime } from "./resident-runtime";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const OREN_ID = "resident.oren";
const NELA_ID = "resident.nela";
const IDA_ID = "resident.ida";
const REGION_ID = "r6-symmetric-social-room";
const STANDING_ID = "matter.oren.r6.symmetric-social.standing";
const CARRIER = "matter.oren.r6.symmetric-social.carrier";
const CARRIER_RUN = "run.oren.r6.symmetric-social.carrier";

describe("R6 symmetric social-vs-social counterparty-history pressure", () => {
  it("forms equal-current Nela and Ida futures through normal authorities while only Nela owns exact old release provenance", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 700 },
      regions: [{
        id: REGION_ID,
        label: "R6 Symmetric Social Room",
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
    world.addResident(IDA_ID, "Ida", { x: 340, y: 350 });
    for (const id of [OREN_ID, NELA_ID, IDA_ID]) {
      world.familiarizeResidentWithRegions(id, [REGION_ID]);
    }
    world.step();

    const privateActors = oren.cognitionContext({
      residentId: OREN_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).knownActors;
    expect(privateActors.find((actor) => actor.id === NELA_ID)).toMatchObject({
      id: NELA_ID,
      currentlyVisible: true,
    });
    expect(privateActors.find((actor) => actor.id === IDA_ID)).toMatchObject({
      id: IDA_ID,
      currentlyVisible: true,
    });

    const life = new ResidentCausalLifeSubstrate({
      residentId: OREN_ID,
      resident: oren,
      world,
      navigation: new RegionNavigationGraph(
        [{ id: REGION_ID, destinationPoint: { x: 420, y: 350 } }],
        [],
      ),
      identityNamespace: "oren-r6-symmetric-social",
    });

    const cognition = new ResidentCausalCognitionLane(life);
    const releaseEvidence = createFactualNelaRelease(life, world);
    for (let index = 0; index < 80; index += 1) {
      world.step();
      life.kernel.recordEvidence({
        id: `evidence.oren.r6.symmetric-social.churn.${index}`,
        tick: world.tick,
        kind: "later_life",
        summary: `ordinary unrelated later life after Nela release ${index}`,
      });
    }
    expect(life.kernel.recentEvidenceSnapshot().some((entry) => entry.id === releaseEvidence.id))
      .toBe(false);
    expect(life.currentLifeView().matters.some((matter) => matter.id === STANDING_ID))
      .toBe(false);

    const carrierOrigin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.symmetric-social.carrier-origin",
      tick: world.tick,
      kind: "life_context",
      summary: "temporary body owner used only to form symmetric social ambiguity",
    });
    life.kernel.openMatter({
      id: CARRIER,
      originEvidenceId: carrierOrigin.id,
      semanticCourse: "temporary body owner",
    });
    life.matterScope.track(CARRIER);
    life.kernel.bindRun({
      matterId: CARRIER,
      taskId: "task.oren.r6.symmetric-social.carrier",
      runId: CARRIER_RUN,
    });
    expect(life.arbitrator.request(CARRIER_RUN)).toEqual({
      status: "acquired",
      runId: CARRIER_RUN,
    });

    const formationTick = world.tick;
    const nelaReasonId = "reason:oren:r6:symmetric-social:current-nela";
    const idaReasonId = "reason:oren:r6:symmetric-social:current-ida";
    for (const [id, actorName] of [
      [nelaReasonId, "Nela"],
      [idaReasonId, "Ida"],
    ] as const) {
      oren.promoteSemanticPressure({
        id,
        tick: formationTick,
        kind: "uncertainty",
        salience: 0.72,
        summary: `Oren independently has one current reason to speak with ${actorName} about the current situation.`,
        evidenceIds: [],
      });
    }

    const firstRequest = waitForCognitionRequest(cognition, world);
    expect(firstRequest.batch.reasons.map((reason) => reason.id).sort()).toEqual(
      [nelaReasonId, idaReasonId].sort(),
    );
    expect(firstRequest.batch.reasons.map((reason) => reason.tick)).toEqual([
      formationTick,
      formationTick,
    ]);

    const nelaCurrent = materializeCurrentCommunication({
      life,
      cognition,
      request: firstRequest,
      reasonId: nelaReasonId,
      targetActorId: NELA_ID,
      targetName: "Nela",
    });
    expect(nelaCurrent.matter.originEvidenceId).toBeTruthy();
    expect(nelaCurrent.matter.historicalSupport).toEqual([{
      relation: "prior_counterparty_social_outcome",
      sourceMatterId: STANDING_ID,
      evidenceId: releaseEvidence.id,
    }]);
    expect(life.currentLifeView().matters.find(
      (matter) => matter.id === nelaCurrent.matter.id,
    )?.activeRun).toMatchObject({
      runId: nelaCurrent.runId,
      bodyState: "deferred",
    });
    expect(life.currentLifeView().body.focusedRunId).toBe(CARRIER_RUN);

    const secondRequest = waitForCognitionRequest(cognition, world);
    expect(secondRequest.batch.reasons.map((reason) => reason.id)).toContain(idaReasonId);
    expect(secondRequest.batch.reasons.map((reason) => reason.id)).not.toContain(nelaReasonId);
    expect(secondRequest.batch.reasons.find((reason) => reason.id === idaReasonId)?.tick)
      .toBe(formationTick);

    const idaCurrent = materializeCurrentCommunication({
      life,
      cognition,
      request: secondRequest,
      reasonId: idaReasonId,
      targetActorId: IDA_ID,
      targetName: "Ida",
    });
    expect(idaCurrent.matter.originEvidenceId).toBeTruthy();
    expect(idaCurrent.matter.historicalSupport).toBeUndefined();
    expect(life.currentLifeView().matters.find(
      (matter) => matter.id === idaCurrent.matter.id,
    )?.activeRun).toMatchObject({
      runId: idaCurrent.runId,
      bodyState: "deferred",
    });
    expect(life.currentLifeView().body.focusedRunId).toBe(CARRIER_RUN);
    const nelaOrigin = life.kernel.originEvidence(nelaCurrent.matter.id);
    const idaOrigin = life.kernel.originEvidence(idaCurrent.matter.id);
    expect(nelaOrigin?.kind).toBe("accepted_cognition_commitment");
    expect(idaOrigin?.kind).toBe("accepted_cognition_commitment");
    expect(nelaOrigin?.tick).toBeGreaterThanOrEqual(formationTick);
    expect(idaOrigin?.tick).toBeGreaterThanOrEqual(nelaOrigin?.tick ?? formationTick);

    life.kernel.cancelMatter(CARRIER);
    life.kernel.retireRun(CARRIER_RUN);
    const candidateRunIds = [nelaCurrent.runId, idaCurrent.runId]
      .sort((a, b) => a.localeCompare(b));
    expect(life.arbitrator.reconcile()).toEqual({
      status: "choice_required",
      candidateRunIds,
    });

    const choiceLife = life.currentLifeView();
    expect(choiceLife.matters.some((matter) => matter.id === STANDING_ID)).toBe(false);
    expect(choiceLife.matters.find((matter) => matter.id === nelaCurrent.matter.id))
      .toMatchObject({
        status: "active",
        semanticIntent: {
          kind: "communicate_actor",
          targetActorId: NELA_ID,
        },
        historicalSupport: [{
          relation: "prior_counterparty_social_outcome",
          sourceMatterId: STANDING_ID,
          evidence: {
            id: releaseEvidence.id,
            kind: "resident_released_social_commitment",
          },
        }],
      });
    expect(choiceLife.matters.find((matter) => matter.id === idaCurrent.matter.id))
      .toMatchObject({
        status: "active",
        semanticIntent: {
          kind: "communicate_actor",
          targetActorId: IDA_ID,
        },
      });
    expect(choiceLife.matters.find((matter) => matter.id === idaCurrent.matter.id)
      ?.historicalSupport).toBeUndefined();

    const choiceReason = {
      id: "reason:oren:r6:symmetric-social:choice",
      tick: world.tick,
      kind: "uncertainty" as const,
      salience: 0.82,
      summary: "Two equally current social futures compete for one free body.",
      evidenceIds: candidateRunIds,
    };
    oren.promoteSemanticPressure(choiceReason);
    const choiceBatch = waitForBatch(oren, world);
    const owner = new ResidentLifeChoiceOwner(oren, world.options.fixedDeltaSeconds);
    const attempt = owner.prepare(choiceBatch, choiceLife);
    if (!attempt) throw new Error("symmetric social choice attempt missing");

    const nelaSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === nelaCurrent.matter.id,
    );
    const idaSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === idaCurrent.matter.id,
    );
    expect(nelaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: releaseEvidence.id,
        sourceMatterId: STANDING_ID,
        relation: "prior_counterparty_social_outcome",
        evidenceKind: "resident_released_social_commitment",
      }),
      expect.objectContaining({
        evidenceId: nelaOrigin?.id,
        relation: "matter_origin",
      }),
    ]));
    expect(idaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: idaOrigin?.id,
        relation: "matter_origin",
      }),
    ]));
    expect(idaSupport?.facts.some((fact) => fact.evidenceId === releaseEvidence.id)).toBe(false);

    expect(allowedChoiceSupportEvidenceIds(
      attempt.candidateSupports,
      nelaCurrent.matter.id,
    )).toContain(releaseEvidence.id);
    expect(allowedChoiceSupportEvidenceIds(
      attempt.candidateSupports,
      idaCurrent.matter.id,
    )).toContain(releaseEvidence.id);

    // Use fresh choice owners/residents to prove every semantic outcome remains legal
    // from the same frozen life instead of mutating the first attempt three times.
    expect(settleFreshChoice({
      life: choiceLife,
      reason: choiceReason,
      matterId: nelaCurrent.matter.id,
      supportEvidenceIds: [releaseEvidence.id, nelaOrigin!.id],
      rationale: "choose Nela; her exact earlier release is relevant to that social future",
      tick: world.tick,
      fixedDeltaSeconds: world.options.fixedDeltaSeconds,
    })).toMatchObject({
      status: "applied",
      decision: { kind: "focus_matter", matterId: nelaCurrent.matter.id },
    });

    expect(settleFreshChoice({
      life: choiceLife,
      reason: choiceReason,
      matterId: idaCurrent.matter.id,
      supportEvidenceIds: [releaseEvidence.id, idaOrigin!.id],
      rationale: "choose Ida; Nela's exact earlier release belongs to the competing social future and may matter comparatively",
      tick: world.tick,
      fixedDeltaSeconds: world.options.fixedDeltaSeconds,
    })).toMatchObject({
      status: "applied",
      decision: { kind: "focus_matter", matterId: idaCurrent.matter.id },
    });

    expect(settleFreshChoice({
      life: choiceLife,
      reason: choiceReason,
      matterId: null,
      supportEvidenceIds: [],
      rationale: "both equally current social futures remain coherent, so defer both briefly",
      tick: world.tick,
      fixedDeltaSeconds: world.options.fixedDeltaSeconds,
    })).toMatchObject({
      status: "applied",
      decision: { kind: "defer_all" },
    });

    expect(life.kernel.matter(STANDING_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });
});

function createFactualNelaRelease(
  life: ResidentCausalLifeSubstrate,
  world: SpcWorldRuntime,
) {
  const standingOrigin = life.kernel.recordEvidence({
    id: "evidence.oren.r6.symmetric-social.standing-origin",
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
  const origin = nelaKernel.recordEvidence({
    id: "evidence.nela.r6.symmetric-social.release-origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Nela independently decided to release Oren.",
  });
  const matterId = "matter.nela.r6.symmetric-social.release";
  const runId = "run.nela.r6.symmetric-social.release";
  nelaKernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: "release Oren from the standing commitment",
  });
  nelaKernel.bindRun({
    matterId,
    taskId: "task.nela.r6.symmetric-social.release",
    runId,
  });
  const speech = nelaAuthority.apply({
    runId,
    effects: [{
      kind: "speech",
      text: "Dzięki, możesz już iść. Nie musisz tu dłużej zostawać.",
      radius: 420,
      addressedActorIds: [OREN_ID],
    }],
  });
  expect(speech.status).toBe("applied");
  if (speech.status !== "applied") throw new Error("symmetric Nela release speech lost authority");
  const occurrence = speech.occurrences[0]!;
  expect(nelaKernel.reconcileRunOutcome({
    runId,
    tick: world.tick,
    status: "succeeded",
    summary: "Nela factually released Oren through addressed World speech.",
  }).status).toBe("recorded");
  nelaKernel.resolveMatter(matterId);
  world.step();

  const percept = life.resident.cognitionContext({
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

  // The old counterparty episode must be fully lived in its own time. Do not carry
  // an unresolved heard-speech pressure into the later symmetric Nela-vs-Ida choice.
  const releaseBatch = waitForBatch(life.resident, world);
  const releaseReason = releaseBatch.reasons.find((reason) => (
    reason.kind === "heard_speech"
    && reason.evidenceIds.includes(percept!.id)
  )) ?? null;
  expect(releaseReason).not.toBeNull();
  if (!releaseReason) throw new Error("old Nela release never reached Oren cognition");

  const released = life.originatedSocialCommitments.releaseAfterCounterpartySpeech({
    matterId: STANDING_ID,
    occurrenceId: occurrence.id,
    tick: world.tick,
    reason: "Nela explicitly released the standing responsibility.",
  });
  expect(life.resident.reconcileCognitionSettlement({
    batch: releaseBatch,
    originReasonId: releaseReason.id,
    decision: "release_standing",
    tick: world.tick,
  })).toEqual({
    settledReasonIds: [releaseReason.id],
    retainedReasonIds: [],
  });
  expect(life.resident.pendingCognitionReasons()).toEqual([]);

  return released.releaseEvidence;
}

function materializeCurrentCommunication(input: {
  life: ResidentCausalLifeSubstrate;
  cognition: ResidentCausalCognitionLane;
  request: NonNullable<ReturnType<ResidentCausalCognitionLane["takeReadyRequest"]>>;
  reasonId: string;
  targetActorId: string;
  targetName: string;
}) {
  const { life, cognition, request, reasonId, targetActorId, targetName } = input;
  const reason = request.batch.reasons.find((candidate) => candidate.id === reasonId);
  if (!reason) throw new Error(`missing symmetric current reason: ${reasonId}`);

  const proposal = {
    version: 1 as const,
    commitmentDecision: {
      kind: "accept" as const,
      reason: `I have one current reason to speak with ${targetName} now.`,
      intent: {
        kind: "communicate" as const,
        goal: `speak with ${targetName} about the current situation`,
        targetActorId,
        targetRegionId: null,
        targetPosition: null,
        text: `${targetName}, porozmawiajmy o tym, co dzieje się teraz.`,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  };

  const settled = cognition.settleCommitment(request, proposal, reason.id);
  expect(settled).toMatchObject({
    status: "applied",
    residentId: OREN_ID,
    decision: "accept",
    commitment: {
      matterId: expect.any(String),
      runId: expect.any(String),
    },
  });
  if (settled.status !== "applied" || !settled.commitment) {
    throw new Error(`symmetric current ${targetName} commitment rejected`);
  }
  const matter = life.kernel.matter(settled.commitment.matterId);
  if (!matter) throw new Error(`symmetric current ${targetName} matter missing after admission`);
  return {
    matter,
    runId: settled.commitment.runId,
  };
}

function waitForCognitionRequest(
  cognition: ResidentCausalCognitionLane,
  world: SpcWorldRuntime,
) {
  let request = cognition.takeReadyRequest();
  for (let guard = 0; !request && guard < 240; guard += 1) {
    world.step();
    request = cognition.takeReadyRequest();
  }
  if (!request) throw new Error("resident causal cognition request did not become ready");
  return request;
}

function settleFreshChoice(input: {
  life: ResidentLifeCognitionView;
  reason: {
    id: string;
    tick: number;
    kind: "uncertainty";
    salience: number;
    summary: string;
    evidenceIds: string[];
  };
  matterId: string | null;
  supportEvidenceIds: string[];
  rationale: string;
  tick: number;
  fixedDeltaSeconds: number;
}) {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: OREN_ID,
    name: "Oren",
  });
  resident.promoteSemanticPressure(input.reason);
  const batch = resident.takeCognitionBatch(input.tick);
  if (!batch) throw new Error("fresh symmetric choice batch missing");
  const owner = new ResidentLifeChoiceOwner(resident, input.fixedDeltaSeconds);
  const attempt = owner.prepare(batch, input.life);
  if (!attempt) throw new Error("fresh symmetric choice attempt missing");

  const proposal = input.matterId === null
    ? {
        version: 1,
        decision: {
          kind: "defer_all",
          reason: input.rationale,
          reviewAfterSeconds: 30,
        },
      }
    : {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: input.matterId,
          reason: input.rationale,
          supportEvidenceIds: input.supportEvidenceIds,
          reviewAfterSeconds: 30,
        },
      };
  return owner.settle(attempt, proposal, input.life, input.tick);
}

function waitForBatch(resident: ResidentRuntime, world: SpcWorldRuntime) {
  let batch = resident.takeCognitionBatch(world.tick);
  for (let guard = 0; !batch && guard < 240; guard += 1) {
    world.step();
    batch = resident.takeCognitionBatch(world.tick);
  }
  if (!batch) throw new Error("resident cognition batch did not become ready");
  return batch;
}
