import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

function actorSnapshot(world: World, id: string) {
  const entity = world.snapshot().entities.find((entry) => entry.id === id);
  if (!entity || (entity.kind !== "player" && entity.kind !== "npc")) {
    throw new Error(`Missing actor ${id}`);
  }
  return entity;
}

describe("B1 canonical actor facing", () => {
  it("preserves authored unit facing for player and NPC before movement exists", () => {
    const world = new World(createP1Specimen());

    expect(actorSnapshot(world, "player.jozz").facing).toEqual({ x: 1, y: 0 });
    expect(actorSnapshot(world, "npc.001").facing).toEqual({ x: -1, y: 0 });
  });

  it("normalizes analog movement intent into unit facing without changing analog movement magnitude", () => {
    const world = new World(createP1Specimen());
    const before = actorSnapshot(world, "player.jozz").position;

    world.step({ moveX: 0.25, moveY: 0.25 });

    const player = actorSnapshot(world, "player.jozz");
    expect(player.facing.x).toBeCloseTo(Math.SQRT1_2, 8);
    expect(player.facing.y).toBeCloseTo(Math.SQRT1_2, 8);
    expect(Math.hypot(player.facing.x, player.facing.y)).toBeCloseTo(1, 8);

    const displacement = Math.hypot(player.position.x - before.x, player.position.y - before.y);
    expect(displacement).toBeCloseTo(Math.hypot(0.25, 0.25) * (190 / 30), 8);
  });

  it("preserves the last facing while movement intent is zero", () => {
    const world = new World(createP1Specimen());
    world.step({ moveX: 0, moveY: -1 });
    world.step({ moveX: 0, moveY: 0 });

    expect(actorSnapshot(world, "player.jozz").facing).toEqual({ x: 0, y: -1 });
  });

  it("updates facing from intent even when collision prevents displacement", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    if (!player || player.kind !== "player") throw new Error("Missing player specimen");

    player.position = { x: 944, y: 420 };
    player.facing = { x: 0, y: -1 };
    const world = new World(specimen);
    const before = actorSnapshot(world, "player.jozz").position;

    world.step({ moveX: 1, moveY: 0 });

    const after = actorSnapshot(world, "player.jozz");
    expect(after.position).toEqual(before);
    expect(after.facing).toEqual({ x: 1, y: 0 });
  });

  it("does not silently rotate an actor toward an explicit interaction target", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
      throw new Error("Missing player or NPC specimen");
    }

    player.position = { x: 710, y: 390 };
    player.facing = { x: 0, y: 1 };
    npc.position = { x: 760, y: 390 };
    const world = new World(specimen);

    expect(world.attemptAction({ action: "interact", actorId: "player.jozz", targetId: "npc.001" })).toMatchObject({
      status: "succeeded",
      code: "npc_interaction_requested"
    });
    expect(actorSnapshot(world, "player.jozz").facing).toEqual({ x: 0, y: 1 });
  });

  it("rejects malformed authored facing instead of normalizing world truth implicitly", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!npc || npc.kind !== "npc") throw new Error("Missing NPC specimen");

    npc.facing = { x: 0, y: 0 };
    expect(() => new World(specimen)).toThrow(/finite unit facing vector/);
  });
});
