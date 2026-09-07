import { describe, expect, it } from "vitest";
import { deriveE1ObservedChanges, projectE1Perception } from "../agent/e1-grounding";
import { createP1Specimen } from "../world/specimen";
import type { WorldSnapshot } from "../world/types";
import { World } from "../world/world";
import { resolveInterpolatedEntityPositions } from "./motion-interpolation";
import { resolveDirectInteractionTarget } from "./pointer-targeting";

function requirePlayer(specimen: ReturnType<typeof createP1Specimen>) {
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  if (!player || player.kind !== "player") throw new Error("Missing player fixture.");
  return player;
}

function requireNpc(specimen: ReturnType<typeof createP1Specimen>) {
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  if (!npc || npc.kind !== "npc") throw new Error("Missing NPC fixture.");
  return npc;
}

function requireItem(specimen: ReturnType<typeof createP1Specimen>, id: string) {
  const item = specimen.entities.find((entity) => entity.id === id);
  if (!item || item.kind !== "item") throw new Error(`Missing item fixture: ${id}`);
  return item;
}

function canonicalHeldSnapshot(): WorldSnapshot {
  return {
    tick: 1,
    width: 200,
    height: 200,
    entities: [
      {
        id: "player.test",
        kind: "player",
        label: "Player",
        position: { x: 80, y: 90 },
        radius: 16,
        heldItemId: "item.test",
        facing: { x: 1, y: 0 }
      },
      {
        id: "item.test",
        kind: "item",
        label: "Item",
        position: { x: 80, y: 90 },
        radius: 6,
        heldBy: "player.test"
      }
    ],
    blockers: [],
    locations: [],
    placementSites: [],
    playerLocationId: null
  };
}

