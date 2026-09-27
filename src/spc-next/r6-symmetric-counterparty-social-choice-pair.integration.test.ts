// @ts-ignore Vitest/Vite loads frozen evidence JSON.
import FIXTURE from "../../evidence/r6-symmetric-counterparty-social-choice-context.json";
// @ts-ignore Same bounded evidence import convention.
import LIVE from "../../evidence/r6-symmetric-counterparty-social-choice-live-result.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const NELA = "matter.oren.r6.symmetric-social.nela";
const IDA = "matter.oren.r6.symmetric-social.ida";
const OLD_STANDING = "matter.oren.r6.symmetric-social.old-standing";
const RELEASE = "evidence-social-commitment-release:r6-symmetric-social-old-nela-release";

describe("R6 symmetric counterparty social exact live pair local replay", () => {
  it("replays exact control Luna defer-all through local choice admission", () => {
    const life = structuredClone(FIXTURE.control.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(LIVE.sourceSha).toBe("9a0086a0a06fcf2d108ea7bdca32053f3a388f60");
    expect(LIVE.workflowRun).toBe(32);
    expect(LIVE.providerRequestsAttempted).toBe(2);
    expect(LIVE.semanticRetries).toBe(0);
    expect(LIVE.classification).toBe("SYMMETRIC_SAME_DECISION_NO_COUNTERPARTY_HISTORY_USE");

    expect(life.matters.some((matter) => matter.id === OLD_STANDING)).toBe(false);
    const exactProposal = structuredClone(
      LIVE.observations.control_without_counterparty_history.proposal,
    );
    expect(exactProposal.decision).toMatchObject({
      kind: "defer_all",
      reviewAfterSeconds: 30,
    });
    expect(owner.settle(attempt, exactProposal, life, 270)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("replays exact history Luna defer-all while preserving the old Nela release only as candidate-scoped history", () => {
    const life = structuredClone(FIXTURE.history.life) as unknown as ResidentLifeCognitionView;
    const { owner, attempt } = prepare(life);

    expect(life.matters.some((matter) => matter.id === OLD_STANDING)).toBe(false);
    const nelaSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === NELA,
    );
    const idaSupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === IDA,
    );
    expect(nelaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: RELEASE,
        sourceMatterId: OLD_STANDING,
        relation: "prior_counterparty_social_outcome",
        evidenceKind: "resident_released_social_commitment",
      }),
    ]));
    expect(idaSupport?.facts.some((fact) => fact.evidenceId === RELEASE)).toBe(false);

    const exactProposal = structuredClone(
      LIVE.observations.history_with_nela_release.proposal,
    );
    expect(exactProposal.decision).toMatchObject({
      kind: "defer_all",
      reviewAfterSeconds: 60,
    });
    expect("supportEvidenceIds" in exactProposal.decision).toBe(false);
    expect(exactProposal.decision.reason).toContain("prior Nela-related release");

    expect(owner.settle(attempt, exactProposal, life, 270)).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
  });

  it("keeps the behavioral result neutral while exposing the current defer-all attribution limitation", () => {
    const comparison = LIVE.observations.comparison;
    expect(comparison.controlBehavior).toEqual({ kind: "defer_all" });
    expect(comparison.historyBehavior).toEqual({ kind: "defer_all" });
    expect(comparison.exactBehaviorEqual).toBe(true);
    expect(comparison.historyCitesRelease).toBe(false);
    expect(comparison.history.reason).toContain("prior Nela-related release");
    expect(comparison.history.supportEvidenceIds).toBeNull();
  });
});

function prepare(life: ResidentLifeCognitionView) {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: "resident.oren",
    name: "Oren",
  });
  resident.enterRegion({
    id: "r6-symmetric-social-room",
    label: "R6 Symmetric Social Room",
    minX: 0,
    minY: 0,
    maxX: 1_000,
    maxY: 700,
  }, 0, true);
  resident.promoteSemanticPressure({
    id: "reason:oren:r6:symmetric-social:choice:240",
    tick: 240,
    kind: "uncertainty",
    salience: 0.82,
    summary: "Two current social futures, one involving Nela and one involving Ida, compete for the same currently-free body.",
    evidenceIds: [
      "run.oren.r6.symmetric-social.nela",
      "run.oren.r6.symmetric-social.ida",
    ],
  });
  const batch = resident.takeCognitionBatch(270);
  if (!batch) throw new Error("symmetric counterparty replay produced no choice batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("symmetric counterparty replay produced no choice attempt");
  return { owner, attempt };
}
