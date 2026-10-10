// @ts-ignore Vitest/Vite loads frozen evidence JSON.
import FIXTURE from "../../evidence/r6-counterparty-social-history-choice-context.json";
// @ts-ignore Same bounded evidence import convention.
import LIVE from "../../evidence/r6-counterparty-social-history-choice-live-result.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { allowedChoiceSupportEvidenceIds } from "./resident-life-choice-causal-support";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const NELA_MATTER = "matter.oren-r6-counterparty-support.causal.reason:reason:oren:r6:counterparty-support:current-nela";
const OTHER_MATTER = "matter.oren.r6.counterparty-support.other";
const OLD_STANDING = "matter.oren.r6.counterparty-support.standing";
const RELEASE = "evidence-social-commitment-release:994176f47a5d7832";
const NELA_ORIGIN = "evidence:oren-r6-counterparty-support:accepted-reason:reason:oren:r6:counterparty-support:current-nela:82";

describe("R6 counterparty social-history exact live pair local replay", () => {
  it("replays exact control Luna focus on current Nela without historical support", () => {
    const life = structuredClone(FIXTURE.control.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(LIVE.sourceSha).toBe("14383cec2e7e75b07d8ed240d076aa1e935695f2");
    expect(LIVE.workflowRun).toBe(31);
    expect(LIVE.providerRequestsAttempted).toBe(2);
    expect(LIVE.semanticRetries).toBe(0);
    expect(LIVE.classification)
      .toBe("COUNTERPARTY_SOCIAL_HISTORY_UPTAKE_WITHOUT_BEHAVIOR_CHANGE");

    expect(life.matters.some((matter) => matter.id === OLD_STANDING)).toBe(false);
    const nelaSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === NELA_MATTER,
    );
    expect(nelaSupport?.facts.some((fact) => fact.evidenceId === RELEASE)).toBe(false);

    const exactProposal = structuredClone(
      LIVE.observations.control_without_counterparty_history.proposal,
    );
    expect(owner.settle(attempt, exactProposal, life, 190)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("replays exact history Luna focus with the old Nela release as legal causal support", () => {
    const life = structuredClone(FIXTURE.history.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(life.matters.some((matter) => matter.id === OLD_STANDING)).toBe(false);

    const nelaSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === NELA_MATTER,
    );
    const otherSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === OTHER_MATTER,
    );
    expect(nelaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: RELEASE,
        sourceMatterId: OLD_STANDING,
        relation: "prior_counterparty_social_outcome",
        evidenceKind: "resident_released_social_commitment",
      }),
      expect.objectContaining({
        evidenceId: NELA_ORIGIN,
        relation: "matter_origin",
      }),
    ]));
    expect(otherSupport?.facts.some((fact) => fact.evidenceId === RELEASE)).toBe(false);
    expect(allowedChoiceSupportEvidenceIds(
      attempt.candidateSupports,
      NELA_MATTER,
    )).toContain(RELEASE);
    expect(allowedChoiceSupportEvidenceIds(
      attempt.candidateSupports,
      OTHER_MATTER,
    )).toContain(RELEASE);

    const exactProposal = structuredClone(
      LIVE.observations.history_with_counterparty_release.proposal,
    );
    expect(exactProposal.decision).toMatchObject({
      kind: "focus_matter",
      matterId: NELA_MATTER,
      supportEvidenceIds: expect.arrayContaining([RELEASE, NELA_ORIGIN]),
    });
    expect(owner.settle(attempt, exactProposal, life, 190)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("keeps the result neutral: factual release changed cited causal support but not behavioral class", () => {
    const comparison = LIVE.observations.comparison;
    expect(comparison.controlBehavior).toEqual({
      kind: "focus_matter",
      matterId: NELA_MATTER,
    });
    expect(comparison.historyBehavior).toEqual({
      kind: "focus_matter",
      matterId: NELA_MATTER,
    });
    expect(comparison.exactBehaviorEqual).toBe(true);
    expect(comparison.historyCitesRelease).toBe(true);
  });
});

function prepare(life: ResidentLifeCognitionView) {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: "resident.oren",
    name: "Oren",
  });
  resident.enterRegion({
    id: "r6-counterparty-support-room",
    label: "R6 Counterparty Support Room",
    minX: 0,
    minY: 0,
    maxX: 1_000,
    maxY: 700,
  }, 0, true);
  resident.promoteSemanticPressure({
    id: "reason:oren:r6:counterparty-support:choice:160",
    tick: 160,
    kind: "uncertainty",
    salience: 0.82,
    summary: "Two already-grounded current resident futures are waiting for the same currently-free body.",
    evidenceIds: [
      "run.oren-r6-counterparty-support.causal.reason:reason:oren:r6:counterparty-support:current-nela.semantic-1",
      "run.oren.r6.counterparty-support.other",
    ],
  });
  const batch = resident.takeCognitionBatch(190);
  if (!batch) throw new Error("counterparty social-history replay produced no choice batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("counterparty social-history replay produced no choice attempt");
  return { owner, attempt };
}
