import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const OLD = "matter.janek.r6.plan-revision.old-material";
const OLD_RUN = "run.janek.r6.plan-revision.old-material";
const C = "matter.janek.r6.plan-revision.retry";
const C_RUN = "run.janek.r6.plan-revision.retry";
const D = "matter.janek.r6.plan-revision.other";
const D_RUN = "run.janek.r6.plan-revision.other";
const CARRIER = "matter.janek.r6.plan-revision.carrier";
const CARRIER_RUN = "run.janek.r6.plan-revision.carrier";
const OBJECT = "crate.r6.plan-revision";

describe("R6 plan revision / refusal gap", () => {
  it("can avoid a history-bearing current plan for now but cannot make that plan cease to be current", () => {
    const state = setup();
    const oldOutcomeId = state.oldOutcome.id;

    expect(state.owner.settle(
      state.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: D,
          reason: "the earlier factual failure belongs to the competing retry, so take the independent current future instead",
          supportEvidenceIds: [oldOutcomeId, state.otherOrigin.id],
          reviewAfterSeconds: 30,
        },
      },
      state.life,
      60,
    )).toMatchObject({
      status: "applied",
      decision: { kind: "focus_matter", matterId: D },
    });

    expect(state.arbitrator.choose(D_RUN)).toEqual({
      status: "acquired",
      runId: D_RUN,
    });
    expect(state.focus.focusedRun()).toBe(D_RUN);

    // Avoiding C in this choice does not revise C. It remains fully current and
    // deferred, with the same body/world authority waiting behind D.
    expect(state.kernel.matter(C)).toMatchObject({
      status: "active",
      activeRunId: C_RUN,
    });
    expect(state.arbitrator.deferredRunIds()).toEqual([C_RUN]);

    const dOutcome = state.kernel.reconcileRunOutcome({
      runId: D_RUN,
      tick: 61,
      status: "succeeded",
      summary: "independent current future completed factually",
    });
    expect(dOutcome.status).toBe("recorded");
    state.kernel.resolveMatter(D);
    state.kernel.retireRun(D_RUN);

    // Once D is gone, the arbitrator does exactly what it should mechanically do:
    // C is still a legal resident demand, so it comes back automatically.
    expect(state.arbitrator.reconcile()).toEqual({
      status: "acquired_deferred",
      runId: C_RUN,
    });
    expect(state.focus.focusedRun()).toBe(C_RUN);
    expect(state.kernel.matter(C)).toMatchObject({
      status: "active",
      activeRunId: C_RUN,
    });
  });

  it("cannot express a bounded resident decision to relinquish one already-current matter", () => {
    const state = setup();

    expect(state.owner.settle(
      state.attempt,
      {
        version: 1,
        decision: {
          kind: "relinquish_matter",
          matterId: C,
          reason: "the exact earlier factual failure changed my plan; I no longer want this retry to remain current",
          supportEvidenceIds: [state.oldOutcome.id],
          reviewAfterSeconds: 30,
        },
      },
      state.life,
      60,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });

    expect(state.kernel.matter(C)).toMatchObject({
      status: "active",
      activeRunId: C_RUN,
    });
    expect(state.kernel.matter(D)).toMatchObject({
      status: "active",
      activeRunId: D_RUN,
    });
  });

  it("evidence-grounded defer-all is coherent non-action but still leaves both plans current", () => {
    const state = setup();

    expect(state.owner.settle(
      state.attempt,
      {
        version: 1,
        decision: {
          kind: "defer_all",
          reason: "the earlier failure matters, but I do not yet want to assign the body to either current future",
          supportEvidenceIds: [state.oldOutcome.id],
          reviewAfterSeconds: 60,
        },
      },
      state.life,
      60,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "defer_all",
        supportEvidenceIds: [state.oldOutcome.id],
      },
    });

    expect(state.kernel.matter(C)).toMatchObject({ status: "active", activeRunId: C_RUN });
    expect(state.kernel.matter(D)).toMatchObject({ status: "active", activeRunId: D_RUN });
    expect(state.focus.focusedRun()).toBeNull();
    expect(state.arbitrator.deferredRunIds()).toEqual(
      [C_RUN, D_RUN].sort((a, b) => a.localeCompare(b)),
    );
  });
});

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
    id: "evidence:janek:r6:plan-revision:old-origin",
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
    taskId: "task.janek.r6.plan-revision.old-material",
    runId: OLD_RUN,
  });
  const oldReconciled = kernel.reconcileRunOutcome({
    runId: OLD_RUN,
    tick: 2,
    status: "blocked",
    summary: "factual material attempt returned object_unavailable",
  });
  expect(oldReconciled.status).toBe("recorded");
  if (oldReconciled.status !== "recorded") throw new Error("old plan-revision outcome missing");
  const oldOutcome = oldReconciled.evidence;
  kernel.resolveMatter(OLD);
  kernel.retireRun(OLD_RUN);

  const retryOrigin = kernel.recordEvidence({
    id: "evidence:janek:r6:plan-revision:retry-origin",
    tick: 20,
    kind: "accepted_cognition_commitment",
    summary: "the same familiar crate is currently available again and a new retry is current",
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
      evidenceId: oldOutcome.id,
    }],
  });
  kernel.bindRun({
    matterId: C,
    taskId: "task.janek.r6.plan-revision.retry",
    runId: C_RUN,
  });

  const otherOrigin = kernel.recordEvidence({
    id: "evidence:janek:r6:plan-revision:other-origin",
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
    taskId: "task.janek.r6.plan-revision.other",
    runId: D_RUN,
  });

  const carrierOrigin = kernel.recordEvidence({
    id: "evidence:janek:r6:plan-revision:carrier-origin",
    tick: 20,
    kind: "life_context",
    summary: "temporary body owner for normal deferred ambiguity",
  });
  kernel.openMatter({
    id: CARRIER,
    originEvidenceId: carrierOrigin.id,
    semanticCourse: "temporary body owner",
  });
  kernel.bindRun({
    matterId: CARRIER,
    taskId: "task.janek.r6.plan-revision.carrier",
    runId: CARRIER_RUN,
  });

  expect(arbitrator.request(CARRIER_RUN)).toEqual({ status: "acquired", runId: CARRIER_RUN });
  expect(arbitrator.request(C_RUN)).toMatchObject({ status: "busy", focusedRunId: CARRIER_RUN });
  expect(arbitrator.request(D_RUN)).toMatchObject({ status: "busy", focusedRunId: CARRIER_RUN });
  kernel.cancelMatter(CARRIER);
  kernel.retireRun(CARRIER_RUN);
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
    id: "reason:janek:r6:plan-revision:choice",
    tick: 20,
    kind: "uncertainty",
    salience: 0.8,
    summary: "two current futures require one free body",
    evidenceIds: [C_RUN, D_RUN],
  });
  const batch = resident.takeCognitionBatch(60);
  if (!batch) throw new Error("plan-revision ambiguity produced no cognition batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("plan-revision ambiguity produced no choice attempt");

  return {
    resident,
    kernel,
    focus,
    arbitrator,
    life,
    owner,
    attempt,
    oldOutcome,
    otherOrigin,
  };
}