describe("recovery R3b held-item semantics characterization", () => {
  it("canonicalizes reciprocal held-item locality to the holder before the first snapshot", () => {
    const specimen = createP1Specimen();
    const player = requirePlayer(specimen);
    const mug = requireItem(specimen, "item.mug");

    player.position = { x: 600, y: 420 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 111, y: 222 };

    const world = new World(specimen);
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: player.id,
      position: { x: 600, y: 420 }
    });
  });

  it("keeps a held item canonically co-located with a legal holder at the world edge", () => {
    const specimen = createP1Specimen();
    const player = requirePlayer(specimen);
    const mug = requireItem(specimen, "item.mug");

    player.position = { x: 600, y: player.radius };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 600, y: player.radius };

    const world = new World(specimen);
    world.step({ moveX: 0, moveY: -1 });

    const snapshot = world.snapshot();
    const canonicalPlayer = snapshot.entities.find((entity) => entity.id === player.id);
    const canonicalMug = snapshot.entities.find((entity) => entity.id === mug.id);
    expect(canonicalPlayer).toMatchObject({ position: { x: 600, y: player.radius } });
    expect(canonicalMug).toMatchObject({
      kind: "item",
      heldBy: player.id,
      position: { x: 600, y: player.radius }
    });
  });

  it("preserves holder continuity for E1 instead of fabricating held-item leave/re-entry around blocker geometry", () => {
    const specimen = createP1Specimen();
    const player = requirePlayer(specimen);
    const npc = requireNpc(specimen);
    const lantern = requireItem(specimen, "item.lantern");

    player.position = { x: 1100, y: 476 };
    player.heldItemId = lantern.id;
    lantern.heldBy = player.id;
    lantern.position = { x: 1100, y: 450 };
    npc.position = { x: 938, y: 476 };

    const world = new World(specimen);
    const before = projectE1Perception(world.snapshot(), npc.id, (start, end) => world.hasLineOfSight(start, end));

    expect(before.visibleEntities.find((entity) => entity.id === player.id)).toBeDefined();
    expect(before.visibleEntities.find((entity) => entity.id === lantern.id)).toMatchObject({
      kind: "item",
      heldBy: player.id,
      distance: 162
    });

    expect(world.attemptAction({ action: "drop", actorId: player.id })).toMatchObject({
      status: "succeeded",
      code: "dropped_item",
      targetId: lantern.id
    });

    const after = projectE1Perception(world.snapshot(), npc.id, (start, end) => world.hasLineOfSight(start, end));
    const changes = deriveE1ObservedChanges(before, after);

    expect(changes).toContainEqual({
      kind: "item_holder_changed",
      itemId: lantern.id,
      previousHolderId: player.id,
      holderId: null
    });
    expect(changes).not.toContainEqual(expect.objectContaining({ kind: "item_entered_perception", itemId: lantern.id }));
  });

  it("derives the carry attachment only in presentation and targets the visible attachment rather than canonical locality", () => {
    const snapshot = canonicalHeldSnapshot();
    const rendered = resolveInterpolatedEntityPositions(snapshot, snapshot, 1);

    expect(rendered.get("player.test")).toEqual({ x: 80, y: 90 });
    expect(rendered.get("item.test")).toEqual({ x: 80, y: 64 });
    expect(snapshot.entities.find((entity) => entity.id === "item.test")?.position).toEqual({ x: 80, y: 90 });

    expect(resolveDirectInteractionTarget(snapshot.entities, rendered, { x: 80, y: 64 }, 1, 0)).toBe("item.test");
    expect(resolveDirectInteractionTarget(snapshot.entities, rendered, { x: 80, y: 90 }, 1, 0)).toBeNull();
  });

  it("does not alter ordinary free-item interpolation semantics", () => {
    const previous = canonicalHeldSnapshot();
    const current = canonicalHeldSnapshot();
    const previousItem = previous.entities.find((entity) => entity.id === "item.test");
    const currentItem = current.entities.find((entity) => entity.id === "item.test");
    const player = current.entities.find((entity) => entity.id === "player.test");
    if (!previousItem || previousItem.kind !== "item" || !currentItem || currentItem.kind !== "item" || !player || player.kind !== "player") {
      throw new Error("Missing free-item interpolation fixtures.");
    }

    previousItem.heldBy = null;
    previousItem.position = { x: 30, y: 40 };
    currentItem.heldBy = null;
    currentItem.position = { x: 70, y: 80 };
    player.heldItemId = null;

    expect(resolveInterpolatedEntityPositions(previous, current, 0.5).get("item.test")).toEqual({ x: 50, y: 60 });
  });

  it("applies the same canonical locality and presentation attachment to NPC-held items through actor-control movement", () => {
    const specimen = createP1Specimen();
    const npc = requireNpc(specimen);
    const mug = requireItem(specimen, "item.mug");

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
      { moveX: 1, moveY: -1 }
    ];

    for (const control of controls) {
      world.stepWithActorControls(
        { moveX: 0, moveY: 0 },
        [{ actorId: npc.id, ...control }],
        0.1
      );

      const snapshot = world.snapshot();
      const canonicalNpc = snapshot.entities.find((entity) => entity.id === npc.id);
      const canonicalMug = snapshot.entities.find((entity) => entity.id === mug.id);
      if (!canonicalNpc || canonicalNpc.kind !== "npc" || !canonicalMug || canonicalMug.kind !== "item") {
        throw new Error("Missing canonical NPC holder snapshot.");
      }

      expect(canonicalMug.position).toEqual(canonicalNpc.position);
      expect(resolveInterpolatedEntityPositions(snapshot, snapshot, 1).get(mug.id)).toEqual({
        x: canonicalNpc.position.x,
        y: canonicalNpc.position.y - canonicalNpc.radius - 10
      });
    }
  });

  it("preserves rendered hit-testing through a complete pickup-to-drop presentation transition lifecycle", () => {
    const specimen = createP1Specimen();
    const player = requirePlayer(specimen);
    const mug = requireItem(specimen, "item.mug");

    specimen.blockers = [];
    specimen.placementSites = [];
    player.position = { x: 100, y: 100 };
    player.heldItemId = null;
    mug.position = { x: 120, y: 100 };
    mug.heldBy = null;

    const world = new World(specimen);
    const beforePickup = world.snapshot();
    const freeBeforePickup = beforePickup.entities.find((entity) => entity.id === mug.id);
    if (!freeBeforePickup || freeBeforePickup.kind !== "item") throw new Error("Missing pre-pickup item snapshot.");

    expect(world.attemptAction({ action: "interact", actorId: player.id, targetId: mug.id })).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      targetId: mug.id
    });

    const held = world.snapshot();
    const heldPlayer = held.entities.find((entity) => entity.id === player.id);
    const heldMug = held.entities.find((entity) => entity.id === mug.id);
    if (!heldPlayer || heldPlayer.kind !== "player" || !heldMug || heldMug.kind !== "item") {
      throw new Error("Missing held transition snapshot.");
    }
    expect(heldMug).toMatchObject({ heldBy: player.id, position: heldPlayer.position });

    const heldAttachment = {
      x: heldPlayer.position.x,
      y: heldPlayer.position.y - heldPlayer.radius - 10
    };
    const pickupMidpoint = {
      x: (freeBeforePickup.position.x + heldAttachment.x) / 2,
      y: (freeBeforePickup.position.y + heldAttachment.y) / 2
    };
    const pickupRendered = resolveInterpolatedEntityPositions(beforePickup, held, 0.5);
    expect(pickupRendered.get(mug.id)).toEqual(pickupMidpoint);
    expect(resolveDirectInteractionTarget(held.entities, pickupRendered, pickupMidpoint, 1, 0)).toBe(mug.id);

    expect(world.attemptAction({ action: "drop", actorId: player.id })).toMatchObject({
      status: "succeeded",
      code: "dropped_item",
      targetId: mug.id
    });

    const dropped = world.snapshot();
    const droppedMug = dropped.entities.find((entity) => entity.id === mug.id);
    if (!droppedMug || droppedMug.kind !== "item") throw new Error("Missing dropped transition snapshot.");
    expect(droppedMug.heldBy).toBeNull();

    const dropMidpoint = {
      x: (heldAttachment.x + droppedMug.position.x) / 2,
      y: (heldAttachment.y + droppedMug.position.y) / 2
    };
    const dropRendered = resolveInterpolatedEntityPositions(held, dropped, 0.5);
    expect(dropRendered.get(mug.id)).toEqual(dropMidpoint);
    expect(resolveDirectInteractionTarget(dropped.entities, dropRendered, dropMidpoint, 1, 0)).toBe(mug.id);
  });
});
