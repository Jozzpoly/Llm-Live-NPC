import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const OLD_MATTER = "matter.janek.r6.delayed-choice.old-material";
const OLD_RUN = "run.janek.r6.delayed-choice.old-material";
const RETRY_MATTER = "matter.janek.r6.delayed-choice.retry";
const RETRY_RUN = "run.janek.r6.delayed-choice.retry";
const OTHER_MATTER = "matter.janek.r6.delayed-choice.other";
const OTHER_RUN = "run.janek.r6.delayed-choice.other";
const CARRIER_MATTER = "matter.janek.r6.delayed-choice.carrier";
const CARRIER_RUN = "run.janek.r6.delayed-choice.carrier";
const OBJECT_ID = "crate.r6.delayed-choice";

describe("R6 delayed terminal-history choice-support gap", () => {
  it("shows that archived factual self-history is still lost again at a later competing-future choice boundary", () => {
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
      id: "evidence:janek:r6:delayed-choice:old-origin",
      tick: 1,
      kind: "life_context",
      summary: "Janek earlier made one bounded attempt for this exact familiar crate.",
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
      taskId: "task.janek.r6.delayed-choice.old-material",
      runId: OLD_RUN,
    });
    const oldReconciled = kernel.reconcileRunOutcome({
      runId: OLD_RUN,
      tick: 2,
      status: "blocked",
      summary: "factual material attempt returned object_unavailable",
    });
    expect(oldReconciled.status).toBe("recorded");
    if (oldReconciled.status !== "recorded") {
      throw new Error("old delayed-choice outcome was not recorded");
    }
    const oldOutcome = oldReconciled.evidence;
    kernel.resolveMatter(OLD_MATTER);

    // Ordinary later life churn removes the old outcome from current/recent evidence,
    // while the bounded terminal archive still retains exact factual provenance.
    kernel.recordEvidence({
      id: "evidence:janek:r6:delayed-choice:later-1",
      tick: 3,
      kind: "later_life",
      summary: "one unrelated later factual episode",
    });
    kernel.recordEvidence({
      id: "evidence:janek:r6:delayed-choice:later-2",
      tick: 4,
      kind: "later_life",
      summary: "another unrelated later factual episode",
    });
    expect(kernel.recentEvidenceSnapshot().some((entry) => entry.id === oldOutcome.id)).toBe(false);
    expect(kernel.archivedTerminalOutcomeEvidence(OLD_MATTER)).toEqual(oldOutcome);

    // C and D are current legal futures. A is deliberately not reinserted into the
    // current life scope merely to make its history visible.
    const retryOrigin = kernel.recordEvidence({
      id: "evidence:janek:r6:delayed-choice:retry-origin",
      tick: 20,
      kind: "accepted_cognition_commitment",
      summary: "The exact familiar crate is currently available again and Janek accepted one new bounded retry.",
    });
    kernel.openMatter({
      id: RETRY_MATTER,
      originEvidenceId: retryOrigin.id,
      semanticCourse: "try the now-visible familiar crate again",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try the now-visible familiar crate again",
        objectId: OBJECT_ID,
      },
    });
    kernel.bindRun({
      matterId: RETRY_MATTER,
      taskId: "task.janek.r6.delayed-choice.retry",
      runId: RETRY_RUN,
    });

    const otherOrigin = kernel.recordEvidence({
      id: "evidence:janek:r6:delayed-choice:other-origin",
      tick: 20,
      kind: "accepted_cognition_commitment",
      summary: "Janek independently accepted one ordinary workshop future.",
    });
    kernel.openMatter({
      id: OTHER_MATTER,
      originEvidenceId: otherOrigin.id,
      semanticCourse: "visit the familiar workshop for an unrelated ordinary reason",
      semanticIntent: {
        kind: "travel_region",
        goal: "visit the familiar workshop",
        targetRegionId: "workshop",
      },
    });
    kernel.bindRun({
      matterId: OTHER_MATTER,
      taskId: "task.janek.r6.delayed-choice.other",
      runId: OTHER_RUN,
    });

    const carrierOrigin = kernel.recordEvidence({
      id: "evidence:janek:r6:delayed-choice:carrier",
      tick: 20,
      kind: "life_context",
      summary: "temporary body owner used only to form normal deferred ambiguity",
    });
    kernel.openMatter({
      id: CARRIER_MATTER,
      originEvidenceId: carrierOrigin.id,
      semanticCourse: "temporary body owner",
    });
    kernel.bindRun({
      matterId: CARRIER_MATTER,
      taskId: "task.janek.r6.delayed-choice.carrier",
      runId: CARRIER_RUN,
    });

    expect(arbitrator.request(CARRIER_RUN)).toEqual({ status: "acquired", runId: CARRIER_RUN });
    expect(arbitrator.request(RETRY_RUN)).toMatchObject({ status: "busy", focusedRunId: CARRIER_RUN });
    expect(arbitrator.request(OTHER_RUN)).toMatchObject({ status: "busy", focusedRunId: CARRIER_RUN });
    kernel.cancelMatter(CARRIER_MATTER);
    kernel.retireRun(CARRIER_RUN);
    expect(arbitrator.reconcile()).toEqual({
      status: "choice_required",
      candidateRunIds: [OTHER_RUN, RETRY_RUN].sort((a, b) => a.localeCompare(b)),
    });

    const life = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: [RETRY_MATTER, OTHER_MATTER],
    });
    expect(life.matters.some((matter) => matter.id === OLD_MATTER)).toBe(false);

    resident.promoteSemanticPressure({
      id: "reason:janek:r6:delayed-choice:ambiguity",
      tick: 20,
      kind: "uncertainty",
      salience: 0.8,
      summary: "Two current legal futures compete for one free body.",
      evidenceIds: [OTHER_RUN, RETRY_RUN].sort((a, b) => a.localeCompare(b)),
    });
    const batch = resident.takeCognitionBatch(50);
    if (!batch) throw new Error("delayed-choice ambiguity did not produce cognition");

    const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
    const attempt = owner.prepare(batch, life);
    if (!attempt) throw new Error("delayed-choice attempt was not prepared");

    const retrySupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === RETRY_MATTER,
    );
    expect(retrySupport?.facts.some(
      (fact) => fact.evidenceId === oldOutcome.id
        || fact.relation === "prior_same_material_outcome",
    )).toBe(false);

    // Exact factual history exists in resident continuity, but current choice admission
    // has no legal support surface for it once A has left bounded current life.
    expect(owner.settle(
      attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: RETRY_MATTER,
          reason: "my exact earlier factual failure with this same crate matters now",
          supportEvidenceIds: [oldOutcome.id],
          reviewAfterSeconds: 12,
        },
      },
      life,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });

    expect(kernel.matter(OLD_MATTER)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(kernel.archivedTerminalOutcomeEvidence(OLD_MATTER)).toEqual(oldOutcome);
  });
});
