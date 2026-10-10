import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const RESIDENT_ID = "resident.mira";
const IDA_ID = "resident.ida";

const OLD_A = "matter.mira.r6.cumulative-social.old-a";
const OLD_B = "matter.mira.r6.cumulative-social.old-b";
const OLD_A_RUN = "run.mira.r6.cumulative-social.old-a";
const OLD_B_RUN = "run.mira.r6.cumulative-social.old-b";

const CURRENT_IDA = "matter.mira.r6.cumulative-social.current-ida";
const CURRENT_IDA_RUN = "run.mira.r6.cumulative-social.current-ida";
const CURRENT_OTHER = "matter.mira.r6.cumulative-social.current-other";
const CURRENT_OTHER_RUN = "run.mira.r6.cumulative-social.current-other";
const CARRIER = "matter.mira.r6.cumulative-social.carrier";
const CARRIER_RUN = "run.mira.r6.cumulative-social.carrier";

describe("R6 cumulative ordinary same-actor history support gap", () => {
  it("shows that two exact terminal factual Ida episodes survive bounded archive but have no legal route into a later Ida-vs-other choice", () => {
    const state = setup();

    expect(state.kernel.archivedTerminalOutcomeEvidence(OLD_A)).toEqual(state.oldAOutcome);
    expect(state.kernel.archivedTerminalOutcomeEvidence(OLD_B)).toEqual(state.oldBOutcome);
    expect(state.kernel.recentEvidenceSnapshot().some(
      (entry) => entry.id === state.oldAOutcome.id || entry.id === state.oldBOutcome.id,
    )).toBe(false);

    // Homeostasis remains correct: the old conversations are not current work.
    expect(state.life.matters.map((matter) => matter.id).sort()).toEqual(
      [CURRENT_IDA, CURRENT_OTHER].sort(),
    );
    expect(state.life.matters.some((matter) => matter.id === OLD_A || matter.id === OLD_B))
      .toBe(false);

    // Both historical matters have the exact same structured actor relation to C,
    // but current choice support exposes only C's current origin. The archive is not
    // globally prompt-visible and there is no earned cumulative same-actor relation.
    const idaSupport = state.attempt.candidateSupports.find(
      (candidate) => candidate.matterId === CURRENT_IDA,
    );
    expect(idaSupport?.facts).toEqual([
      expect.objectContaining({
        evidenceId: state.currentIdaOriginId,
        relation: "matter_origin",
      }),
    ]);
    expect(idaSupport?.facts.some(
      (fact) => fact.evidenceId === state.oldAOutcome.id
        || fact.evidenceId === state.oldBOutcome.id,
    )).toBe(false);

    // A later judgement cannot simply name the archived facts. Local admission rejects
    // both citations because no current candidate owns a defended causal relation to
    // them. This is the gap; do not solve it by making archive globally readable.
    expect(state.owner.settle(
      state.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: CURRENT_IDA,
          reason: "my two earlier factual Ida episodes jointly matter to whether I engage with Ida again",
          supportEvidenceIds: [
            state.oldAOutcome.id,
            state.oldBOutcome.id,
          ],
          reviewAfterSeconds: 30,
        },
      },
      state.life,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });
  });

  it("keeps the current Ida future itself legal, proving the failure is historical attribution rather than a hidden priority policy", () => {
    const state = setup();

    expect(state.owner.settle(
      state.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: CURRENT_IDA,
          reason: "the current Ida contact is independently grounded now",
          supportEvidenceIds: [state.currentIdaOriginId],
          reviewAfterSeconds: 30,
        },
      },
      state.life,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: CURRENT_IDA,
        supportEvidenceIds: [state.currentIdaOriginId],
      },
    });

    expect(state.kernel.matter(OLD_A)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: IDA_ID,
      },
    });
    expect(state.kernel.matter(OLD_B)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: IDA_ID,
      },
    });
  });
});

