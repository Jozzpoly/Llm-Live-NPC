import { describe, expect, it } from "vitest";
import { createDefaultCognitionScheduler } from "./cognition-scheduler";
import { DEFAULT_RESIDENT_PROFILE, type CognitionReason } from "./contracts";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentRuntime } from "./resident-runtime";

const EMPTY_LIFE: ResidentLifeCognitionView = {
  version: 1,
  matters: [],
  body: { focusedRunId: null, deferredRunIds: [] },
};

function reason(id: string, tick: number, summary: string): CognitionReason {
  return {
    id,
    tick,
    kind: "uncertainty",
    salience: 0.8,
    summary,
    evidenceIds: [`evidence:${id}:${tick}`],
  };
}

function runtime(id: string): ResidentRuntime {
  return new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id,
    name: "R2 Lifecycle Characterization",
  });
}

describe("R2 pre-lifecycle semantic-pressure characterization", () => {
  it("currently lets an older requeue overwrite newer coalesced pressure with the same reason id", () => {
    const scheduler = createDefaultCognitionScheduler("resident.r2-lifecycle-stale", 0);
    const oldReason = reason("reason:shared", 10, "older evidence");
    const newerReason = reason("reason:shared", 50, "newer evidence");

    scheduler.note(oldReason);
    const dispatched = scheduler.takeReady(40);
    expect(dispatched?.reasons).toEqual([oldReason]);

    scheduler.note(newerReason);
    expect(scheduler.pendingSnapshot()).toEqual([newerReason]);

    // Current bug: requeueing the older in-flight version replaces the newer one
    // because scheduler.note() accepts equal salience regardless of causal tick.
    scheduler.note(oldReason);
    expect(scheduler.pendingSnapshot()).toEqual([oldReason]);
  });

  it("currently loses every sibling reason after one successful semantic settlement", () => {
    const resident = runtime("resident.r2-lifecycle-siblings");
    const selected = reason("reason:selected", 0, "selected issue");
    const sibling = reason("reason:sibling", 0, "independent sibling issue");
    resident.promoteSemanticPressure(selected);
    resident.promoteSemanticPressure(sibling);

    const batch = resident.takeCognitionBatch(30);
    expect(batch?.reasons).toHaveLength(2);
    if (!batch) return;

    const owner = new ResidentLifeIntentOwner(resident);
    const attempt = owner.prepare(batch, EMPTY_LIFE, 30);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    const settlement = owner.settleCommitmentIntent(
      attempt,
      {
        version: 1,
        commitmentDecision: { kind: "decline", reason: "decline only the selected issue" },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      EMPTY_LIFE,
      31,
      () => ({ status: "accepted", intent: { kind: "no_commitment" as const } }),
    );
    expect(settlement.status).toBe("applied");

    // Current bug: there is no post-settlement per-reason reconciliation boundary,
    // so the unrelated sibling vanishes together with the selected origin.
    expect(resident.pendingCognitionReasons()).toEqual([]);
  });

  it("currently treats defer as if the unresolved reason had been settled", () => {
    const resident = runtime("resident.r2-lifecycle-defer");
    const deferred = reason("reason:defer-me", 0, "still unresolved");
    resident.promoteSemanticPressure(deferred);

    const batch = resident.takeCognitionBatch(30);
    expect(batch?.reasons).toEqual([deferred]);
    if (!batch) return;

    const owner = new ResidentLifeIntentOwner(resident);
    const attempt = owner.prepare(batch, EMPTY_LIFE, 30);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    const settlement = owner.settleCommitmentIntent(
      attempt,
      {
        version: 1,
        commitmentDecision: { kind: "defer", reason: "not yet" },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      EMPTY_LIFE,
      31,
      () => ({ status: "accepted", intent: { kind: "no_commitment" as const } }),
    );
    expect(settlement.status).toBe("applied");

    // Current bug: defer has no retained unresolved state; the reason is gone.
    expect(resident.pendingCognitionReasons()).toEqual([]);
  });
});
