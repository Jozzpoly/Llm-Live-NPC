import { describe, expect, it } from "vitest";
import { createDefaultCognitionScheduler } from "./cognition-scheduler";
import { DEFAULT_RESIDENT_PROFILE, type CognitionReason } from "./contracts";
import { ResidentRuntime } from "./resident-runtime";

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
    name: "R2 Lifecycle",
  });
}

describe("R2 semantic-pressure lifecycle", () => {
  it("never lets an older requeue overwrite newer coalesced pressure with the same reason id", () => {
    const scheduler = createDefaultCognitionScheduler("resident.r2-lifecycle-stale", 0);
    const oldReason = reason("reason:shared", 10, "older evidence");
    const newerReason = reason("reason:shared", 50, "newer evidence");

    scheduler.note(oldReason);
    const dispatched = scheduler.takeReady(40);
    expect(dispatched?.reasons).toEqual([oldReason]);

    scheduler.note(newerReason);
    expect(scheduler.pendingSnapshot()).toEqual([newerReason]);

    const staleRequeue = scheduler.note(oldReason);
    expect(staleRequeue).toMatchObject({
      status: "ignored_stale",
      reason: oldReason,
      retained: newerReason,
    });
    expect(scheduler.pendingSnapshot()).toEqual([newerReason]);
  });

  it("settles only the selected origin while retaining independent batch siblings", () => {
    const resident = runtime("resident.r2-lifecycle-siblings");
    const selected = reason("reason:selected", 0, "selected issue");
    const sibling = reason("reason:sibling", 0, "independent sibling issue");
    resident.promoteSemanticPressure(selected);
    resident.promoteSemanticPressure(sibling);

    const batch = resident.takeCognitionBatch(30);
    expect(batch?.reasons).toHaveLength(2);
    if (!batch) return;

    expect(resident.semanticPressureLifecycleSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: selected, status: "in_flight" }),
      expect.objectContaining({ reason: sibling, status: "in_flight" }),
    ]));

    expect(resident.reconcileCognitionSettlement({
      batch,
      originReasonId: selected.id,
      decision: "decline",
      tick: 31,
    })).toEqual({
      settledReasonIds: [selected.id],
      retainedReasonIds: [sibling.id],
    });

    expect(resident.pendingCognitionReasons()).toEqual([sibling]);
    expect(resident.semanticPressureLifecycleSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: selected, status: "settled" }),
      expect.objectContaining({ reason: sibling, status: "pending" }),
    ]));

    expect(resident.takeCognitionBatch(89)).toBeNull();
    expect(resident.takeCognitionBatch(90)?.reasons).toEqual([sibling]);
  });

  it("retains defer as unresolved pressure without making it eligible before its explicit review boundary", () => {
    const resident = runtime("resident.r2-lifecycle-defer");
    const deferred = reason("reason:defer-me", 0, "still unresolved");
    resident.promoteSemanticPressure(deferred);

    const batch = resident.takeCognitionBatch(30);
    expect(batch?.reasons).toEqual([deferred]);
    if (!batch) return;

    expect(resident.reconcileCognitionSettlement({
      batch,
      originReasonId: deferred.id,
      decision: "defer",
      tick: 31,
      retainOriginUntilTick: 1_800,
    })).toEqual({
      settledReasonIds: [],
      retainedReasonIds: [deferred.id],
    });

    expect(resident.pendingCognitionReasons()).toEqual([deferred]);
    expect(resident.semanticPressureLifecycleSnapshot()).toContainEqual(expect.objectContaining({
      reason: deferred,
      status: "pending",
      notBeforeTick: 1_800,
      detail: expect.stringContaining("defer keeps selected semantic pressure unresolved"),
    }));

    expect(resident.takeCognitionBatch(1_799)).toBeNull();
    expect(resident.takeCognitionBatch(1_800)?.reasons).toEqual([deferred]);
  });

  it("lets newer local causal truth settle in-flight pressure and blocks an older requeue from resurrecting it", () => {
    const resident = runtime("resident.r3-local-invalidation");
    const pressure = reason("reason:local-invalidated", 0, "open matter currently makes this relevant");
    resident.promoteSemanticPressure(pressure);

    const batch = resident.takeCognitionBatch(30);
    expect(batch?.reasons).toEqual([pressure]);
    if (!batch) return;

    expect(resident.invalidateSemanticPressure(
      pressure.id,
      40,
      "owning matter resolved locally before provider settlement",
    )).toBe(true);
    expect(resident.pendingCognitionReasons()).toEqual([]);
    expect(resident.semanticPressureLifecycleSnapshot()).toContainEqual(expect.objectContaining({
      reason: pressure,
      status: "settled",
      detail: "owning matter resolved locally before provider settlement",
    }));

    resident.requeueCognitionBatch(batch, 50);
    expect(resident.pendingCognitionReasons()).toEqual([]);
    expect(resident.semanticPressureLifecycleEvents()).toContainEqual(expect.objectContaining({
      kind: "settled_requeue_ignored",
      reasonId: pressure.id,
    }));

    const genuinelyNewer = reason(
      pressure.id,
      60,
      "new causal evidence makes the same coalesced issue relevant again",
    );
    resident.promoteSemanticPressure(genuinelyNewer);
    expect(resident.pendingCognitionReasons()).toEqual([genuinelyNewer]);
  });

  it("cannot settle an older in-flight version over newer evidence that arrived during the request", () => {
    const resident = runtime("resident.r2-lifecycle-newer-evidence");
    const oldReason = reason("reason:coalesced", 0, "old evidence");
    const newerReason = reason("reason:coalesced", 40, "new evidence during request");
    resident.promoteSemanticPressure(oldReason);

    const batch = resident.takeCognitionBatch(30);
    expect(batch?.reasons).toEqual([oldReason]);
    if (!batch) return;

    resident.promoteSemanticPressure(newerReason);
    expect(resident.pendingCognitionReasons()).toEqual([newerReason]);

    expect(resident.reconcileCognitionSettlement({
      batch,
      originReasonId: oldReason.id,
      decision: "accept",
      tick: 45,
    })).toEqual({
      settledReasonIds: [oldReason.id],
      retainedReasonIds: [],
    });

    // Mechanical return reports that the selected batch version was handled, but the
    // lifecycle refuses to mark the newer coalesced version settled.
    expect(resident.pendingCognitionReasons()).toEqual([newerReason]);
    expect(resident.semanticPressureLifecycleSnapshot()).toContainEqual(expect.objectContaining({
      reason: newerReason,
      status: "pending",
    }));
    expect(resident.semanticPressureLifecycleEvents()).toContainEqual(expect.objectContaining({
      kind: "stale_ignored",
      reasonId: oldReason.id,
      detail: expect.stringContaining("newer causal tick 40 remains unresolved"),
    }));
  });
});
