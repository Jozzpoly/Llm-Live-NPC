import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const OLD_MATTER = "matter.janek.r6.delayed-choice-supported.old-material";
const OLD_RUN = "run.janek.r6.delayed-choice-supported.old-material";
const RETRY_MATTER = "matter.janek.r6.delayed-choice-supported.retry";
const RETRY_RUN = "run.janek.r6.delayed-choice-supported.retry";
const OTHER_MATTER = "matter.janek.r6.delayed-choice-supported.other";
const OTHER_RUN = "run.janek.r6.delayed-choice-supported.other";
const CARRIER_MATTER = "matter.janek.r6.delayed-choice-supported.carrier";
const CARRIER_RUN = "run.janek.r6.delayed-choice-supported.carrier";
const OBJECT_ID = "crate.r6.delayed-choice-supported";

describe("R6 delayed factual history at competing-future choice", () => {
  it("keeps exact old factual support candidate-scoped after A left current life and admits retry or avoidance without reopening A", () => {
    const retry = setup();
    expect(retry.life.matters.some((matter) => matter.id === OLD_MATTER)).toBe(false);
    expect(retry.life.matters.find((matter) => matter.id === RETRY_MATTER)).toMatchObject({
      historicalSupport: [{
        relation: "prior_same_material_outcome",
        sourceMatterId: OLD_MATTER,
        evidence: retry.oldOutcome,
      }],
    });

    const retrySupport = retry.attempt.candidateSupports.find(
      (candidate) => candidate.matterId === RETRY_MATTER,
    );
    expect(retrySupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: retry.oldOutcome.id,
        sourceMatterId: OLD_MATTER,
        relation: "prior_same_material_outcome",
        evidenceKind: "task_outcome",
      }),
      expect.objectContaining({
        evidenceId: retry.retryOriginId,
        relation: "matter_origin",
      }),
    ]));

    expect(retry.owner.settle(
      retry.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: RETRY_MATTER,
          reason: "the exact earlier factual failure with this same crate matters to trying it again now",
          supportEvidenceIds: [retry.oldOutcome.id, retry.retryOriginId],
          reviewAfterSeconds: 12,
        },
      },
      retry.life,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: RETRY_MATTER,
        supportEvidenceIds: [retry.oldOutcome.id, retry.retryOriginId],
      },
    });
    expect(retry.kernel.matter(OLD_MATTER)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    const avoidance = setup();
    expect(avoidance.owner.settle(
      avoidance.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: OTHER_MATTER,
          reason: "the exact earlier crate failure belongs to the competing retry, so take the independent future instead",
          supportEvidenceIds: [avoidance.oldOutcome.id, avoidance.otherOriginId],
          reviewAfterSeconds: 12,
        },
      },
      avoidance.life,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: OTHER_MATTER,
        supportEvidenceIds: [avoidance.oldOutcome.id, avoidance.otherOriginId],
      },
    });
    expect(avoidance.kernel.matter(OLD_MATTER)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });

  it("does not turn unrelated candidate support into cross-candidate evidence just because historical comparison is allowed", () => {
    const state = setup();

    const otherSupport = state.attempt.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER_MATTER,
    );
    expect(otherSupport?.facts.some((fact) => fact.evidenceId === state.oldOutcome.id)).toBe(false);

    expect(state.owner.settle(
      state.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: OTHER_MATTER,
          reason: "ordinary retry-origin support must remain candidate-local",
          supportEvidenceIds: [state.retryOriginId],
          reviewAfterSeconds: 12,
        },
      },
      state.life,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });
  });
});

