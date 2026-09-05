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

function entitySnapshot(world: World, id: string) {
  const entity = world.snapshot().entities.find((entry) => entry.id === id);
  if (!entity) throw new Error(`Missing entity ${id} in snapshot`);
  return entity;
}

describe("P1 World", () => {
  it("is deterministic for the same fixed-step control and atomic-action sequence", () => {
    const left = new World(createP1Specimen());
    const right = new World(createP1Specimen());

    const sequence: WorldInput[] = [
      ...Array.from({ length: 24 }, () => ({ moveX: 1, moveY: 0 })),
      ...Array.from({ length: 18 }, () => ({ moveX: 0, moveY: -1 })),
      ...Array.from({ length: 12 }, () => ({ moveX: -1, moveY: 1 })),
      ...Array.from({ length: 8 }, () => ({ moveX: 1, moveY: 1 }))
    ];

    for (const input of sequence) {
      left.step(input);
      right.step(input);
    }
    left.attemptAction({ action: "interact", actorId: "player.jozz" });
    right.attemptAction({ action: "interact", actorId: "player.jozz" });

    expect(left.snapshot()).toEqual(right.snapshot());
    expect(left.recentEvents(128)).toEqual(right.recentEvents(128));
    expect(left.lastActionResult()).toEqual(right.lastActionResult());
  });

  it("keeps continuous stepping separate from atomic action outcomes", () => {
    const world = new World(createP1Specimen());
    world.step({ moveX: 0, moveY: 0 });

    expect(world.tick).toBe(1);
    expect(world.lastActionResult()).toBeNull();
  });

  it("rejects non-finite player movement before any world mutation", () => {
    const invalidInputs: WorldInput[] = [
      { moveX: Number.NaN, moveY: 0 },
      { moveX: Number.POSITIVE_INFINITY, moveY: 0 },
      { moveX: 0, moveY: Number.NEGATIVE_INFINITY }
    ];

    for (const input of invalidInputs) {
      const world = new World(createP1Specimen());
      const snapshotBefore = world.snapshot();
      const eventsBefore = world.recentEvents(128);
      const actionBefore = world.lastActionResult();

      expect(() =>
        world.stepWithActorControls(input, [{ actorId: "npc.001", moveX: 1, moveY: 0 }])
      ).toThrow("Player control requires a finite movement vector.");

      expect(world.snapshot()).toEqual(snapshotBefore);
      expect(world.recentEvents(128)).toEqual(eventsBefore);
      expect(world.lastActionResult()).toEqual(actionBefore);
    }
  });

  it("rejects non-finite NPC movement before valid player movement can mutate the world", () => {
    const invalidControls = [
      { actorId: "npc.001", moveX: Number.NaN, moveY: 0 },
      { actorId: "npc.001", moveX: Number.POSITIVE_INFINITY, moveY: 0 },
      { actorId: "npc.001", moveX: 0, moveY: Number.NEGATIVE_INFINITY }
    ];

    for (const control of invalidControls) {
      const world = new World(createP1Specimen());
      const snapshotBefore = world.snapshot();
      const eventsBefore = world.recentEvents(128);
      const actionBefore = world.lastActionResult();

      expect(() => world.stepWithActorControls({ moveX: 1, moveY: 0 }, [control])).toThrow(
        "Actor control npc.001 requires a finite movement vector."
      );

      expect(world.snapshot()).toEqual(snapshotBefore);
      expect(world.recentEvents(128)).toEqual(eventsBefore);
      expect(world.lastActionResult()).toEqual(actionBefore);
    }
  });

  it("keeps the player outside authored blockers", () => {
    const world = new World(createP1Specimen());
    stepMany(world, 100, { moveX: 1, moveY: 0 });

    const player = playerSnapshot(world);
    expect(player.position.x).toBeCloseTo(944, 5);
    expect(player.position.y).toBeCloseTo(420, 5);
  });

  it("preserves contextual pickup and drop through the atomic action seam", () => {
    const world = new World(createP1Specimen());

    stepMany(world, 37, { moveX: 0, moveY: 1 });
    stepMany(world, 51, { moveX: -1, moveY: 0 });
    world.attemptAction({ action: "interact", actorId: "player.jozz" });

    expect(playerSnapshot(world).heldItemId).toBe("item.mug");
    expect(world.recentEvents(20).some((event) => event.type === "item.picked_up" && event.entityId === "item.mug")).toBe(true);
    expect(world.lastActionResult()).toMatchObject({
      action: "interact",
      actorId: "player.jozz",
      status: "succeeded",
      code: "picked_up_item",
      targetId: "item.mug"
    });

    world.attemptAction({ action: "drop", actorId: "player.jozz" });
    expect(playerSnapshot(world).heldItemId).toBeNull();
    expect(world.recentEvents(20).some((event) => event.type === "item.dropped" && event.entityId === "item.mug")).toBe(true);
    expect(world.lastActionResult()).toMatchObject({
      action: "drop",
      actorId: "player.jozz",
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

  it("rejects an explicit occluded target causally without inventing a semantic world event", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const hammer = specimen.entities.find((entity) => entity.id === "item.hammer");
    if (!player || !hammer) throw new Error("P1 specimen is missing player or hammer.");

    player.position = { x: 942, y: 200 };
    hammer.position = { x: 990, y: 200 };

    const world = new World(specimen);
    expect(world.hasLineOfSight(player.position, hammer.position)).toBe(false);

    const semanticEventsBefore = world.recentEvents(128);
    const result = world.attemptAction({
      action: "interact",
      actorId: "player.jozz",
      targetId: "item.hammer"
    });

    expect(playerSnapshot(world).heldItemId).toBeNull();
    expect(world.recentEvents(128)).toEqual(semanticEventsBefore);
    expect(result).toMatchObject({
      action: "interact",
      actorId: "player.jozz",
      status: "rejected",
      code: "target_occluded",
      targetId: "item.hammer"
    });
  });

  it("never falls back to another entity when an explicit target is out of range", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || !mug) throw new Error("P1 specimen is missing player or mug.");

    player.position = { x: 290, y: 610 };
    mug.position = { x: 290, y: 650 };
    const world = new World(specimen);

    const explicit = world.attemptAction({
      action: "interact",
      actorId: "player.jozz",
      targetId: "item.hammer"
    });
    expect(explicit).toMatchObject({
      status: "rejected",
      code: "target_out_of_range",
      targetId: "item.hammer"
    });
    expect(playerSnapshot(world).heldItemId).toBeNull();

    const contextual = world.attemptAction({ action: "interact", actorId: "player.jozz" });
    expect(contextual).toMatchObject({ status: "succeeded", code: "picked_up_item", targetId: "item.mug" });
  });

  it("lets an NPC use the same explicit pickup action contract without an executor or LLM", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("P1 specimen is missing NPC-001 or lantern.");
    }

    npc.position = { x: 760, y: 390 };
    lantern.position = { x: 790, y: 390 };
    const world = new World(specimen);

    const result = world.attemptAction({
      action: "interact",
      actorId: "npc.001",
      targetId: "item.lantern"
    });

    expect(result).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      actorId: "npc.001",
      targetId: "item.lantern"
    });
    expect(entitySnapshot(world, "npc.001")).toMatchObject({ kind: "npc", heldItemId: "item.lantern" });
    expect(entitySnapshot(world, "item.lantern")).toMatchObject({ kind: "item", heldBy: "npc.001" });
    expect(world.recentEvents(20).some((event) =>
      event.type === "item.picked_up" && event.actorId === "npc.001" && event.entityId === "item.lantern"
    )).toBe(true);
  });

  it("rejects an unknown actor or target without semantic world events", () => {
    const world = new World(createP1Specimen());
    const eventsBefore = world.recentEvents(128);

    expect(world.attemptAction({ action: "interact", actorId: "missing.actor", targetId: "item.mug" })).toMatchObject({
      status: "rejected",
      code: "actor_not_found",
      actorId: "missing.actor"
    });
    expect(world.attemptAction({ action: "interact", actorId: "player.jozz", targetId: "missing.target" })).toMatchObject({
      status: "rejected",
      code: "target_not_found",
      targetId: "missing.target"
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });

  it("does not let repeated empty contextual interactions pollute semantic world history", () => {
    const world = new World(createP1Specimen());
    const semanticEventsBefore = world.recentEvents(128);

    for (let index = 0; index < 20; index += 1) {
      world.attemptAction({ action: "interact", actorId: "player.jozz" });
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

    world.attemptAction({ action: "drop", actorId: "player.jozz" });

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
        bounds: { x: 690, y: 510, width: 120, height: 44 },
        supportBlockerId: "yard.table"
      }
    ]);

    expect(world.placementSitesAt({ x: 750, y: 532 })).toEqual([
      {
        id: "yard.table.top",
        label: "Yard work table top",
        relation: "on",
        bounds: { x: 690, y: 510, width: 120, height: 44 },
        supportBlockerId: "yard.table"
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
      bounds: { x: 690, y: 510, width: 120, height: 44 },
      supportBlockerId: "yard.table"
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

  it("accepts a fitting item on the authored table site while ignoring only its support blocker", () => {
    const world = new World(createP1Specimen());

    expect(world.validatePlacementTarget("item.mug", { x: 750, y: 532 })).toEqual({
      status: "accepted",
      itemId: "item.mug",
      position: { x: 750, y: 532 },
      support: { kind: "site", siteId: "yard.table.top", relation: "on" }
    });
  });

  it("rejects a site target when the full item footprint would hang outside the authored surface", () => {
    const world = new World(createP1Specimen());

    expect(world.validatePlacementTarget("item.mug", { x: 695, y: 532 })).toEqual({
      status: "rejected",
      itemId: "item.mug",
      position: { x: 695, y: 532 },
      code: "item_does_not_fit_site",
      candidateSiteIds: ["yard.table.top"]
    });
  });

  it("does not let an authored site hide unrelated blocker collisions", () => {
    const specimen = createP1Specimen();
    specimen.blockers.push({
      id: "experimental.table-obstacle",
      label: "Experimental obstacle",
      bounds: { x: 744, y: 526, width: 12, height: 12 },
      occludesVision: false
    });
    const world = new World(specimen);

    expect(world.validatePlacementTarget("item.mug", { x: 750, y: 532 })).toEqual({
      status: "rejected",
      itemId: "item.mug",
      position: { x: 750, y: 532 },
      code: "blocked",
      candidateSiteIds: ["yard.table.top"],
      blockingBlockerIds: ["experimental.table-obstacle"]
    });
  });

  it("accepts ordinary clear ground and rejects blocked or out-of-world targets", () => {
    const world = new World(createP1Specimen());

    expect(world.validatePlacementTarget("item.mug", { x: 600, y: 700 })).toEqual({
      status: "accepted",
      itemId: "item.mug",
      position: { x: 600, y: 700 },
      support: { kind: "ground", relation: "on" }
    });

    expect(world.validatePlacementTarget("item.mug", { x: 1037, y: 617 })).toEqual({
      status: "rejected",
      itemId: "item.mug",
      position: { x: 1037, y: 617 },
      code: "blocked",
      blockingBlockerIds: ["grove.tree.1"]
    });

    expect(world.validatePlacementTarget("item.mug", { x: 4, y: 200 })).toEqual({
      status: "rejected",
      itemId: "item.mug",
      position: { x: 4, y: 200 },
      code: "outside_world"
    });
  });

  it("rejects ambiguous authored sites instead of hiding a priority rule", () => {
    const specimen = createP1Specimen();
    specimen.placementSites.push({
      id: "aaa.experimental-overlap",
      label: "Experimental overlap",
      relation: "on",
      bounds: { x: 700, y: 520, width: 100, height: 24 },
      supportBlockerId: "yard.table"
    });
    const world = new World(specimen);

    expect(world.validatePlacementTarget("item.mug", { x: 750, y: 532 })).toEqual({
      status: "rejected",
      itemId: "item.mug",
      position: { x: 750, y: 532 },
      code: "ambiguous_site",
      candidateSiteIds: ["aaa.experimental-overlap", "yard.table.top"]
    });
  });

  it("rejects invalid item/position inputs without mutating world state", () => {
    const world = new World(createP1Specimen());
    const snapshotBefore = world.snapshot();
    const eventsBefore = world.recentEvents(128);
    const actionBefore = world.lastActionResult();

    expect(world.validatePlacementTarget("player.jozz", { x: 600, y: 700 })).toMatchObject({
      status: "rejected",
      code: "item_not_found"
    });
    expect(world.validatePlacementTarget("item.mug", { x: Number.NaN, y: 700 })).toMatchObject({
      status: "rejected",
      code: "invalid_position"
    });
    expect(world.validatePlacementTarget("item.mug", { x: 750, y: 532 })).toMatchObject({
      status: "accepted",
      support: { kind: "site", siteId: "yard.table.top", relation: "on" }
    });

    expect(world.snapshot()).toEqual(snapshotBefore);
    expect(world.recentEvents(128)).toEqual(eventsBefore);
    expect(world.lastActionResult()).toEqual(actionBefore);
  });

  it("fails fast when an authored placement site references missing support geometry", () => {
    const specimen = createP1Specimen();
    specimen.placementSites[0]!.supportBlockerId = "missing.blocker";

    expect(() => new World(specimen)).toThrow(
      "Placement site yard.table.top references missing support blocker: missing.blocker"
    );
  });
});
