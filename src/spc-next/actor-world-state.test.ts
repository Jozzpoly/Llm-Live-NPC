import { describe, expect, it } from "vitest";
import { ActorWorldState } from "./actor-world-state";

function state(): ActorWorldState {
  return new ActorWorldState({ minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }, 64);
}

describe("SPC actor physical state authority", () => {
  it("owns mutable actor truth and returns isolated snapshots", () => {
    const actors = state();
    const added = actors.add({
      id: "actor.a",
      kind: "player",
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 50,
    });

    added.position.x = 999;
    const first = actors.require("actor.a");
    first.position.x = 888;

    expect(actors.require("actor.a").position).toEqual({ x: 100, y: 100 });
  });

  it("clamps authored placement and integration to World bounds", () => {
    const actors = state();
    actors.add({
      id: "actor.a",
      kind: "player",
      position: { x: -20, y: 1_100 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 500,
    });
    expect(actors.require("actor.a").position).toEqual({ x: 0, y: 1_000 });

    actors.setDesiredVelocity("actor.a", { x: 500, y: -500 });
    actors.integrate(10);
    expect(actors.require("actor.a").position).toEqual({ x: 1_000, y: 0 });
  });

  it("separates speed-limited controller intent from last resolved physical velocity", () => {
    const actors = state();
    actors.add({
      id: "actor.a",
      kind: "resident",
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 50,
    });

    actors.setDesiredVelocity("actor.a", { x: 300, y: 400 });
    expect(actors.require("actor.a").velocity).toEqual({ x: 0, y: 0 });
    expect(actors.desiredVelocity("actor.a").x).toBeCloseTo(30, 8);
    expect(actors.desiredVelocity("actor.a").y).toBeCloseTo(40, 8);

    actors.integrate(1);
    expect(actors.require("actor.a").velocity.x).toBeCloseTo(30, 8);
    expect(actors.require("actor.a").velocity.y).toBeCloseTo(40, 8);
  });

  it("reports fully blocked desired motion without lying about physical velocity", () => {
    const actors = state();
    actors.add({
      id: "actor.a",
      kind: "player",
      position: { x: 1_000, y: 500 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 100,
    });
    actors.setDesiredVelocity("actor.a", { x: 100, y: 0 });

    const outcome = actors.integrate(1)[0]!;
    expect(outcome).toEqual({
      actorId: "actor.a",
      before: { x: 1_000, y: 500 },
      desiredVelocity: { x: 100, y: 0 },
      intendedAfter: { x: 1_100, y: 500 },
      after: { x: 1_000, y: 500 },
      resolvedVelocity: { x: 0, y: 0 },
      resolution: "blocked",
      constraints: ["world_bounds"],
    });
    expect(actors.require("actor.a").velocity).toEqual({ x: 0, y: 0 });
    expect(actors.desiredVelocity("actor.a")).toEqual({ x: 100, y: 0 });
  });

  it("distinguishes partial constraint from zero-progress blockage", () => {
    const actors = state();
    actors.add({
      id: "actor.a",
      kind: "player",
      position: { x: 1_000, y: 500 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 100,
    });
    actors.setDesiredVelocity("actor.a", { x: 60, y: 80 });

    const outcome = actors.integrate(0.5)[0]!;
    expect(outcome.resolution).toBe("constrained");
    expect(outcome.constraints).toEqual(["world_bounds"]);
    expect(outcome.after).toEqual({ x: 1_000, y: 540 });
    expect(outcome.resolvedVelocity).toEqual({ x: 0, y: 80 });
  });

  it("updates spatial queries atomically with movement integration", () => {
    const actors = state();
    actors.add({
      id: "actor.a",
      kind: "player",
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 600,
    });
    actors.add({
      id: "actor.b",
      kind: "resident",
      position: { x: 800, y: 800 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 600,
    });

    expect(actors.queryRadiusIds({ x: 100, y: 100 }, 20)).toEqual(["actor.a"]);
    actors.setDesiredVelocity("actor.a", { x: 600, y: 0 });
    const outcomes = actors.integrate(1);
    const sample = outcomes.find((candidate) => candidate.actorId === "actor.a")!;

    expect(sample.before).toEqual({ x: 100, y: 100 });
    expect(sample.after).toEqual({ x: 700, y: 100 });
    expect(sample.resolution).toBe("full");
    expect(sample.constraints).toEqual([]);
    expect(actors.queryRadiusIds({ x: 100, y: 100 }, 20)).toEqual([]);
    expect(actors.queryRadiusIds({ x: 700, y: 100 }, 20)).toEqual(["actor.a"]);
  });

  it("returns canonical actor ordering independent of registration order", () => {
    const actors = state();
    for (const id of ["actor.c", "actor.a", "actor.b"]) {
      actors.add({
        id,
        kind: "resident",
        position: { x: 100, y: 100 },
        velocity: { x: 0, y: 0 },
        hearingRadius: 100,
        sightRadius: 100,
        maxSpeed: 50,
      });
    }
    expect(actors.ids()).toEqual(["actor.a", "actor.b", "actor.c"]);
    expect(actors.snapshots().map((actor) => actor.id)).toEqual(["actor.a", "actor.b", "actor.c"]);
    expect(actors.integrate(1).map((outcome) => outcome.actorId)).toEqual(["actor.a", "actor.b", "actor.c"]);
  });

  it("rejects duplicate and poisoned actor state before it enters authoritative storage", () => {
    const actors = state();
    actors.add({
      id: "actor.a",
      kind: "player",
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 50,
    });

    expect(() => actors.add({
      id: "actor.a",
      kind: "player",
      position: { x: 200, y: 200 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 50,
    })).toThrow(/already exists/);

    expect(() => actors.add({
      id: "actor.nan",
      kind: "player",
      position: { x: Number.NaN, y: 10 },
      velocity: { x: 0, y: 0 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 50,
    })).toThrow(/finite/);
  });
});
