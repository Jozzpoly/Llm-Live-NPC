import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentLifePlanRevisionAuthority } from "./resident-life-plan-revision-authority";
import { ResidentRuntime } from "./resident-runtime";

const OLD = "matter.janek.plan-revision-authority.old";
const OLD_RUN = "run.janek.plan-revision-authority.old";
const C = "matter.janek.plan-revision-authority.retry";
const C_RUN = "run.janek.plan-revision-authority.retry";
const D = "matter.janek.plan-revision-authority.other";
const D_RUN = "run.janek.plan-revision-authority.other";
const OBJECT = "crate.plan-revision-authority";

describe("ResidentLifePlanRevisionAuthority", () => {
  it("turns one exact admitted resident revision into cancelled current matter and revoked run authority", () => {
    const state = setup();
    const settlement = state.owner.settle(
      state.attempt,
      relinquish(state.oldOutcome.id),
      state.life,
      60,
    );
    expect(settlement.status).toBe("applied");

    const authority = new ResidentLifePlanRevisionAuthority(
      "resident.janek",
      state.owner,
      state.kernel,
    );

    expect(authority.apply(structuredClone(settlement), 61)).toEqual({
      status: "rejected",
      reason: "revision_not_authorized",
    });
    expect(state.kernel.matter(C)).toMatchObject({
      status: "active",
      activeRunId: C_RUN,
    });
    expect(state.kernel.canRunMutateWorld(C_RUN)).toBe(true);

    const applied = authority.apply(settlement, 61);
    expect(applied).toMatchObject({
      status: "applied",
      disposition: "relinquish",
      evidence: {
        tick: 61,
        kind: "resident_relinquished_matter",
        summary: expect.stringContaining(state.oldOutcome.id),
      },
      matter: {
        id: C,
        status: "cancelled",
        activeRunId: null,
        semanticRevision: 2,
      },
      retiredRunId: C_RUN,
    });

    expect(state.kernel.canRunMutateWorld(C_RUN)).toBe(false);
    expect(state.kernel.runBinding(C_RUN)).toBeNull();
    expect(state.kernel.matter(D)).toMatchObject({
      status: "active",
      activeRunId: D_RUN,
    });

    // Relinquishment chooses no replacement. Normal arbitration sees only one legal
    // demand afterward and may hand the free body to D without provider policy.
    expect(state.arbitrator.reconcile()).toEqual({
      status: "acquired_deferred",
      runId: D_RUN,
    });
    expect(state.focus.focusedRun()).toBe(D_RUN);

    expect(authority.apply(settlement, 62)).toEqual({
      status: "rejected",
      reason: "revision_not_authorized",
    });
  });

  it("fails closed if the target matter changes after semantic admission but before local application", () => {
    const state = setup();
    const settlement = state.owner.settle(
      state.attempt,
      relinquish(state.oldOutcome.id),
      state.life,
      60,
    );
    expect(settlement.status).toBe("applied");

    const newer = state.kernel.recordEvidence({
      id: "evidence:janek:plan-revision-authority:newer",
      tick: 61,
      kind: "life_context",
      summary: "newer resident truth changed the retry before revision application",
    });
    state.kernel.advanceSemanticContext(C, newer.id);

    const authority = new ResidentLifePlanRevisionAuthority(
      "resident.janek",
      state.owner,
      state.kernel,
    );
    expect(authority.apply(settlement, 61)).toEqual({
      status: "rejected",
      reason: "matter_changed",
    });
    expect(state.kernel.matter(C)).toMatchObject({
      status: "active",
      semanticRevision: 2,
      activeRunId: C_RUN,
    });
    expect(state.kernel.matter(C)?.status).not.toBe("cancelled");
  });
});

function relinquish(oldOutcomeId: string) {
  return {
    version: 1,
    decision: {
      kind: "relinquish_matter",
      matterId: C,
      reason: "the exact earlier factual failure changed my plan; stop carrying this retry",
      supportEvidenceIds: [oldOutcomeId],
      reviewAfterSeconds: 30,
    },
  };
}

