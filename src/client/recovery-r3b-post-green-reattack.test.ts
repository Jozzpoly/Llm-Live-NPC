import { describe, expect, it } from "vitest";
import { projectE1Perception } from "../agent/e1-grounding";
import { createP1Specimen } from "../world/specimen";
import type { WorldSnapshot } from "../world/types";
import { World } from "../world/world";
import { resolveInterpolatedEntityPositions } from "./motion-interpolation";
import { resolveDirectInteractionTarget } from "./pointer-targeting";

function requireActor(snapshot: WorldSnapshot, id: string) {
  const actor = snapshot.entities.find((entity) => entity.id === id);
  if (!actor || (actor.kind !== "player" && actor.kind !== "npc")) throw new Error(`Missing actor: ${id}`);
  return actor;
}

function requireItem(snapshot: WorldSnapshot, id: string) {
  const item = snapshot.entities.find((entity) => entity.id === id);
  if (!item || item.kind !== "item") throw new Error(`Missing item: ${id}`);
  return item;
}

function configureSimplePickupWorld() {
  const specimen = createP1Specimen();
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
    throw new Error("Missing pickup fixtures.");
  }

  specimen.blockers = [];
  specimen.placementSites = [];
  player.position = { x: 100, y: 100 };
  player.heldItemId = null;
  mug.position = { x: 120, y: 100 };
  mug.heldBy = null;
  return { world: new World(specimen), playerId: player.id, itemId: mug.id };
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

describe("recovery R3b post-green re-attack", () => {
  it("keeps an NPC-held item canonically co-located and visually attached through repeated actor-control movement", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") throw new Error("Missing NPC holder fixtures.");

    specimen.blockers = [];
    specimen.placementSites = [];
    npc.position = { x: 500, y: 400 };
    npc.heldItemId = mug.id;
    mug.heldBy = npc.id;
    mug.position = { x: 12, y: 34 };

    const world = new World(specimen);
    const controls = [
      { moveX: 1, moveY: 0 },
      { moveX: 0, moveY: 1 },
      { moveX: -1, moveY: 0 },
      { moveX: 0, moveY: -1 },
      { moveX: 1, moveY: 1 }
    ];

    for (const control of controls) {
      world.stepWithActorControls(
        { moveX: 0, moveY: 0 },
        [{ actorId: npc.id, ...control }],
        0.1
      );
      const snapshot = world.snapshot();
      const canonicalNpc = requireActor(snapshot, npc.id);
      const canonicalMug = requireItem(snapshot, mug.id);
      expect(canonicalMug.position).toEqual(canonicalNpc.position);

      const rendered = resolveInterpolatedEntityPositions(snapshot, snapshot, 1);
      expect(rendered.get(mug.id)).toEqual({
        x: canonicalNpc.position.x,
        y: canonicalNpc.position.y - canonicalNpc.radius - 10
      });
    }
  });

  it("preserves R2-permissive authored holder locality instead of independently clamping a held item during construction", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") throw new Error("Missing permissive fixtures.");

    player.position = { x: -20, y: 650 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 900, y: 100 };

    const snapshot = new World(specimen).snapshot();
    expect(requireActor(snapshot, player.id).position).toEqual({ x: -20, y: 650 });
    expect(requireItem(snapshot, mug.id)).toMatchObject({
      heldBy: player.id,
      position: { x: -20, y: 650 }
    });
  });

  it("interpolates pickup from the previous free-item presentation position to the new holder attachment", () => {
    const { world, playerId, itemId } = configureSimplePickupWorld();
    const previous = world.snapshot();
    const freePosition = requireItem(previous, itemId).position;

    expect(world.attemptAction({ action: "interact", actorId: playerId, targetId: itemId })).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      targetId: itemId
    });

    const current = world.snapshot();
    const player = requireActor(current, playerId);
    const item = requireItem(current, itemId);
    expect(item.position).toEqual(player.position);
    expect(item.heldBy).toBe(playerId);

    const heldPresentation = {
      x: player.position.x,
      y: player.position.y - player.radius - 10
    };
    const expectedMidpoint = midpoint(freePosition, heldPresentation);
    const rendered = resolveInterpolatedEntityPositions(previous, current, 0.5);

    expect(rendered.get(itemId)).toEqual(expectedMidpoint);
    expect(resolveDirectInteractionTarget(current.entities, rendered, expectedMidpoint, 1, 0)).toBe(itemId);
  });

  it("interpolates drop from the previous holder attachment to the new canonical free-item position", () => {
    const { world, playerId, itemId } = configureSimplePickupWorld();
    expect(world.attemptAction({ action: "interact", actorId: playerId, targetId: itemId })).toMatchObject({
      status: "succeeded",
      code: "picked_up_item"
    });
    const previous = world.snapshot();
    const player = requireActor(previous, playerId);
    const heldPresentation = {
      x: player.position.x,
      y: player.position.y - player.radius - 10
    };

    expect(world.attemptAction({ action: "drop", actorId: playerId })).toMatchObject({
      status: "succeeded",
      code: "dropped_item",
      targetId: itemId
    });

    const current = world.snapshot();
    const dropped = requireItem(current, itemId);
    expect(dropped.heldBy).toBeNull();
    const expectedMidpoint = midpoint(heldPresentation, dropped.position);
    const rendered = resolveInterpolatedEntityPositions(previous, current, 0.5);

    expect(rendered.get(itemId)).toEqual(expectedMidpoint);
    expect(resolveDirectInteractionTarget(current.entities, rendered, expectedMidpoint, 1, 0)).toBe(itemId);
  });

  it("gives E1 identical canonical distance and direction for a holder and the item that holder carries", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Missing E1 holder fixtures.");
    }

    specimen.blockers = [];
    specimen.placementSites = [];
    player.position = { x: 620, y: 420 };
    player.heldItemId = lantern.id;
    lantern.heldBy = player.id;
    lantern.position = { x: 1, y: 1 };
    npc.position = { x: 500, y: 420 };

    const world = new World(specimen);
    const perception = projectE1Perception(world.snapshot(), npc.id, (start, end) => world.hasLineOfSight(start, end));
    const perceivedPlayer = perception.visibleEntities.find((entity) => entity.id === player.id);
    const perceivedLantern = perception.visibleEntities.find((entity) => entity.id === lantern.id);

    expect(perceivedPlayer).toBeDefined();
    expect(perceivedLantern).toBeDefined();
    expect(perceivedLantern?.distance).toBe(perceivedPlayer?.distance);
    expect(perceivedLantern?.direction).toEqual(perceivedPlayer?.direction);
    expect(perceivedLantern?.heldBy).toBe(player.id);
  });
});
