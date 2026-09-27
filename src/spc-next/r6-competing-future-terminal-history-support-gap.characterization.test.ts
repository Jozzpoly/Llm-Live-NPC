import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const HISTORY_MATTER = "matter.janek.r6.competing-future.history";
const RETRY_MATTER = "matter.janek.r6.competing-future.retry";
const OTHER_MATTER = "matter.janek.r6.competing-future.other";
const HISTORY_OUTCOME = "evidence:janek:r6:competing-future:history-outcome";
const RETRY_ORIGIN = "evidence:janek:r6:competing-future:retry-origin";
const OTHER_ORIGIN = "evidence:janek:r6:competing-future:other-origin";
const OBJECT_ID = "crate.r6.competing-future";

describe("R6 competing-future terminal-history support gap", () => {
  it("keeps terminal same-object history visible but cannot causally cite it for the new candidate under the current support contract", () => {
    const { owner, attempt, life } = setup();

    expect(attempt.context.life.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: HISTORY_MATTER,
        status: "resolved",
        semanticIntent: expect.objectContaining({
          kind: "acquire_material_object",
          objectId: OBJECT_ID,
        }),
        lastOutcomeEvidence: expect.objectContaining({
          id: HISTORY_OUTCOME,
          kind: "task_outcome",
          summary: expect.stringContaining("blocked:"),
        }),
        activeRun: null,
      }),
    ]));

    const retrySupport = attempt.candidateSupports.find(
      (candidate) => candidate.matterId === RETRY_MATTER,
    );
    expect(retrySupport?.facts.map((fact) => fact.evidenceId)).toEqual([RETRY_ORIGIN]);
    expect(retrySupport?.facts.some((fact) => fact.evidenceId === HISTORY_OUTCOME)).toBe(false);

    expect(owner.settle(
      attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: RETRY_MATTER,
          reason: "the exact earlier failed encounter with this same object matters to this choice",
          supportEvidenceIds: [HISTORY_OUTCOME],
          reviewAfterSeconds: 12,
        },
      },
      life,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });

    expect(life.matters.find((matter) => matter.id === HISTORY_MATTER)).toMatchObject({
      status: "resolved",
      activeRun: null,
    });
  });

  it("still admits either current candidate from its own current support, proving the gap is causal attribution rather than a hard-coded winner", () => {
    const retry = setup();
    expect(retry.owner.settle(
      retry.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: RETRY_MATTER,
          reason: "the current reacquisition itself is enough to choose the retry",
          supportEvidenceIds: [RETRY_ORIGIN],
          reviewAfterSeconds: 12,
        },
      },
      retry.life,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: RETRY_MATTER,
        supportEvidenceIds: [RETRY_ORIGIN],
      },
    });

    const other = setup();
    expect(other.owner.settle(
      other.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: OTHER_MATTER,
          reason: "the unrelated current workshop future may still be chosen",
          supportEvidenceIds: [OTHER_ORIGIN],
          reviewAfterSeconds: 12,
        },
      },
      other.life,
    )).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: OTHER_MATTER,
        supportEvidenceIds: [OTHER_ORIGIN],
      },
    });
  });
});

function setup() {
  const resident = new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id: "resident.janek",
    name: "Janek",
  });
  resident.promoteSemanticPressure({
    id: "reason:janek:r6:competing-future",
    tick: 20,
    kind: "uncertainty",
    salience: 0.8,
    summary: "Two legal resident futures compete for one free body.",
    evidenceIds: [
      "run.janek.r6.competing-future.retry",
      "run.janek.r6.competing-future.other",
    ],
  });
  const batch = resident.takeCognitionBatch(30);
  if (!batch) throw new Error("R6 competing-future fixture did not produce cognition");

  const life = lifeView();
  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("R6 competing-future fixture did not prepare a choice attempt");

  return { owner, attempt, life };
}

function lifeView(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [
      {
        id: HISTORY_MATTER,
        status: "resolved",
        semanticRevision: 1,
        semanticCourse: "one earlier bounded attempt to acquire the familiar crate",
        semanticIntent: {
          kind: "acquire_material_object",
          goal: "try to acquire the familiar crate once",
          objectId: OBJECT_ID,
        },
        suspendedByMatterId: null,
        originEvidence: {
          id: "evidence:janek:r6:competing-future:history-origin",
          tick: 3,
          kind: "life_context",
          summary: "Janek earlier had one bounded reason to try the familiar crate.",
        },
        semanticEvidence: {
          id: "evidence:janek:r6:competing-future:history-origin",
          tick: 3,
          kind: "life_context",
          summary: "Janek earlier had one bounded reason to try the familiar crate.",
        },
        lastOutcomeEvidence: {
          id: HISTORY_OUTCOME,
          tick: 4,
          kind: "task_outcome",
          summary: "blocked: factual material attempt returned object_unavailable",
        },
        activeRun: null,
      },
      {
        id: RETRY_MATTER,
        status: "active",
        semanticRevision: 1,
        semanticCourse: "decide whether to try the now-visible familiar crate again",
        semanticIntent: {
          kind: "acquire_material_object",
          goal: "try the now-visible familiar crate again",
          objectId: OBJECT_ID,
        },
        suspendedByMatterId: null,
        originEvidence: {
          id: RETRY_ORIGIN,
          tick: 20,
          kind: "life_context",
          summary: "The same familiar crate is currently available again.",
        },
        semanticEvidence: {
          id: RETRY_ORIGIN,
          tick: 20,
          kind: "life_context",
          summary: "The same familiar crate is currently available again.",
        },
        lastOutcomeEvidence: null,
        activeRun: {
          runId: "run.janek.r6.competing-future.retry",
          taskId: "task.janek.r6.competing-future.retry",
          semanticRevision: 1,
          canMutateWorld: true,
          bodyState: "deferred",
        },
      },
      {
        id: OTHER_MATTER,
        status: "active",
        semanticRevision: 1,
        semanticCourse: "visit the familiar workshop for an unrelated ordinary reason",
        semanticIntent: {
          kind: "travel_region",
          goal: "visit the familiar workshop",
          targetRegionId: "workshop",
        },
        suspendedByMatterId: null,
        originEvidence: {
          id: OTHER_ORIGIN,
          tick: 20,
          kind: "life_context",
          summary: "Janek also has an ordinary current reason to visit the workshop.",
        },
        semanticEvidence: {
          id: OTHER_ORIGIN,
          tick: 20,
          kind: "life_context",
          summary: "Janek also has an ordinary current reason to visit the workshop.",
        },
        lastOutcomeEvidence: null,
        activeRun: {
          runId: "run.janek.r6.competing-future.other",
          taskId: "task.janek.r6.competing-future.other",
          semanticRevision: 1,
          canMutateWorld: true,
          bodyState: "deferred",
        },
      },
    ],
    body: {
      focusedRunId: null,
      deferredRunIds: [
        "run.janek.r6.competing-future.retry",
        "run.janek.r6.competing-future.other",
      ],
    },
  };
}
