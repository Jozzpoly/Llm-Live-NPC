import { describe, expect, it } from "vitest";
import { projectE1Perception } from "../agent/e1-grounding";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { ItemEntity, NpcEntity, PlayerEntity } from "../world/types";

function canonicalActorsAndMug() {
  const specimen = createP1Specimen();
  const player = specimen.entities.find(
    (entity): entity is PlayerEntity => entity.id === "player.jozz" && entity.kind === "player"
  );
  const npc = specimen.entities.find(
    (entity): entity is NpcEntity => entity.id === "npc.001" && entity.kind === "npc"
  );
  const mug = specimen.entities.find(
    (entity): entity is ItemEntity => entity.id === "item.mug" && entity.kind === "item"
  );
  if (!player || !npc || !mug) throw new Error("P2-E1 characterization requires canonical actors and mug.");
  return { specimen, player, npc, mug };
}

function perception(world: World, observerId: string) {
  return projectE1Perception(
    world.snapshot(),
    observerId,
    (start, end) => world.hasLineOfSight(start, end)
  );
}

describe("P2-E1 communication/experience seam characterization", () => {
  it("keeps canonical World event history distinct from observer-scoped perception", () => {
    const { specimen, player, npc, mug } = canonicalActorsAndMug();
    player.position = { x: 610, y: 420 };
    mug.position = { x: 640, y: 420 };
    npc.position = { x: 1200, y: 820 };
    player.heldItemId = null;
    npc.heldItemId = null;
    mug.heldBy = null;

    const world = new World(specimen);
    expect(world.attemptAction({ action: "interact", actorId: player.id, targetId: mug.id })).toMatchObject({
      status: "succeeded",
      code: "picked_up_item"
    });

    expect(world.recentEvents(128)).toContainEqual(
      expect.objectContaining({
        type: "item.picked_up",
        actorId: player.id,
        entityId: mug.id
      })
    );

    const npcPerception = perception(world, npc.id);
    expect(npcPerception.visibleEntities.some((entity) => entity.id === player.id)).toBe(false);
    expect(npcPerception.visibleEntities.some((entity) => entity.id === mug.id)).toBe(false);
  });

  it("shows that identical current state/perception cannot reconstruct different transient histories", () => {
    const first = canonicalActorsAndMug();
    first.player.position = { x: 610, y: 420 };
    first.mug.position = { x: 640, y: 420 };
    first.npc.position = { x: 760, y: 390 };
    first.player.heldItemId = null;
    first.npc.heldItemId = null;
    first.mug.heldBy = null;

    const worldWithHistory = new World(first.specimen);
    expect(
      worldWithHistory.attemptAction({
        action: "interact",
        actorId: first.player.id,
        targetId: first.mug.id
      })
    ).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    expect(worldWithHistory.attemptAction({ action: "drop", actorId: first.player.id })).toMatchObject({
      status: "succeeded",
      code: "dropped_item"
    });

    const finalSnapshot = worldWithHistory.snapshot();
    const equivalentSpecimen = createP1Specimen();
    equivalentSpecimen.width = finalSnapshot.width;
    equivalentSpecimen.height = finalSnapshot.height;
    equivalentSpecimen.entities = structuredClone(finalSnapshot.entities);
    equivalentSpecimen.blockers = structuredClone(finalSnapshot.blockers);
    equivalentSpecimen.locations = structuredClone(finalSnapshot.locations);
    equivalentSpecimen.placementSites = structuredClone(finalSnapshot.placementSites);
    const worldWithoutHistory = new World(equivalentSpecimen);

    expect(worldWithoutHistory.snapshot()).toEqual(finalSnapshot);
    expect(perception(worldWithoutHistory, first.npc.id)).toEqual(
      perception(worldWithHistory, first.npc.id)
    );

    const historicalTypes = worldWithHistory.recentEvents(128).map((event) => event.type);
    const cleanTypes = worldWithoutHistory.recentEvents(128).map((event) => event.type);
    expect(historicalTypes).toContain("item.picked_up");
    expect(historicalTypes).toContain("item.dropped");
    expect(cleanTypes).not.toContain("item.picked_up");
    expect(cleanTypes).not.toContain("item.dropped");
  });
});
