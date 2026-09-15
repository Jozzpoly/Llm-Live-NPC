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

    actors.setVelocity("actor.a", { x: 500, y: -500 });
    actors.integrate(10);
    expect(actors.require("actor.a").position).toEqual({ x: 1_000, y: 0 });
  });

  it("limits velocity at the physical-state boundary rather than trusting callers", () => {
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

    actors.setVelocity("actor.a", { x: 300, y: 400 });
    expect(actors.require("actor.a").velocity.x).toBeCloseTo(30, 8);
    expect(actors.require("actor.a").velocity.y).toBeCloseTo(40, 8);
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
    actors.setVelocity("actor.a", { x: 600, y: 0 });
    const samples = actors.integrate(1);

    expect(samples.find((sample) => sample.id === "actor.a")).toEqual({
      id: "actor.a",
      before: { x: 100, y: 100 },
      after: { x: 700, y: 100 },
    });
    expect(actors.queryRadiusIds({ x: 100, y: 100 }, 20)).toEqual([]);
    expect(actors.queryRadiusIds({ x: 700, y: 100 }, 20)).toEqual(["actor.a"]);
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
