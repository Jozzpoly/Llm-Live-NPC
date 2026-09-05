import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";
import type { WorldInput } from "./types";

function stepMany(world: World, count: number, input: WorldInput): void {
  for (let index = 0; index < count; index += 1) world.step(input);
}

function playerSnapshot(world: World) {
  const player = world.snapshot().entities.find((entity) => entity.kind === "player");
  if (!player || player.kind !== "player") throw new Error("Missing player in snapshot");
  return player;
}

describe("P1 World", () => {
  it("is deterministic for the same fixed-step input sequence", () => {
    const left = new World(createP1Specimen());
    const right = new World(createP1Specimen());

    const sequence: WorldInput[] = [
      ...Array.from({ length: 24 }, () => ({ moveX: 1, moveY: 0 })),
      ...Array.from({ length: 18 }, () => ({ moveX: 0, moveY: -1 })),
      ...Array.from({ length: 12 }, () => ({ moveX: -1, moveY: 1 })),
      { moveX: 0, moveY: 0, interactPressed: true },
      ...Array.from({ length: 8 }, () => ({ moveX: 1, moveY: 1 }))
    ];

    for (const input of sequence) {
      left.step(input);
      right.step(input);
    }

    expect(left.snapshot()).toEqual(right.snapshot());
    expect(left.recentEvents(128)).toEqual(right.recentEvents(128));
  });

  it("keeps the player outside authored blockers", () => {
    const world = new World(createP1Specimen());
    stepMany(world, 100, { moveX: 1, moveY: 0 });

    const player = playerSnapshot(world);
    expect(player.position.x).toBeCloseTo(944, 5);
    expect(player.position.y).toBeCloseTo(420, 5);
  });

  it("supports pickup and drop as world-authoritative events", () => {
    const world = new World(createP1Specimen());

    stepMany(world, 37, { moveX: 0, moveY: 1 });
    stepMany(world, 51, { moveX: -1, moveY: 0 });
    world.step({ moveX: 0, moveY: 0, interactPressed: true });

    expect(playerSnapshot(world).heldItemId).toBe("item.mug");
    expect(world.recentEvents(20).some((event) => event.type === "item.picked_up" && event.entityId === "item.mug")).toBe(true);

    world.step({ moveX: 0, moveY: 0, dropPressed: true });
    expect(playerSnapshot(world).heldItemId).toBeNull();
    expect(world.recentEvents(20).some((event) => event.type === "item.dropped" && event.entityId === "item.mug")).toBe(true);
  });

  it("derives line-of-sight from world occluders, including the workshop doorway", () => {
    const world = new World(createP1Specimen());

    expect(world.hasLineOfSight({ x: 900, y: 200 }, { x: 1100, y: 200 })).toBe(false);
    expect(world.hasLineOfSight({ x: 900, y: 300 }, { x: 1100, y: 300 })).toBe(true);
  });
});
