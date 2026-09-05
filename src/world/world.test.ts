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
    expect(left.lastActionResult()).toEqual(right.lastActionResult());
  });

  it("keeps the player outside authored blockers", () => {
    const world = new World(createP1Specimen());
    stepMany(world, 100, { moveX: 1, moveY: 0 });

    const player = playerSnapshot(world);
    expect(player.position.x).toBeCloseTo(944, 5);
    expect(player.position.y).toBeCloseTo(420, 5);
  });

  it("supports pickup and drop as world-authoritative events with separate action outcomes", () => {
    const world = new World(createP1Specimen());

    stepMany(world, 37, { moveX: 0, moveY: 1 });
    stepMany(world, 51, { moveX: -1, moveY: 0 });
    world.step({ moveX: 0, moveY: 0, interactPressed: true });

    expect(playerSnapshot(world).heldItemId).toBe("item.mug");
    expect(world.recentEvents(20).some((event) => event.type === "item.picked_up" && event.entityId === "item.mug")).toBe(true);
    expect(world.lastActionResult()).toMatchObject({
      action: "interact",
      status: "succeeded",
      code: "picked_up_item",
      targetId: "item.mug"
    });

    world.step({ moveX: 0, moveY: 0, dropPressed: true });
    expect(playerSnapshot(world).heldItemId).toBeNull();
    expect(world.recentEvents(20).some((event) => event.type === "item.dropped" && event.entityId === "item.mug")).toBe(true);
    expect(world.lastActionResult()).toMatchObject({
      action: "drop",
      status: "succeeded",
      code: "dropped_item",
      targetId: "item.mug"
    });
  });

  it("derives line-of-sight from world occluders, including the workshop doorway", () => {
    const world = new World(createP1Specimen());

    expect(world.hasLineOfSight({ x: 900, y: 200 }, { x: 1100, y: 200 })).toBe(false);
    expect(world.hasLineOfSight({ x: 900, y: 300 }, { x: 1100, y: 300 })).toBe(true);
  });

  it("rejects pickup through an occluder without inventing a semantic world event", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const hammer = specimen.entities.find((entity) => entity.id === "item.hammer");
    if (!player || !hammer) throw new Error("P1 specimen is missing player or hammer.");

    player.position = { x: 942, y: 200 };
    hammer.position = { x: 990, y: 200 };

    const world = new World(specimen);
    expect(world.hasLineOfSight(player.position, hammer.position)).toBe(false);

    const semanticEventsBefore = world.recentEvents(128);
    world.step({ moveX: 0, moveY: 0, interactPressed: true });

    expect(playerSnapshot(world).heldItemId).toBeNull();
    expect(world.recentEvents(128)).toEqual(semanticEventsBefore);
    expect(world.lastActionResult()).toMatchObject({
      action: "interact",
      status: "rejected",
      code: "no_interactable"
    });
  });

  it("does not let repeated empty interact presses pollute semantic world history", () => {
    const world = new World(createP1Specimen());
    const semanticEventsBefore = world.recentEvents(128);

    for (let index = 0; index < 20; index += 1) {
      world.step({ moveX: 0, moveY: 0, interactPressed: true });
    }

    expect(world.recentEvents(128)).toEqual(semanticEventsBefore);
    expect(world.lastActionResult()).toMatchObject({
      seq: 20,
      action: "interact",
      status: "rejected",
      code: "no_interactable"
    });
  });

  it("rejects dropping while empty without adding a semantic world event", () => {
    const world = new World(createP1Specimen());
    const semanticEventsBefore = world.recentEvents(128);

    world.step({ moveX: 0, moveY: 0, dropPressed: true });

    expect(world.recentEvents(128)).toEqual(semanticEventsBefore);
    expect(world.lastActionResult()).toMatchObject({
      action: "drop",
      status: "rejected",
      code: "not_holding_item"
    });
  });

  it("exposes the yard table as an authored semantic placement site", () => {
    const world = new World(createP1Specimen());

    expect(world.snapshot().placementSites).toEqual([
      {
        id: "yard.table.top",
        label: "Yard work table top",
        relation: "on",
        bounds: { x: 690, y: 510, width: 120, height: 44 }
      }
    ]);

    expect(world.placementSitesAt({ x: 750, y: 532 })).toEqual([
      {
        id: "yard.table.top",
        label: "Yard work table top",
        relation: "on",
        bounds: { x: 690, y: 510, width: 120, height: 44 }
      }
    ]);
    expect(world.placementSitesAt({ x: 650, y: 532 })).toEqual([]);
  });

  it("returns placement-site query results as isolated copies", () => {
    const world = new World(createP1Specimen());
    const first = world.placementSitesAt({ x: 750, y: 532 });
    if (!first[0]) throw new Error("Expected authored table placement site.");

    first[0].bounds.x = -999;
    first[0].label = "mutated outside world";

    expect(world.placementSitesAt({ x: 750, y: 532 })[0]).toMatchObject({
      id: "yard.table.top",
      label: "Yard work table top",
      bounds: { x: 690, y: 510, width: 120, height: 44 }
    });
  });

  it("returns overlapping authored placement sites deterministically without choosing a winner", () => {
    const specimen = createP1Specimen();
    specimen.placementSites.push({
      id: "aaa.experimental-overlap",
      label: "Experimental overlap",
      relation: "on",
      bounds: { x: 700, y: 520, width: 100, height: 24 }
    });

    const world = new World(specimen);
    expect(world.placementSitesAt({ x: 750, y: 532 }).map((site) => site.id)).toEqual([
      "aaa.experimental-overlap",
      "yard.table.top"
    ]);
  });
});
