import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";

const JANEK = "resident.janek";
const C = "matter.janek.r6.single-plan-reappraisal";
const C_RUN = "run.janek.r6.single-plan-reappraisal.semantic-1";

describe("R6 single-current-plan autonomous reappraisal boundary", () => {
  it("already has an event-driven factual review reason, but decline cannot revise the only current plan", () => {
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

    // New resident-owned factual evidence changes the meaning of the only current
    // plan. The existing R2 bridge already turns this exact outcome into event-driven
    // semantic pressure; no timer or competing D is needed to make review relevant.
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

    const cognition = new ResidentCausalCognitionLane(life);
    let request = cognition.takeReadyRequest();
    for (let step = 0; step < 180 && !request; step += 1) {
      world.step();
      request = cognition.takeReadyRequest();
    }
    expect(request).not.toBeNull();
    if (!request) return;

    const outcomeReason = request.batch.reasons.find(
      (reason) => reason.kind === "activity_completed"
        && reason.evidenceIds.length === 1
        && reason.evidenceIds[0] === blocked.evidence.id,
    );
    expect(outcomeReason).toBeDefined();
    if (!outcomeReason) return;

    // The resident can semantically decline the pressure, but this vocabulary means
    // "do not create a new commitment". It has no authority over existing C.
    expect(cognition.settleCommitment(
      request,
      {
        version: 1,
        commitmentDecision: {
          kind: "decline",
          reason: "after this exact blocked outcome I do not want to keep carrying the workshop plan",
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      outcomeReason.id,
    )).toMatchObject({
      status: "applied",
      residentId: JANEK,
      decision: "decline",
      commitment: null,
    });

    const afterDecline = life.kernel.matter(C);
    expect(afterDecline).toMatchObject({
      id: C,
      status: "active",
      activeRunId: null,
      semanticRevision: 1,
      lastOutcomeSemanticRevision: 1,
      lastOutcomeEvidenceId: blocked.evidence.id,
    });
    expect(life.currentLifeView().matters).toEqual([
      expect.objectContaining({
        id: C,
        status: "active",
        activeRun: null,
      }),
    ]);

    // No implicit restart hides the gap: decline did not semantically review C, so
    // ordinary execution correctly refuses to manufacture a new run.
    const execution = new ResidentCausalExecutionCoordinator(life);
    expect(execution.reactivateReviewedMatter(C)).toEqual({
      status: "rejected",
      matterId: C,
      reason: "semantic_review_required",
    });
    expect(life.arbitrator.reconcile()).toEqual({ status: "idle" });

    // The only existing relinquishment vocabulary lives on the multi-matter choice
    // plane. One run-free current C cannot enter that plane merely to gain delete power.
    const choiceOwner = new ResidentLifeChoiceOwner(
      resident,
      world.options.fixedDeltaSeconds,
    );
    expect(() => choiceOwner.prepare(request.batch, life.currentLifeView()))
      .toThrow("resident life choice requires at least two deferred legal matters");

    expect(life.kernel.matter(C)).toMatchObject({
      status: "active",
      activeRunId: null,
    });
  });
});
