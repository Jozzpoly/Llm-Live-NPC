import { describe, expect, it } from "vitest";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";

const B = "matter.mira.r3.obligation";
const C = "matter.mira.r3.ordinary";
const B_EVIDENCE = "evidence:mira:r3:promise-to-janek";
const C_EVIDENCE = "evidence:mira:r3:ordinary-fields";

function setup() {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: "resident.mira",
    name: "Mira",
  });
  resident.promoteSemanticPressure({
    id: "reason:mira:r3:choice-support",
    tick: 0,
    kind: "uncertainty",
    salience: 0.8,
    summary: "Two continuing matters require one free body.",
    evidenceIds: ["run.mira.r3.obligation", "run.mira.r3.ordinary"],
  });
  const batch = resident.takeCognitionBatch(30);
  if (!batch) throw new Error("R3 causal-support fixture did not produce a choice batch");

  const life = lifeView();
  const owner = new ResidentLifeChoiceOwner(resident);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("R3 causal-support fixture did not prepare a choice attempt");
  return { resident, batch, life, owner, attempt };
}

describe("R3 resident-life choice causal support", () => {
  it("projects an existing accepted social responsibility as causal support without creating a new personality store", () => {
    const { attempt } = setup();

    expect(attempt.candidateSupports).toEqual([
      {
        matterId: B,
        facts: [{
          evidenceId: B_EVIDENCE,
          evidenceTick: 4,
          evidenceKind: "accepted_social_commitment",
          relation: "open_social_responsibility",
          summary: "Mira accepted responsibility to bring Janek the workshop message.",
        }],
      },
      {
        matterId: C,
        facts: [{
          evidenceId: C_EVIDENCE,
          evidenceTick: 5,
          evidenceKind: "life_context",
          relation: "matter_origin",
          summary: "Mira has an ordinary continuing reason to inspect the fields.",
        }],
      },
    ]);
  });

  it("admits a focus choice only when its cited support existed for that exact selected matter before the decision", () => {
    const supported = setup();
    expect(supported.owner.settle(
      supported.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: B,
          reason: "the earlier accepted responsibility to Janek matters in this choice",
          supportEvidenceIds: [B_EVIDENCE],
          reviewAfterSeconds: 8,
        },
      },
      supported.life,
    )).toEqual({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: B,
        reason: "the earlier accepted responsibility to Janek matters in this choice",
        supportEvidenceIds: [B_EVIDENCE],
        reviewAfterSeconds: 8,
      },
    });

    const crossMatter = setup();
    expect(crossMatter.owner.settle(
      crossMatter.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: B,
          reason: "claim the fields evidence supports the Janek obligation",
          supportEvidenceIds: [C_EVIDENCE],
          reviewAfterSeconds: 8,
        },
      },
      crossMatter.life,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });

    const invented = setup();
    expect(invented.owner.settle(
      invented.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: B,
          reason: "invent a causal fact after the decision",
          supportEvidenceIds: ["evidence:mira:r3:invented-preference"],
          reviewAfterSeconds: 8,
        },
      },
      invented.life,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });
  });

  it("does not hard-code obligation as the winner: an ordinary matter may still be chosen if its own real causal support is cited", () => {
    const state = setup();

    expect(state.owner.settle(
      state.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: C,
          reason: "the current situation still justifies giving the ordinary fields matter the body first",
          supportEvidenceIds: [C_EVIDENCE],
          reviewAfterSeconds: 8,
        },
      },
      state.life,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: C,
        supportEvidenceIds: [C_EVIDENCE],
      },
    });
  });
});

function lifeView(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [
      {
        id: B,
        status: "active",
        semanticRevision: 1,
        semanticCourse: "deliver the already accepted workshop message to Janek",
        semanticIntent: {
          kind: "communicate_actor",
          goal: "deliver the workshop message to Janek",
          targetActorId: "resident.janek",
          text: "The workshop crate was moved.",
        },
        suspendedByMatterId: null,
        originEvidence: {
          id: B_EVIDENCE,
          tick: 4,
          kind: "accepted_social_commitment",
          summary: "Mira accepted responsibility to bring Janek the workshop message.",
        },
        semanticEvidence: {
          id: B_EVIDENCE,
          tick: 4,
          kind: "accepted_social_commitment",
          summary: "Mira accepted responsibility to bring Janek the workshop message.",
        },
        lastOutcomeEvidence: null,
        activeRun: {
          runId: "run.mira.r3.obligation",
          taskId: "task.mira.r3.obligation",
          semanticRevision: 1,
          canMutateWorld: true,
          bodyState: "deferred",
        },
      },
      {
        id: C,
        status: "active",
        semanticRevision: 1,
        semanticCourse: "inspect the familiar fields when body time becomes available",
        semanticIntent: {
          kind: "travel_region",
          goal: "inspect the familiar fields",
          targetRegionId: "fields",
        },
        suspendedByMatterId: null,
        originEvidence: {
          id: C_EVIDENCE,
          tick: 5,
          kind: "life_context",
          summary: "Mira has an ordinary continuing reason to inspect the fields.",
        },
        semanticEvidence: {
          id: C_EVIDENCE,
          tick: 5,
          kind: "life_context",
          summary: "Mira has an ordinary continuing reason to inspect the fields.",
        },
        lastOutcomeEvidence: null,
        activeRun: {
          runId: "run.mira.r3.ordinary",
          taskId: "task.mira.r3.ordinary",
          semanticRevision: 1,
          canMutateWorld: true,
          bodyState: "deferred",
        },
      },
    ],
    body: {
      focusedRunId: null,
      deferredRunIds: ["run.mira.r3.obligation", "run.mira.r3.ordinary"],
    },
  };
}
