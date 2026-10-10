// @ts-ignore Frozen run-30 contexts are reused by the run-33 plan-revision falsifier.
import FIXTURE from "../../evidence/r6-same-cardinality-outcome-meaning-choice-context.json";
// @ts-ignore Exact retained run-33 proposals.
import LIVE from "../../evidence/r6-plan-revision-outcome-meaning-live-result.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentRuntime } from "./resident-runtime";

const CURRENT = "matter.ida.r6.same-cardinality.current-janek";
const OTHER = "matter.ida.r6.same-cardinality.other";
const OLD_A = "task-outcome:run.ida.r6.same-cardinality.old-a:90";
const OLD_B = "task-outcome:run.ida.r6.same-cardinality.old-b:120";

describe("R6 plan-revision outcome-meaning exact live pair replay", () => {
  it("admits the exact succeeded-history continuation without issuing a plan-revision grant", () => {
    const life = structuredClone(
      FIXTURE.succeeded_history.life,
    ) as unknown as ResidentLifeCognitionView;
    const before = structuredClone(life);
    const { owner, attempt } = prepare(life);

    expect(LIVE.sourceSha).toBe("677df1acc0c029d8ad6761556f5840139326be37");
    expect(LIVE.liveProviderRun).toBe(33);
    expect(LIVE.providerRequestsAttempted).toBe(2);
    expect(LIVE.semanticRetries).toBe(0);
    expect(LIVE.classification)
      .toBe("OUTCOME_MEANING_BEHAVIOR_DIFFERENCE_WITHOUT_PLAN_RELINQUISHMENT");

    const exactProposal = structuredClone(LIVE.succeededHistory.proposal);
    expect(exactProposal).toMatchObject({
      version: 1,
      decision: {
        kind: "focus_matter",
        matterId: CURRENT,
        supportEvidenceIds: expect.arrayContaining([OLD_A, OLD_B]),
      },
    });

    const settlement = owner.settle(attempt, exactProposal, life, 331);
    expect(settlement).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });
    expect(owner.claimPlanRevision(settlement)).toBeNull();
    expect(life).toEqual(before);
  });

  it("admits the exact blocked-history D priority while C remains current and no revision grant exists", () => {
    const life = structuredClone(
      FIXTURE.blocked_history.life,
    ) as unknown as ResidentLifeCognitionView;
    const before = structuredClone(life);
    const { owner, attempt } = prepare(life);

    const exactProposal = structuredClone(LIVE.blockedHistory.proposal);
    expect(exactProposal).toEqual({
      version: 1,
      decision: {
        kind: "focus_matter",
        matterId: OTHER,
        reason: "Both matters have current grounding, but Ida's two prior structured attempts to communicate with Janek ended with the recipient absent at the best known contact. The familiar workshop visit is therefore the better next use of the free body without concluding that the current Janek matter is impossible.",
        supportEvidenceIds: [
          "evidence:ida:r6:same-cardinality:other-origin",
          OLD_A,
          OLD_B,
        ],
        reviewAfterSeconds: 120,
      },
    });

    const settlement = owner.settle(attempt, exactProposal, life, 331);
    expect(settlement).toEqual({
      status: "applied",
      decision: exactProposal.decision,
    });

    // focus_matter is priority only. Even with relinquish_matter available in the same
    // strict schema, this exact Luna response did not authorize a plan revision.
    expect(owner.claimPlanRevision(settlement)).toBeNull();
    expect(life).toEqual(before);
    expect(life.matters.find((matter) => matter.id === CURRENT)).toMatchObject({
      status: "active",
      activeRun: {
        runId: "run.ida.r6.same-cardinality.current-janek",
        bodyState: "deferred",
      },
    });
    expect(life.matters.find((matter) => matter.id === OTHER)).toMatchObject({
      status: "active",
      activeRun: {
        runId: "run.ida.r6.same-cardinality.other",
        bodyState: "deferred",
      },
    });
  });

  it("retains the bounded interpretation: outcome meaning changes priority, not resident-owned plan lifecycle", () => {
    expect(LIVE.comparison).toMatchObject({
      exactBehaviorEqual: false,
      succeededRelinquishesCurrent: false,
      blockedRelinquishesCurrent: false,
      blockedCitesBothOldOutcomes: true,
    });
    expect(LIVE.succeededHistory.proposal.decision).toMatchObject({
      kind: "focus_matter",
      matterId: CURRENT,
      supportEvidenceIds: expect.arrayContaining([OLD_A, OLD_B]),
    });
    expect(LIVE.blockedHistory.proposal.decision).toMatchObject({
      kind: "focus_matter",
      matterId: OTHER,
      supportEvidenceIds: expect.arrayContaining([OLD_A, OLD_B]),
    });
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
  if (!batch) throw new Error("R6 plan-revision live replay did not produce choice batch");

  const owner = new ResidentLifeChoiceOwner(resident, 1 / 60);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("R6 plan-revision live replay did not prepare choice attempt");

  return { owner, attempt };
}
