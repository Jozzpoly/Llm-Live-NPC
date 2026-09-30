import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

const JANEK = "resident.janek";
const C = "matter.janek.r6.single-plan-reappraisal";
const C_RUN = "run.janek.r6.single-plan-reappraisal.semantic-1";

describe("R6 single-current-plan autonomous reappraisal", () => {
  it("relinquishes the sole run-free current plan only through its exact factual outcome pressure", () => {
    const state = setupBlockedSinglePlan();
    const request = takeOutcomeRequest(state);
    const outcomeReason = exactOutcomeReason(request, state.blocked.evidence.id);

    expect(state.cognition.settleCommitment(
      request,
      {
        version: 1,
        commitmentDecision: {
          kind: "relinquish_matter",
          matterId: C,
          reason: "this exact factual block changed my judgement; stop carrying the workshop plan",
          supportEvidenceIds: [state.blocked.evidence.id],
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      outcomeReason.id,
    )).toMatchObject({
      status: "applied",
      residentId: JANEK,
      decision: "relinquish_matter",
      commitment: null,
    });

    expect(state.life.kernel.matter(C)).toMatchObject({
      id: C,
      status: "cancelled",
      activeRunId: null,
      semanticRevision: 2,
      lastOutcomeEvidenceId: state.blocked.evidence.id,
      lastOutcomeSemanticRevision: 1,
    });
    expect(state.life.kernel.canRunMutateWorld(C_RUN)).toBe(false);
    expect(state.life.arbitrator.reconcile()).toEqual({ status: "idle" });

    const revisionEvidence = state.life.kernel.recentEvidenceSnapshot().find(
      (evidence) => evidence.kind === "resident_relinquished_matter",
    );
    expect(revisionEvidence).toMatchObject({
      kind: "resident_relinquished_matter",
      summary: expect.stringContaining(state.blocked.evidence.id),
    });

    const execution = new ResidentCausalExecutionCoordinator(state.life);
    expect(execution.reactivateReviewedMatter(C)).toEqual({
      status: "rejected",
      matterId: C,
      reason: "matter_not_active",
    });
  });

  it("rejects relinquishment whose cited support is not factual support attached to the exact current matter", () => {
    const state = setupBlockedSinglePlan();
    const request = takeOutcomeRequest(state);
    const outcomeReason = exactOutcomeReason(request, state.blocked.evidence.id);

    expect(state.cognition.settleCommitment(
      request,
      {
        version: 1,
        commitmentDecision: {
          kind: "relinquish_matter",
          matterId: C,
          reason: "try to use ordinary origin wording as deletion authority",
          supportEvidenceIds: [state.origin.id],
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      outcomeReason.id,
    )).toEqual({
      status: "rejected",
      residentId: JANEK,
      reason: "intent_rejected",
      detail: "single-plan relinquishment lacks exact target-local factual support",
    });

    expect(state.life.kernel.matter(C)).toMatchObject({
      id: C,
      status: "active",
      activeRunId: null,
      semanticRevision: 1,
      lastOutcomeEvidenceId: state.blocked.evidence.id,
    });
    expect(state.life.kernel.recentEvidenceSnapshot().some(
      (evidence) => evidence.kind === "resident_relinquished_matter",
    )).toBe(false);
  });
});

function setupBlockedSinglePlan() {
  const composition = createFiveResidentRegionComposition();
  const { world } = composition;
  const resident = composition.runtimes[JANEK];
  const life = new ResidentCausalLifeSubstrate({
    residentId: JANEK,
    resident,
    world,
    navigation: createFiveResidentNavigationGraph(),
  });

  const origin = life.kernel.recordEvidence({
    id: "evidence:janek:r6:single-plan-reappraisal:origin",
    tick: world.tick,
    kind: "accepted_cognition_commitment",
    summary: "Janek currently owns one ordinary workshop plan and no competing future",
  });
  const matter = life.kernel.openMatter({
    id: C,
    originEvidenceId: origin.id,
    semanticCourse: "go to the familiar workshop",
    semanticIntent: {
      kind: "travel_region",
      goal: "go to the familiar workshop",
      targetRegionId: "workshop",
    },
  });
  life.matterScope.track(matter.id);
  life.kernel.bindRun({
    matterId: C,
    taskId: "task.janek.r6.single-plan-reappraisal.semantic-1",
    runId: C_RUN,
  });
  expect(life.arbitrator.request(C_RUN)).toEqual({ status: "acquired", runId: C_RUN });

  const blocked = life.kernel.reconcileRunOutcome({
    runId: C_RUN,
    tick: world.tick,
    status: "blocked",
    summary: "the only current workshop plan hit one factual blocked outcome",
  });
  expect(blocked.status).toBe("recorded");
  if (blocked.status !== "recorded") throw new Error("single-plan outcome missing");
  expect(life.outcomeReviewBridge.observe(blocked.evidence, world.tick)).toEqual({
    status: "scheduled",
    outcomeEvidenceId: blocked.evidence.id,
  });

  return {
    composition,
    world,
    resident,
    life,
    origin,
    blocked,
    cognition: new ResidentCausalCognitionLane(life),
  };
}

function takeOutcomeRequest(state: ReturnType<typeof setupBlockedSinglePlan>) {
  let request = state.cognition.takeReadyRequest();
  for (let step = 0; step < 180 && !request; step += 1) {
    state.world.step();
    request = state.cognition.takeReadyRequest();
  }
  expect(request).not.toBeNull();
  if (!request) throw new Error("single-plan factual review produced no cognition request");
  return request;
}

function exactOutcomeReason(
  request: ReturnType<typeof takeOutcomeRequest>,
  outcomeEvidenceId: string,
) {
  const reason = request.batch.reasons.find(
    (candidate) => candidate.kind === "activity_completed"
      && candidate.evidenceIds.length === 1
      && candidate.evidenceIds[0] === outcomeEvidenceId,
  );
  expect(reason).toBeDefined();
  if (!reason) throw new Error("single-plan outcome reason missing");
  return reason;
}