function setup() {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: "resident.janek",
    name: "Janek",
  });
  resident.enterRegion({
    id: "yard",
    label: "Yard",
    minX: 0,
    minY: 0,
    maxX: 1_000,
    maxY: 700,
  }, 0, true);

  const kernel = new ResidentContinuityKernel({
    recentEvidenceLimit: 8,
    terminalOutcomeArchiveLimit: 8,
  });
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);

  const oldOrigin = kernel.recordEvidence({
    id: "evidence:janek:plan-revision-authority:old-origin",
    tick: 1,
    kind: "life_context",
    summary: "one older bounded material attempt",
  });
  kernel.openMatter({
    id: OLD,
    originEvidenceId: oldOrigin.id,
    semanticCourse: "try the familiar crate once",
    semanticIntent: {
      kind: "acquire_material_object",
      goal: "try the familiar crate once",
      objectId: OBJECT,
    },
  });
  kernel.bindRun({
    matterId: OLD,
    taskId: "task.janek.plan-revision-authority.old",
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
  kernel.resolveMatter(OLD);
  kernel.retireRun(OLD_RUN);

  const retryOrigin = kernel.recordEvidence({
    id: "evidence:janek:plan-revision-authority:retry-origin",
    tick: 20,
    kind: "accepted_cognition_commitment",
    summary: "the exact crate is currently available again and retry C is current",
  });
  kernel.openMatter({
    id: C,
    originEvidenceId: retryOrigin.id,
    semanticCourse: "try the familiar crate again",
    semanticIntent: {
      kind: "acquire_material_object",
      goal: "try the familiar crate again",
      objectId: OBJECT,
    },
    historicalSupport: [{
      relation: "prior_same_material_outcome",
      sourceMatterId: OLD,
      evidenceId: reconciled.evidence.id,
    }],
  });
  kernel.bindRun({
    matterId: C,
    taskId: "task.janek.plan-revision-authority.retry",
    runId: C_RUN,
  });

  const otherOrigin = kernel.recordEvidence({
    id: "evidence:janek:plan-revision-authority:other-origin",
    tick: 20,
    kind: "accepted_cognition_commitment",
    summary: "one independent current future",
  });
  kernel.openMatter({
    id: D,
    originEvidenceId: otherOrigin.id,
    semanticCourse: "take the independent current route",
    semanticIntent: {
      kind: "travel_region",
      goal: "take the independent current route",
      targetRegionId: "yard",
    },
  });
  kernel.bindRun({
    matterId: D,
    taskId: "task.janek.plan-revision-authority.other",
    runId: D_RUN,
  });

  expect(arbitrator.request(C_RUN)).toEqual({ status: "acquired", runId: C_RUN });
  expect(arbitrator.request(D_RUN)).toMatchObject({ status: "busy", focusedRunId: C_RUN });

  // Free the body without ending C: this fixture needs both exact legal demands to
  // enter the resident choice plane.
  focus.release(C_RUN);
  expect(arbitrator.request(C_RUN)).toEqual({ status: "deferred", runId: C_RUN });
  expect(arbitrator.reconcile()).toEqual({
    status: "choice_required",
    candidateRunIds: [C_RUN, D_RUN].sort((a, b) => a.localeCompare(b)),
  });

  const life = captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: [C, D],
  });
  resident.promoteSemanticPressure({
    id: "reason:janek:plan-revision-authority:choice",
    tick: 20,
    kind: "uncertainty",
    salience: 0.8,
    summary: "two current futures require one free body",
    evidenceIds: [C_RUN, D_RUN],
  });
  const batch = resident.takeCognitionBatch(60);
  if (!batch) throw new Error("plan revision choice batch missing");
  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("plan revision choice attempt missing");

  return {
    resident,
    kernel,
    focus,
    arbitrator,
    life,
    owner,
    attempt,
    oldOutcome: reconciled.evidence,
  };
}
