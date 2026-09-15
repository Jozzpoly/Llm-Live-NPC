import { describe, expect, it } from "vitest";
import { SightContinuityTracker } from "./sight-continuity";
import type { VisibleActor } from "./contracts";

const actor = (x: number, y = 0, id = "player.jozz"): VisibleActor => ({
  id,
  kind: "player",
  position: { x, y },
});

describe("SightContinuityTracker", () => {
  it("reports enter, meaningful movement, and exit without every-tick percept spam", () => {
    const tracker = new SightContinuityTracker(1 / 60, { reportDistance: 24, maxUnreportedSeconds: 1 });

    expect(tracker.update(1, [actor(0)])).toEqual([{
      actorId: "player.jozz",
      phenomenon: "actor_sight_enter",
      observedAtTick: 1,
      position: { x: 0, y: 0 },
    }]);
    expect(tracker.update(2, [actor(5)])).toEqual([]);
    expect(tracker.update(3, [actor(23.9)])).toEqual([]);
    expect(tracker.update(4, [actor(24)])).toEqual([{
      actorId: "player.jozz",
      phenomenon: "actor_sight_update",
      observedAtTick: 4,
      position: { x: 24, y: 0 },
    }]);
    expect(tracker.update(5, [])).toEqual([{
      actorId: "player.jozz",
      phenomenon: "actor_sight_exit",
      observedAtTick: 5,
      position: null,
    }]);
  });

  it("bounds positional staleness for slow movement without refreshing a stationary actor", () => {
    const tracker = new SightContinuityTracker(1 / 10, { reportDistance: 100, maxUnreportedSeconds: 1 });
    tracker.update(0, [actor(0)]);

    for (let tick = 1; tick < 10; tick += 1) {
      expect(tracker.update(tick, [actor(tick)])).toEqual([]);
    }
    expect(tracker.update(10, [actor(10)])).toEqual([{
      actorId: "player.jozz",
      phenomenon: "actor_sight_update",
      observedAtTick: 10,
      position: { x: 10, y: 0 },
    }]);

    for (let tick = 11; tick <= 40; tick += 1) {
      expect(tracker.update(tick, [actor(10)])).toEqual([]);
    }
  });

  it("emits the final actually-seen position before sight exit even if it was below normal report threshold", () => {
    const tracker = new SightContinuityTracker(1 / 60, { reportDistance: 100, maxUnreportedSeconds: 10 });
    tracker.update(1, [actor(0)]);
    tracker.update(2, [actor(7)]);
    tracker.update(3, [actor(12)]);

    expect(tracker.update(4, [])).toEqual([
      {
        actorId: "player.jozz",
        phenomenon: "actor_sight_update",
        observedAtTick: 3,
        position: { x: 12, y: 0 },
      },
      {
        actorId: "player.jozz",
        phenomenon: "actor_sight_exit",
        observedAtTick: 4,
        position: null,
      },
    ]);
  });

  it("treats re-entry as a fresh sight acquisition and keeps residents/actors deterministic", () => {
    const tracker = new SightContinuityTracker(1 / 60);
    tracker.update(1, [actor(10, 0, "actor.b"), actor(20, 0, "actor.a")]);
    tracker.update(2, []);

    const reentry = tracker.update(3, [actor(30, 0, "actor.b"), actor(40, 0, "actor.a")]);
    expect(reentry.map((draft) => `${draft.actorId}:${draft.phenomenon}`)).toEqual([
      "actor.a:actor_sight_enter",
      "actor.b:actor_sight_enter",
    ]);
  });

  it("fails closed on duplicate or non-finite sensor data", () => {
    const tracker = new SightContinuityTracker(1 / 60);
    expect(() => tracker.update(1, [actor(Number.NaN)])).toThrow(/finite/);
    expect(() => tracker.update(1, [actor(0), actor(1)])).toThrow(/duplicate/);
    expect(() => tracker.update(Number.NaN, [])).toThrow(/safe integer/);
  });

  it("treats sight hysteresis policy as validated sensor configuration rather than unchecked tuning", () => {
    expect(() => new SightContinuityTracker(1 / 60, {
      reportDistance: 24,
      maxUnreportedSeconds: 1,
      releaseMargin: -1,
    })).toThrow(/releaseMargin/);
    expect(() => new SightContinuityTracker(1 / 60, {
      reportDistance: 24,
      maxUnreportedSeconds: 1,
      releaseMargin: Number.NaN,
    })).toThrow(/releaseMargin/);
    expect(() => new SightContinuityTracker(1 / 60, {
      reportDistance: 24,
      maxUnreportedSeconds: 1,
      releaseMargin: Number.POSITIVE_INFINITY,
    })).toThrow(/releaseMargin/);

    const exactBoundaryPolicy = new SightContinuityTracker(1 / 60, {
      reportDistance: 24,
      maxUnreportedSeconds: 1,
      releaseMargin: 0,
    });
    expect(exactBoundaryPolicy.policy.releaseMargin).toBe(0);
  });
});
