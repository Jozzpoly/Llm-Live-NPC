import { describe, expect, it } from "vitest";
import { ActorWorldState } from "./actor-world-state";

function actors(): ActorWorldState {
  return new ActorWorldState({ minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }, 64);
}

function addStill(state: ActorWorldState, position = { x: 100, y: 100 }) {
  return state.add({
    id: "actor.a",
    kind: "resident",
    position,
    velocity: { x: 0, y: 0 },
    hearingRadius: 100,
    sightRadius: 100,
    maxSpeed: 100,
  });
}

describe("SPC actor facing physical truth", () => {
  it("gives legacy authored actors a deterministic physical facing without making it optional in snapshots", () => {
    const state = actors();
    const added = addStill(state);
    expect(added.facing).toEqual({ x: 1, y: 0 });
    expect(state.require("actor.a").facing).toEqual({ x: 1, y: 0 });
    expect(state.snapshots()[0]?.facing).toEqual({ x: 1, y: 0 });
  });

  it("normalizes an authored facing and isolates it from caller mutation", () => {
    const state = actors();
    const added = state.add({
      id: "actor.a",
      kind: "resident",
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 },
      facing: { x: 0, y: -8 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 100,
    });
    expect(added.facing).toEqual({ x: 0, y: -1 });
    added.facing.x = 1;
    expect(state.require("actor.a").facing).toEqual({ x: 0, y: -1 });
  });

  it("turns toward resolved physical motion and preserves that orientation after stopping", () => {
    const state = actors();
    addStill(state);

    state.setDesiredVelocity("actor.a", { x: 0, y: 80 });
    state.integrate(1);
    expect(state.require("actor.a")).toMatchObject({
      velocity: { x: 0, y: 80 },
      facing: { x: 0, y: 1 },
    });

    state.setDesiredVelocity("actor.a", { x: 0, y: 0 });
    state.integrate(1);
    expect(state.require("actor.a")).toMatchObject({
      velocity: { x: 0, y: 0 },
      facing: { x: 0, y: 1 },
    });
  });

  it("turns in place through explicit body orientation without manufacturing translation", () => {
    const state = actors();
    addStill(state);
    const before = state.require("actor.a").position;

    state.setFacing("actor.a", { x: -20, y: 0 });
    expect(state.require("actor.a")).toMatchObject({
      position: before,
      velocity: { x: 0, y: 0 },
      facing: { x: -1, y: 0 },
    });
    state.integrate(1);
    expect(state.require("actor.a")).toMatchObject({
      position: before,
      velocity: { x: 0, y: 0 },
      facing: { x: -1, y: 0 },
    });
  });

  it("does not lie about orientation when desired movement is fully blocked by World bounds", () => {
    const state = actors();
    state.add({
      id: "actor.a",
      kind: "resident",
      position: { x: 1_000, y: 500 },
      velocity: { x: 0, y: 0 },
      facing: { x: 0, y: 1 },
      hearingRadius: 100,
      sightRadius: 100,
      maxSpeed: 100,
    });

    state.setDesiredVelocity("actor.a", { x: 100, y: 0 });
    const outcome = state.integrate(1)[0]!;
    expect(outcome.resolution).toBe("blocked");
    expect(state.require("actor.a")).toMatchObject({
      velocity: { x: 0, y: 0 },
      facing: { x: 0, y: 1 },
    });
  });

  it("rejects zero or poisoned explicit facing instead of creating directionless body truth", () => {
    const state = actors();
    addStill(state);
    expect(() => state.setFacing("actor.a", { x: 0, y: 0 })).toThrow(/non-zero/);
    expect(() => state.setFacing("actor.a", { x: Number.NaN, y: 1 })).toThrow(/finite/);
  });
});
