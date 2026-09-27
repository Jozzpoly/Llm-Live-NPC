// @ts-ignore Vitest/Vite loads the frozen evidence JSON; JSON ambient types remain local to this specimen.
import FIXTURE from "../../evidence/r6-cumulative-same-actor-history-choice-context.json";
// @ts-ignore Same bounded evidence import convention as the frozen context.
import LIVE from "../../evidence/r6-cumulative-same-actor-history-choice-live-result.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import {
  allowedChoiceSupportEvidenceIds,
} from "./resident-life-choice-causal-support";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const IDA_MATTER = "matter.mira.r6.cumulative-same-actor.ida";
const OTHER_MATTER = "matter.mira.r6.cumulative-same-actor.other";
const OLD_A = "matter.mira.r6.cumulative-same-actor.old-a";
const OLD_B = "matter.mira.r6.cumulative-same-actor.old-b";
const OLD_A_OUTCOME = "task-outcome:run.mira.r6.cumulative-same-actor.old-a:91";
const OLD_B_OUTCOME = "task-outcome:run.mira.r6.cumulative-same-actor.old-b:121";
const OTHER_ORIGIN = "evidence:mira:r6:cumulative-same-actor:other-origin";

describe("R6 cumulative same-actor exact live pair local replay", () => {
  it("replays the exact control Luna defer_all with no old matters or cumulative support", () => {
    const life = structuredClone(FIXTURE.control.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(LIVE.sourceSha).toBe("900d626b9049a43438993a96e7b442c6e59aa369");
    expect(LIVE.providerRequestsAttempted).toBe(2);
    expect(LIVE.semanticRetries).toBe(0);
    expect(LIVE.classification)
      .toBe("CUMULATIVE_SAME_ACTOR_HISTORY_CAUSAL_DIFFERENCE_OBSERVED");

    expect(life.matters.some((matter) => matter.id === OLD_A || matter.id === OLD_B))
      .toBe(false);

    const idaSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === IDA_MATTER,
    );
    expect(idaSupport?.facts.some((fact) => (
      fact.evidenceId === OLD_A_OUTCOME || fact.evidenceId === OLD_B_OUTCOME
    ))).toBe(false);

    const exactProposal = structuredClone(
      LIVE.observations.control_without_cumulative_history.proposal,
    );
    expect(exactProposal).toEqual({
      version: 1,
      decision: {
        kind: "defer_all",
        reason: "Both matters are independently grounded and currently active, but the available context provides no sufficient basis to prioritize speaking with Ida over visiting the workshop or vice versa.",
        reviewAfterSeconds: 120,
      },
    });

    expect(owner.settle(attempt, exactProposal, life, 331)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("replays the exact history Luna avoidance choice with both old Ida outcomes as legal comparative support", () => {
    const life = structuredClone(FIXTURE.history.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(life.matters.some((matter) => matter.id === OLD_A || matter.id === OLD_B))
      .toBe(false);

    const idaSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === IDA_MATTER,
    );
    const otherSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER_MATTER,
    );

    expect(idaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: OLD_A_OUTCOME,
        sourceMatterId: OLD_A,
        relation: "prior_same_actor_outcome",
        evidenceKind: "task_outcome",
      }),
      expect.objectContaining({
        evidenceId: OLD_B_OUTCOME,
        sourceMatterId: OLD_B,
        relation: "prior_same_actor_outcome",
        evidenceKind: "task_outcome",
      }),
    ]));
    expect(otherSupport?.facts.some((fact) => (
      fact.evidenceId === OLD_A_OUTCOME || fact.evidenceId === OLD_B_OUTCOME
    ))).toBe(false);

    const allowedForOther = allowedChoiceSupportEvidenceIds(
      attempt.candidateSupports,
      OTHER_MATTER,
    );
    expect(allowedForOther).toEqual(expect.arrayContaining([
      OTHER_ORIGIN,
      OLD_A_OUTCOME,
      OLD_B_OUTCOME,
    ]));
    expect(allowedForOther).not.toContain(
      "evidence:mira:r6:cumulative-same-actor:ida-origin",
    );

    const exactProposal = structuredClone(
      LIVE.observations.history_with_two_same_actor_outcomes.proposal,
    );
    expect(exactProposal).toEqual({
      version: 1,
      decision: {
        kind: "focus_matter",
        matterId: OTHER_MATTER,
        reason: "The workshop matter has a current independent ordinary commitment, while the Ida matter is comparatively supported by two prior same-actor exchange outcomes; allocating the free body to the workshop avoids giving semantic priority to another already-repeated Ida exchange without erasing either matter.",
        supportEvidenceIds: [
          OTHER_ORIGIN,
          OLD_A_OUTCOME,
          OLD_B_OUTCOME,
        ],
        reviewAfterSeconds: 60,
      },
    });

    expect(owner.settle(attempt, exactProposal, life, 331)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("retains the causal criterion as both old outcomes plus a real behavioral split, not rationale text alone", () => {
    const comparison = LIVE.observations.comparison;
    expect(comparison.controlBehavior).toEqual({ kind: "defer_all" });
    expect(comparison.historyBehavior).toEqual({
      kind: "focus_matter",
      matterId: OTHER_MATTER,
    });
    expect(comparison.exactBehaviorEqual).toBe(false);
    expect(comparison.citedOldOutcomes).toEqual([OLD_A_OUTCOME, OLD_B_OUTCOME]);
    expect(comparison.historyCitesBothOldOutcomes).toBe(true);
  });
});

function prepare(life: ResidentLifeCognitionView) {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: "resident.mira",
    name: "Mira",
  });
  resident.enterRegion({
    id: "hearth",
    label: "Hearth",
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
  }, 0, true);
  resident.promoteSemanticPressure({
    id: "reason:mira:r6:cumulative-same-actor:choice:300",
    tick: 300,
    kind: "uncertainty",
    salience: 0.82,
    summary: "Two already-grounded current resident futures are waiting for the same currently-free body.",
    evidenceIds: [
      "run.mira.r6.cumulative-same-actor.ida",
      "run.mira.r6.cumulative-same-actor.other",
    ],
  });
  const batch = resident.takeCognitionBatch(330);
  if (!batch) throw new Error("R6 cumulative same-actor live replay did not produce choice batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("R6 cumulative same-actor live replay did not prepare choice attempt");

  return { resident, owner, attempt };
}
