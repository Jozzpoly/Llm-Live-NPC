// @ts-ignore Vitest/Vite loads the recorded no-reroll run #34 result.
import LIVE_RESULT from "../../evidence/r6-single-current-plan-review-outcome-meaning-live-result.json";
import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { deriveSpcIdentifier } from "./identity-contract";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

const JANEK = "resident.janek";
const MATTER = "matter.janek.r6.single-current-review.crate";
const RUN = "run.janek.r6.single-current-review.crate.semantic-1";

const CASES = [
  {
    label: "pickup_time_unavailable",
    outcomeSummary:
      "material acquisition crate.workshop.01 blocked: visible material object became unavailable at pickup time",
  },
  {
    label: "bounded_inspection_absent",
    outcomeSummary:
      "material acquisition crate.workshop.01 blocked: material object is not visible after bounded local inspection",
  },
] as const;

describe("R6 run #34 canonicalized local replay", () => {
  for (const specimen of CASES) {
    it(`applies the recorded ${specimen.label} relinquishment after replacing only noncanonical provenance ids`, () => {
      const recorded = LIVE_RESULT.observations[specimen.label];
      expect(recorded.decision.kind).toBe("relinquish_matter");
      expect(recorded.decision.matterId).toBe(MATTER);

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
        id: "evidence:janek:r6:single-current-review:origin",
        tick: world.tick,
        kind: "accepted_cognition_commitment",
        summary: "Janek chose one bounded plan concerning the familiar workshop crate.",
      });
      const matter = life.kernel.openMatter({
        id: MATTER,
        originEvidenceId: origin.id,
        semanticCourse: "try to acquire the familiar workshop crate",
        semanticIntent: {
          kind: "acquire_material_object",
          goal: "try to acquire the familiar workshop crate",
          objectId: "crate.workshop.01",
        },
      });
      life.matterScope.track(matter.id);
      life.kernel.bindRun({
        matterId: MATTER,
        taskId: "task.janek.r6.single-current-review.crate.semantic-1",
        runId: RUN,
      });
      expect(life.arbitrator.request(RUN)).toEqual({ status: "acquired", runId: RUN });

      const blocked = life.kernel.reconcileRunOutcome({
        runId: RUN,
        tick: world.tick,
        status: "blocked",
        summary: specimen.outcomeSummary,
      });
      expect(blocked.status).toBe("recorded");
      if (blocked.status !== "recorded") throw new Error("canonical replay outcome missing");

      const expectedOutcomeId = deriveSpcIdentifier("task-outcome", RUN, String(world.tick));
      expect(blocked.evidence).toMatchObject({
        id: expectedOutcomeId,
        kind: "task_outcome",
        summary: `blocked: ${specimen.outcomeSummary}`,
        sourceRunId: RUN,
      });
      expect(recorded.decision.supportEvidenceIds[0]).not.toBe(expectedOutcomeId);

      expect(life.outcomeReviewBridge.observe(blocked.evidence, world.tick)).toEqual({
        status: "scheduled",
        outcomeEvidenceId: expectedOutcomeId,
      });

      const cognition = new ResidentCausalCognitionLane(life);
      let request = cognition.takeReadyRequest();
      for (let guard = 0; guard < 180 && !request; guard += 1) {
        world.step();
        request = cognition.takeReadyRequest();
      }
      if (!request) throw new Error("canonicalized run #34 outcome never became cognition-ready");

      const originReason = request.batch.reasons.find(
        (reason) => reason.kind === "activity_completed"
          && reason.evidenceIds.length === 1
          && reason.evidenceIds[0] === expectedOutcomeId,
      );
      if (!originReason) throw new Error("canonicalized run #34 outcome reason missing");
      expect(originReason.id).toBe(deriveSpcIdentifier("reason-life-outcome", expectedOutcomeId));

      expect(cognition.settleCommitment(
        request,
        {
          version: 1,
          commitmentDecision: {
            kind: "relinquish_matter",
            matterId: MATTER,
            reason: recorded.decision.reason,
            supportEvidenceIds: [expectedOutcomeId],
          },
          beliefs: [],
          concerns: [],
          reviewAfterSeconds: recorded.decision.reviewAfterSeconds,
        },
        originReason.id,
      )).toMatchObject({
        status: "applied",
        residentId: JANEK,
        decision: "relinquish_matter",
        commitment: null,
      });

      expect(life.kernel.matter(MATTER)).toMatchObject({
        id: MATTER,
        status: "cancelled",
        activeRunId: null,
        semanticRevision: 2,
        lastOutcomeEvidenceId: expectedOutcomeId,
        lastOutcomeSemanticRevision: 1,
      });
      expect(life.kernel.recentEvidenceSnapshot()).toContainEqual(expect.objectContaining({
        kind: "resident_relinquished_matter",
        summary: expect.stringContaining(recorded.decision.reason),
      }));
    });
  }
});