function setup() {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: RESIDENT_ID,
    name: "Mira",
  });
  const kernel = new ResidentContinuityKernel({
    recentEvidenceLimit: 2,
    terminalOutcomeArchiveLimit: 8,
  });
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);

  const oldAOutcome = terminalCommunicationEpisode(
    kernel,
    OLD_A,
    OLD_A_RUN,
    "first ordinary factual exchange with Ida",
    1,
  );
  const oldBOutcome = terminalCommunicationEpisode(
    kernel,
    OLD_B,
    OLD_B_RUN,
    "second independent ordinary factual exchange with Ida",
    10,
  );

  for (let index = 0; index < 4; index += 1) {
    kernel.recordEvidence({
      id: `evidence:mira:r6:cumulative-social:churn:${index}`,
      tick: 20 + index,
      kind: "later_life",
      summary: `ordinary unrelated life after old social episodes ${index}`,
    });
  }

  const currentIdaOrigin = kernel.recordEvidence({
    id: "evidence:mira:r6:cumulative-social:current-ida-origin",
    tick: 40,
    kind: "accepted_cognition_commitment",
    summary: "Mira has one current bounded reason to speak with Ida again.",
  });
  kernel.openMatter({
    id: CURRENT_IDA,
    originEvidenceId: currentIdaOrigin.id,
    semanticCourse: "speak with Ida about the current situation",
    semanticIntent: {
      kind: "communicate_actor",
      goal: "speak with Ida about the current situation",
      targetActorId: IDA_ID,
      text: "Ida, chcę z tobą porozmawiać o tym, co dzieje się teraz.",
    },
  });
  kernel.bindRun({
    matterId: CURRENT_IDA,
    taskId: "task.mira.r6.cumulative-social.current-ida",
    runId: CURRENT_IDA_RUN,
  });

  const currentOtherOrigin = kernel.recordEvidence({
    id: "evidence:mira:r6:cumulative-social:current-other-origin",
    tick: 40,
    kind: "accepted_cognition_commitment",
    summary: "Mira independently has one ordinary current reason to visit the workshop.",
  });
  kernel.openMatter({
    id: CURRENT_OTHER,
    originEvidenceId: currentOtherOrigin.id,
    semanticCourse: "visit the familiar workshop",
    semanticIntent: {
      kind: "travel_region",
      goal: "visit the familiar workshop",
      targetRegionId: "workshop",
    },
  });
  kernel.bindRun({
    matterId: CURRENT_OTHER,
    taskId: "task.mira.r6.cumulative-social.current-other",
    runId: CURRENT_OTHER_RUN,
  });

  const carrierOrigin = kernel.recordEvidence({
    id: "evidence:mira:r6:cumulative-social:carrier-origin",
    tick: 40,
    kind: "life_context",
    summary: "temporary body owner used only to form normal deferred ambiguity",
  });
  kernel.openMatter({
    id: CARRIER,
    originEvidenceId: carrierOrigin.id,
    semanticCourse: "temporary body owner",
  });
  kernel.bindRun({
    matterId: CARRIER,
    taskId: "task.mira.r6.cumulative-social.carrier",
    runId: CARRIER_RUN,
  });

  expect(arbitrator.request(CARRIER_RUN)).toEqual({
    status: "acquired",
    runId: CARRIER_RUN,
  });
  expect(arbitrator.request(CURRENT_IDA_RUN)).toMatchObject({
    status: "busy",
    focusedRunId: CARRIER_RUN,
  });
  expect(arbitrator.request(CURRENT_OTHER_RUN)).toMatchObject({
    status: "busy",
    focusedRunId: CARRIER_RUN,
  });

  kernel.cancelMatter(CARRIER);
  kernel.retireRun(CARRIER_RUN);
  const candidateRunIds = [CURRENT_IDA_RUN, CURRENT_OTHER_RUN]
    .sort((left, right) => left.localeCompare(right));
  expect(arbitrator.reconcile()).toEqual({
    status: "choice_required",
    candidateRunIds,
  });

  const life = captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: [CURRENT_IDA, CURRENT_OTHER],
  });

  resident.promoteSemanticPressure({
    id: "reason:mira:r6:cumulative-social:choice",
    tick: 40,
    kind: "uncertainty",
    salience: 0.8,
    summary: "Two current legal futures compete for one free body.",
    evidenceIds: candidateRunIds,
  });
  const batch = resident.takeCognitionBatch(70);
  if (!batch) throw new Error("cumulative-social characterization produced no choice batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("cumulative-social characterization produced no choice attempt");

  return {
    resident,
    kernel,
    focus,
    arbitrator,
    life,
    owner,
    attempt,
    oldAOutcome,
    oldBOutcome,
    currentIdaOriginId: currentIdaOrigin.id,
  };
}

function terminalCommunicationEpisode(
  kernel: ResidentContinuityKernel,
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
    throw new Error("cumulative-social fixture failed to record factual outcome");
  }
  kernel.resolveMatter(matterId);
  return reconciled.evidence;
}