function setup() {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: "resident.janek",
    name: "Janek",
  });
  const kernel = new ResidentContinuityKernel({
    recentEvidenceLimit: 2,
    terminalOutcomeArchiveLimit: 8,
  });
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);

  const oldOrigin = kernel.recordEvidence({
    id: "evidence:janek:r6:delayed-choice-supported:old-origin",
    tick: 1,
    kind: "life_context",
    summary: "one older bounded material episode",
  });
  kernel.openMatter({
    id: OLD_MATTER,
    originEvidenceId: oldOrigin.id,
    semanticCourse: "try the familiar crate once",
    semanticIntent: {
      kind: "acquire_material_object",
      goal: "try the familiar crate once",
      objectId: OBJECT_ID,
    },
  });
  kernel.bindRun({
    matterId: OLD_MATTER,
    taskId: "task.janek.r6.delayed-choice-supported.old-material",
    runId: OLD_RUN,
  });
  const reconciled = kernel.reconcileRunOutcome({
    runId: OLD_RUN,
    tick: 2,
    status: "blocked",
    summary: "factual material attempt returned object_unavailable",
  });
  expect(reconciled.status).toBe("recorded");
  if (reconciled.status !== "recorded") throw new Error("old factual outcome missing");
  const oldOutcome = reconciled.evidence;
  kernel.resolveMatter(OLD_MATTER);

  kernel.recordEvidence({
    id: "evidence:janek:r6:delayed-choice-supported:later-1",
    tick: 3,
    kind: "later_life",
    summary: "unrelated later factual life one",
  });
  kernel.recordEvidence({
    id: "evidence:janek:r6:delayed-choice-supported:later-2",
    tick: 4,
    kind: "later_life",
    summary: "unrelated later factual life two",
  });
  expect(kernel.recentEvidenceSnapshot().some((entry) => entry.id === oldOutcome.id)).toBe(false);
  expect(kernel.archivedTerminalOutcomeEvidence(OLD_MATTER)).toEqual(oldOutcome);

  const retryOrigin = kernel.recordEvidence({
    id: "evidence:janek:r6:delayed-choice-supported:retry-origin",
    tick: 20,
    kind: "accepted_cognition_commitment",
    summary: "the same familiar crate is available again and one new retry was accepted",
  });
  const retryOriginId = retryOrigin.id;
  kernel.openMatter({
    id: RETRY_MATTER,
    originEvidenceId: retryOrigin.id,
    semanticCourse: "try the now-visible familiar crate again",
    semanticIntent: {
      kind: "acquire_material_object",
      goal: "try the now-visible familiar crate again",
      objectId: OBJECT_ID,
    },
    historicalSupport: [{
      relation: "prior_same_material_outcome",
      sourceMatterId: OLD_MATTER,
      evidenceId: oldOutcome.id,
    }],
  });
  kernel.bindRun({
    matterId: RETRY_MATTER,
    taskId: "task.janek.r6.delayed-choice-supported.retry",
    runId: RETRY_RUN,
  });

  const otherOrigin = kernel.recordEvidence({
    id: "evidence:janek:r6:delayed-choice-supported:other-origin",
    tick: 20,
    kind: "accepted_cognition_commitment",
    summary: "one unrelated ordinary current future",
  });
  const otherOriginId = otherOrigin.id;
  kernel.openMatter({
    id: OTHER_MATTER,
    originEvidenceId: otherOrigin.id,
    semanticCourse: "visit the workshop for an unrelated ordinary reason",
    semanticIntent: {
      kind: "travel_region",
      goal: "visit the workshop",
      targetRegionId: "workshop",
    },
  });
  kernel.bindRun({
    matterId: OTHER_MATTER,
    taskId: "task.janek.r6.delayed-choice-supported.other",
    runId: OTHER_RUN,
  });

  const carrierOrigin = kernel.recordEvidence({
    id: "evidence:janek:r6:delayed-choice-supported:carrier",
    tick: 20,
    kind: "life_context",
    summary: "temporary body owner for normal deferred ambiguity",
  });
  kernel.openMatter({
    id: CARRIER_MATTER,
    originEvidenceId: carrierOrigin.id,
    semanticCourse: "temporary body owner",
  });
  kernel.bindRun({
    matterId: CARRIER_MATTER,
    taskId: "task.janek.r6.delayed-choice-supported.carrier",
    runId: CARRIER_RUN,
  });

  expect(arbitrator.request(CARRIER_RUN)).toEqual({ status: "acquired", runId: CARRIER_RUN });
  expect(arbitrator.request(RETRY_RUN)).toMatchObject({ status: "busy", focusedRunId: CARRIER_RUN });
  expect(arbitrator.request(OTHER_RUN)).toMatchObject({ status: "busy", focusedRunId: CARRIER_RUN });
  kernel.cancelMatter(CARRIER_MATTER);
  kernel.retireRun(CARRIER_RUN);
  const candidateRunIds = [OTHER_RUN, RETRY_RUN].sort((a, b) => a.localeCompare(b));
  expect(arbitrator.reconcile()).toEqual({
    status: "choice_required",
    candidateRunIds,
  });

  const life = captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: [RETRY_MATTER, OTHER_MATTER],
  });

  resident.promoteSemanticPressure({
    id: "reason:janek:r6:delayed-choice-supported:ambiguity",
    tick: 20,
    kind: "uncertainty",
    salience: 0.8,
    summary: "Two legal current futures compete for one free body.",
    evidenceIds: candidateRunIds,
  });
  const batch = resident.takeCognitionBatch(50);
  if (!batch) throw new Error("delayed supported choice cognition missing");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("delayed supported choice attempt missing");

  return {
    resident,
    kernel,
    focus,
    arbitrator,
    life,
    owner,
    attempt,
    oldOutcome,
    retryOriginId,
    otherOriginId,
  };
}
