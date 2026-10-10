// @ts-ignore Vitest/Vite loads the frozen evidence JSON; JSON ambient types remain local to this specimen.
import FIXTURE from "../../evidence/r6-same-cardinality-outcome-meaning-choice-context.json";
// @ts-ignore Same bounded evidence import convention as the frozen context.
import LIVE from "../../evidence/r6-same-cardinality-outcome-meaning-live-result.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import {
  allowedChoiceSupportEvidenceIds,
} from "./resident-life-choice-causal-support";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const CURRENT = "matter.ida.r6.same-cardinality.current-janek";
const OTHER = "matter.ida.r6.same-cardinality.other";
const OLD_A = "matter.ida.r6.same-cardinality.old-a";
const OLD_B = "matter.ida.r6.same-cardinality.old-b";
const OLD_A_OUTCOME = "task-outcome:run.ida.r6.same-cardinality.old-a:90";
const OLD_B_OUTCOME = "task-outcome:run.ida.r6.same-cardinality.old-b:120";
const CURRENT_ORIGIN = "evidence:ida:r6:same-cardinality:janek-origin";
const OTHER_ORIGIN = "evidence:ida:r6:same-cardinality:other-origin";

describe("R6 same-cardinality factual outcome-meaning exact live pair replay", () => {
  it("admits the exact Luna C choice after two succeeded Janek outcomes", () => {
    const life = structuredClone(
      FIXTURE.succeeded_history.life,
    ) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(LIVE.sourceSha).toBe("d4dd09c0d6afefefaf60772ebdb169728128b548");
    expect(LIVE.providerRequestsAttempted).toBe(2);
    expect(LIVE.classification)
      .toBe("SAME_CARDINALITY_OUTCOME_MEANING_BEHAVIOR_DIFFERENCE_OBSERVED");

    expect(life.matters.some((matter) => matter.id === OLD_A || matter.id === OLD_B))
      .toBe(false);

    const currentSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === CURRENT,
    );
    expect(currentSupport?.facts.filter(
      (fact) => fact.relation === "prior_same_actor_outcome",
    )).toEqual([
      expect.objectContaining({
        evidenceId: OLD_A_OUTCOME,
        sourceMatterId: OLD_A,
        summary: expect.stringMatching(/^succeeded:/),
      }),
      expect.objectContaining({
        evidenceId: OLD_B_OUTCOME,
        sourceMatterId: OLD_B,
        summary: expect.stringMatching(/^succeeded:/),
      }),
    ]);

    expect(allowedChoiceSupportEvidenceIds(attempt.candidateSupports, CURRENT))
      .toEqual(expect.arrayContaining([
        CURRENT_ORIGIN,
        OLD_A_OUTCOME,
        OLD_B_OUTCOME,
      ]));

    const exactProposal = structuredClone(
      LIVE.observations.two_succeeded_same_actor_outcomes.proposal,
    );
    expect(exactProposal).toEqual({
      version: 1,
      decision: {
        kind: "focus_matter",
        matterId: CURRENT,
        reason: "Prior factual outcomes show that speaking with Janek has been successfully carried out before, while this current bounded reason remains active; the workshop visit is also grounded but has no comparable supporting outcome evidence.",
        supportEvidenceIds: [
          CURRENT_ORIGIN,
          OLD_A_OUTCOME,
          OLD_B_OUTCOME,
        ],
        reviewAfterSeconds: 120,
      },
    });

    expect(owner.settle(attempt, exactProposal, life, 331)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("admits the exact Luna D choice after two blocked Janek outcomes", () => {
    const life = structuredClone(
      FIXTURE.blocked_history.life,
    ) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(life.matters.some((matter) => matter.id === OLD_A || matter.id === OLD_B))
      .toBe(false);

    const currentSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === CURRENT,
    );
    const otherSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER,
    );
    expect(currentSupport?.facts.filter(
      (fact) => fact.relation === "prior_same_actor_outcome",
    )).toEqual([
      expect.objectContaining({
        evidenceId: OLD_A_OUTCOME,
        sourceMatterId: OLD_A,
        summary: expect.stringMatching(/^blocked:/),
      }),
      expect.objectContaining({
        evidenceId: OLD_B_OUTCOME,
        sourceMatterId: OLD_B,
        summary: expect.stringMatching(/^blocked:/),
      }),
    ]);
    expect(otherSupport?.facts.some((fact) => (
      fact.evidenceId === OLD_A_OUTCOME || fact.evidenceId === OLD_B_OUTCOME
    ))).toBe(false);

    const allowedForOther = allowedChoiceSupportEvidenceIds(
      attempt.candidateSupports,
      OTHER,
    );
    expect(allowedForOther).toEqual(expect.arrayContaining([
      OTHER_ORIGIN,
      OLD_A_OUTCOME,
      OLD_B_OUTCOME,
    ]));
    expect(allowedForOther).not.toContain(CURRENT_ORIGIN);

    const exactProposal = structuredClone(
      LIVE.observations.two_blocked_same_actor_outcomes.proposal,
    );
    expect(exactProposal).toEqual({
      version: 1,
      decision: {
        kind: "focus_matter",
        matterId: OTHER,
        reason: "Both matters are independently grounded, but the workshop visit is a familiar, feasible current course, while two prior communications with Janek ended with the recipient absent. Prior outcomes do not determine the choice, but they make the workshop the better-supported next use of the free body.",
        supportEvidenceIds: [
          OTHER_ORIGIN,
          OLD_A_OUTCOME,
          OLD_B_OUTCOME,
        ],
        reviewAfterSeconds: 120,
      },
    });

    expect(owner.settle(attempt, exactProposal, life, 331)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("retains the causal criterion as same count and identities, different factual outcome meaning, and a real behavioral split", () => {
    const comparison = LIVE.observations.comparison;
    expect(comparison.succeededBehavior).toEqual({
      kind: "focus_matter",
      matterId: CURRENT,
    });
    expect(comparison.blockedBehavior).toEqual({
      kind: "focus_matter",
      matterId: OTHER,
    });
    expect(comparison.exactBehaviorEqual).toBe(false);
    expect(comparison.succeededCitedOldOutcomes).toEqual([
      OLD_A_OUTCOME,
      OLD_B_OUTCOME,
    ]);
    expect(comparison.blockedCitedOldOutcomes).toEqual([
      OLD_A_OUTCOME,
      OLD_B_OUTCOME,
    ]);
    expect(comparison.succeededCitesBoth).toBe(true);
    expect(comparison.blockedCitesBoth).toBe(true);

    const normalizeMeaning = (value: typeof FIXTURE.succeeded_history) => {
      const clone = structuredClone(value) as any;
      const current = clone.life.matters.find((matter: any) => matter.id === CURRENT);
      for (const support of current.historicalSupport) {
        support.evidence.summary = "<OUTCOME_MEANING>";
      }
      return clone;
    };
    expect(normalizeMeaning(FIXTURE.succeeded_history))
      .toEqual(normalizeMeaning(FIXTURE.blocked_history));
  });
});

function prepare(life: ResidentLifeCognitionView) {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: "resident.ida",
    name: "Ida",
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
    id: "reason:ida:r6:same-cardinality:choice:300",
    tick: 300,
    kind: "uncertainty",
    salience: 0.82,
    summary: "Two already-grounded current resident futures are waiting for the same currently-free body.",
    evidenceIds: [
      "run.ida.r6.same-cardinality.current-janek",
      "run.ida.r6.same-cardinality.other",
    ],
  });
  const batch = resident.takeCognitionBatch(330);
  if (!batch) throw new Error("R6 same-cardinality live replay did not produce choice batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("R6 same-cardinality live replay did not prepare choice attempt");

  return { owner, attempt };
}
