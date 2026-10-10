// @ts-ignore Vitest/Vite loads frozen JSON evidence; JSON ambient types remain local.
import FIXTURE from "../../evidence/r6-delayed-competing-future-history-choice-context.json";
// @ts-ignore Same bounded evidence import convention.
import LIVE from "../../evidence/r6-delayed-competing-future-history-choice-live-result.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const RETRY_MATTER = "matter.janek.r6.delayed-competing-future.retry";
const OTHER_MATTER = "matter.janek.r6.delayed-competing-future.other";
const OLD_MATTER = "matter.janek.r6.delayed-competing-future.old-material";
const OLD_OUTCOME = "task-outcome:run.janek.r6.delayed-competing-future.old-material:90";
const RETRY_ORIGIN = "evidence:janek:r6:delayed-competing-future:retry-origin";

describe("R6 delayed competing-future exact live pair local replay", () => {
  it("replays exact control Luna defer_all after old history is absent from current life", () => {
    const life = structuredClone(FIXTURE.control.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(LIVE.sourceSha).toBe("ebf41ab8d67c86dd4eb4b3e4c8a30978ef73b827");
    expect(LIVE.providerRequestsAttempted).toBe(2);
    expect(LIVE.classification)
      .toBe("DELAYED_HISTORY_CAUSAL_COMPETING_FUTURE_DIFFERENCE_OBSERVED");

    expect(life.matters.some((matter) => matter.id === OLD_MATTER)).toBe(false);
    expect(attempt.candidateMatterIds).toEqual([OTHER_MATTER, RETRY_MATTER].sort());
    expect(attempt.candidateSupports.find(
      (entry) => entry.matterId === RETRY_MATTER,
    )?.facts.some((fact) => fact.evidenceId === OLD_OUTCOME)).toBe(false);

    const exactProposal = structuredClone(
      LIVE.observations.control_without_delayed_history.proposal,
    );
    expect(exactProposal).toEqual({
      version: 1,
      decision: {
        kind: "defer_all",
        reason: "Both matters are independently grounded and currently eligible, but the available context provides no justified basis to prioritize the retry over the unrelated visit or vice versa.",
        reviewAfterSeconds: 30,
      },
    });
    expect(owner.settle(attempt, exactProposal, life, 251)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("replays exact delayed-history Luna focus through local admission while A remains absent and terminal", () => {
    const life = structuredClone(FIXTURE.history.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(life.matters.some((matter) => matter.id === OLD_MATTER)).toBe(false);
    const retryMatter = life.matters.find((matter) => matter.id === RETRY_MATTER);
    expect(retryMatter).toMatchObject({
      status: "active",
      historicalSupport: [{
        relation: "prior_same_material_outcome",
        sourceMatterId: OLD_MATTER,
        evidence: {
          id: OLD_OUTCOME,
          kind: "task_outcome",
        },
      }],
    });

    const retrySupport = attempt.candidateSupports.find(
      (entry) => entry.matterId === RETRY_MATTER,
    );
    expect(retrySupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: OLD_OUTCOME,
        sourceMatterId: OLD_MATTER,
        relation: "prior_same_material_outcome",
      }),
      expect.objectContaining({
        evidenceId: RETRY_ORIGIN,
        relation: "matter_origin",
      }),
    ]));

    const exactProposal = structuredClone(
      LIVE.observations.history_with_candidate_scoped_delayed_outcome.proposal,
    );
    expect(exactProposal).toEqual({
      version: 1,
      decision: {
        kind: "focus_matter",
        matterId: RETRY_MATTER,
        reason: "The retry is an active bounded commitment concerning the familiar crate, while the prior same-material outcome was blocked; giving it the body allows the newly grounded retry to be tested rather than leaving the earlier uncertainty unresolved.",
        supportEvidenceIds: [
          RETRY_ORIGIN,
          OLD_OUTCOME,
        ],
        reviewAfterSeconds: 90,
      },
    });

    expect(owner.settle(attempt, exactProposal, life, 251)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
    expect(life.body.focusedRunId).toBeNull();
    expect(life.matters.some((matter) => matter.id === OLD_MATTER)).toBe(false);
  });

  it("records a causally cited behavioral split rather than mere rationale variation", () => {
    const comparison = LIVE.observations.comparison;
    expect(comparison.controlBehavior).toEqual({ kind: "defer_all" });
    expect(comparison.historyBehavior).toEqual({
      kind: "focus_matter",
      matterId: RETRY_MATTER,
    });
    expect(comparison.exactBehaviorEqual).toBe(false);
    expect(comparison.historyCitesOldOutcome).toBe(true);
    expect(comparison.history.supportEvidenceIds).toContain(OLD_OUTCOME);
    expect(LIVE.outcome)
      .toBe("DELAYED_HISTORY_CAUSAL_COMPETING_FUTURE_DIFFERENCE_OBSERVED");
  });
});

function prepare(life: ResidentLifeCognitionView) {
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
    maxX: 499,
    maxY: 500,
  }, 0, true);
  resident.promoteSemanticPressure({
    id: "reason:janek:r6:delayed-competing-future:220",
    tick: 220,
    kind: "uncertainty",
    salience: 0.82,
    summary: "Two already-grounded current resident futures are waiting for the same currently-free body.",
    evidenceIds: [
      "run.janek.r6.delayed-competing-future.retry",
      "run.janek.r6.delayed-competing-future.other",
    ],
  });
  const batch = resident.takeCognitionBatch(250);
  if (!batch) throw new Error("R6 delayed exact replay did not produce choice batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("R6 delayed exact replay did not prepare choice attempt");
  return { resident, owner, attempt };
}
