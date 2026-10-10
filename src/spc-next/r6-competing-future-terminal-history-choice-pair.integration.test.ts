// @ts-ignore Vitest/Vite loads the frozen evidence JSON; the browser/worker tsconfig intentionally keeps JSON ambient types local.
import FIXTURE from "../../evidence/r6-competing-future-terminal-history-choice-context.json";
// @ts-ignore Same bounded evidence import convention as the paired frozen context.
import LIVE from "../../evidence/r6-competing-future-terminal-history-choice-live-result.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const RETRY_MATTER = "matter.janek.r6.competing-future.retry";
const OTHER_MATTER = "matter.janek.r6.competing-future.other";
const HISTORY_MATTER = "matter.janek.r6.competing-future.history";
const HISTORY_OUTCOME = "evidence:janek:r6:competing-future:history-outcome";
const RETRY_ORIGIN = "evidence:janek:r6:competing-future:retry-origin";

describe("R6 competing-future exact live pair local replay", () => {
  it("replays the exact control Luna defer_all through local ResidentLifeChoiceOwner admission", () => {
    const life = structuredClone(FIXTURE.control.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(LIVE.sourceSha).toBe("c9999f589886311125dd91a215d27f3b46371a5c");
    expect(LIVE.providerRequestsAttempted).toBe(2);
    expect(LIVE.classification).toBe("HISTORY_CAUSAL_COMPETING_FUTURE_DIFFERENCE_OBSERVED");

    expect(attempt.candidateMatterIds).toEqual([OTHER_MATTER, RETRY_MATTER].sort());
    expect(attempt.candidateSupports.find((entry) => entry.matterId === RETRY_MATTER)?.facts)
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({ evidenceId: HISTORY_OUTCOME }),
      ]));

    const exactProposal = structuredClone(
      LIVE.observations.control_without_terminal_episode.proposal,
    );
    expect(exactProposal).toEqual({
      version: 1,
      decision: {
        kind: "defer_all",
        reason: "Both grounded matters have current support and neither has stronger resident-life priority, urgency, or comparative evidence. Defer until the ambiguity changes.",
        reviewAfterSeconds: 30,
      },
    });
    expect(owner.settle(attempt, exactProposal, life, 151)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("replays the exact history Luna focus with exact terminal causal citation while old history stays terminal and run-free", () => {
    const life = structuredClone(FIXTURE.history.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    const retrySupport = attempt.candidateSupports.find((entry) => entry.matterId === RETRY_MATTER);
    expect(retrySupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: HISTORY_OUTCOME,
        relation: "prior_same_material_outcome",
      }),
      expect.objectContaining({
        evidenceId: RETRY_ORIGIN,
        relation: "matter_origin",
      }),
    ]));

    const exactProposal = structuredClone(
      LIVE.observations.history_with_terminal_same_object_outcome.proposal,
    );
    expect(exactProposal).toEqual({
      version: 1,
      decision: {
        kind: "focus_matter",
        matterId: RETRY_MATTER,
        reason: "The familiar crate is currently available again, directly addressing the earlier blocked attempt, while the workshop visit is an ordinary competing reason.",
        supportEvidenceIds: [HISTORY_OUTCOME, RETRY_ORIGIN],
        reviewAfterSeconds: 120,
      },
    });

    expect(owner.settle(attempt, exactProposal, life, 151)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });

    expect(life.matters.find((matter) => matter.id === HISTORY_MATTER)).toMatchObject({
      status: "resolved",
      activeRun: null,
      lastOutcomeEvidence: {
        id: HISTORY_OUTCOME,
        kind: "task_outcome",
      },
    });
    expect(life.body.focusedRunId).toBeNull();
  });

  it("records a behavioral split only in the history twin and does not confuse rationale text with the causal criterion", () => {
    const comparison = LIVE.observations.comparison;
    expect(comparison.controlBehavior).toEqual({ kind: "defer_all" });
    expect(comparison.historyBehavior).toEqual({
      kind: "focus_matter",
      matterId: RETRY_MATTER,
    });
    expect(comparison.exactBehaviorEqual).toBe(false);
    expect(comparison.historyCitesTerminalOutcome).toBe(true);
    expect(comparison.history.supportEvidenceIds).toContain(HISTORY_OUTCOME);
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
    maxX: 100,
    maxY: 100,
  }, 0, true);
  resident.promoteSemanticPressure({
    id: "reason:janek:r6:competing-future:120",
    tick: 120,
    kind: "uncertainty",
    salience: 0.82,
    summary: "Two already-grounded resident futures are waiting for the same currently-free body.",
    evidenceIds: [
      "run.janek.r6.competing-future.retry",
      "run.janek.r6.competing-future.other",
    ],
  });
  const batch = resident.takeCognitionBatch(150);
  if (!batch) throw new Error("R6 exact live replay did not produce the choice batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("R6 exact live replay did not prepare the choice attempt");
  return { resident, owner, attempt };
}
