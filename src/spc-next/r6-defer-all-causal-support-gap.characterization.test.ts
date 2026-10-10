// @ts-ignore Vitest/Vite loads frozen evidence JSON.
import FIXTURE from "../../evidence/r6-symmetric-counterparty-social-choice-context.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const NELA = "matter.oren.r6.symmetric-social.nela";
const RELEASE = "evidence-social-commitment-release:r6-symmetric-social-old-nela-release";

describe("R6 causal defer-all support gap", () => {
  it("admits exact resident-owned evidence for deliberate non-action without making evidence mandatory", () => {
    const focusLife = structuredClone(
      FIXTURE.history.life,
    ) as unknown as ResidentLifeCognitionView;
    const focusPrepared = prepare(focusLife);

    const nelaSupport = focusPrepared.attempt.candidateSupports.find(
      (candidate) => candidate.matterId === NELA,
    );
    expect(nelaSupport?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceId: RELEASE,
        relation: "prior_counterparty_social_outcome",
      }),
    ]));

    expect(focusPrepared.owner.settle(
      focusPrepared.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: NELA,
          reason: "the exact earlier Nela release is relevant to choosing this current Nela future",
          supportEvidenceIds: [RELEASE],
          reviewAfterSeconds: 30,
        },
      },
      focusLife,
      270,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        supportEvidenceIds: [RELEASE],
      },
    });

    const deferLife = structuredClone(
      FIXTURE.history.life,
    ) as unknown as ResidentLifeCognitionView;
    const deferPrepared = prepare(deferLife);

    // The gap exposed by live run #32 is now closed narrowly: non-action may cite
    // only already-frozen choice-support evidence, while remaining non-executable.
    expect(deferPrepared.owner.settle(
      deferPrepared.attempt,
      {
        version: 1,
        decision: {
          kind: "defer_all",
          reason: "the prior Nela release is relevant, but it still does not establish enough current priority to choose Nela over Ida",
          supportEvidenceIds: [RELEASE],
          reviewAfterSeconds: 60,
        },
      },
      deferLife,
      270,
    )).toEqual({
      status: "applied",
      decision: {
        kind: "defer_all",
        reason: "the prior Nela release is relevant, but it still does not establish enough current priority to choose Nela over Ida",
        supportEvidenceIds: [RELEASE],
        reviewAfterSeconds: 60,
      },
    });

    const legacyLife = structuredClone(
      FIXTURE.control.life,
    ) as unknown as ResidentLifeCognitionView;
    const legacyPrepared = prepare(legacyLife);
    expect(legacyPrepared.owner.settle(
      legacyPrepared.attempt,
      {
        version: 1,
        decision: {
          kind: "defer_all",
          reason: "neither current future has enough positive evidence to deserve the body yet",
          reviewAfterSeconds: 30,
        },
      },
      legacyLife,
      270,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "defer_all",
        reviewAfterSeconds: 30,
      },
    });

    const forgedLife = structuredClone(
      FIXTURE.history.life,
    ) as unknown as ResidentLifeCognitionView;
    const forgedPrepared = prepare(forgedLife);
    expect(forgedPrepared.owner.settle(
      forgedPrepared.attempt,
      {
        version: 1,
        decision: {
          kind: "defer_all",
          reason: "invent a causal basis that is not part of the frozen choice support",
          supportEvidenceIds: ["evidence:forged:r6:defer-all"],
          reviewAfterSeconds: 60,
        },
      },
      forgedLife,
      270,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });
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
  if (!batch) throw new Error("causal defer-all gap fixture produced no cognition batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("causal defer-all gap fixture produced no choice attempt");
  return { owner, attempt };
}
