import { describe, expect, it } from "vitest";
import { deriveE1ObservedChanges, projectE1Perception } from "../agent/e1-grounding";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

describe("held-item canonical locality", () => {
  it("keeps a wall-adjacent held item perceptible with its holder and preserves the real holder-to-free transition", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Missing held-item perception fixtures.");
    }

    // The old presentation-style carry offset put the lantern at y=450, inside
    // workshop.bottom (y=440..460), even though the holder itself was legal.
    player.position = { x: 1100, y: 476 };
    player.heldItemId = lantern.id;
    lantern.heldBy = player.id;
    lantern.position = { x: 1100, y: 450 };
    npc.position = { x: 938, y: 476 };

    const world = new World(specimen);
    const canonicalHeld = world.snapshot().entities.find((entity) => entity.id === lantern.id);
    expect(canonicalHeld).toMatchObject({
      kind: "item",
      heldBy: player.id,
      position: { x: 1100, y: 476 }
    });

    const before = projectE1Perception(
      world.snapshot(),
      npc.id,
      (start, end) => world.hasLineOfSight(start, end)
    );
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

    const after = projectE1Perception(
      world.snapshot(),
      npc.id,
      (start, end) => world.hasLineOfSight(start, end)
    );
    expect(after.visibleEntities.find((entity) => entity.id === lantern.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });
    expect(after.fetchableItemIds).toContain(lantern.id);

    const changes = deriveE1ObservedChanges(before, after);
    expect(changes).toContainEqual({
      kind: "item_holder_changed",
      itemId: lantern.id,
      previousHolderId: player.id,
      holderId: null
    });
    expect(changes).not.toContainEqual(
      expect.objectContaining({ kind: "item_entered_perception", itemId: lantern.id })
    );
  });

  it("keeps a carried item co-located with its holder at the world edge across canonical steps", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing world-edge held-item fixtures.");
    }

    player.position = { x: 600, y: player.radius };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 600, y: 650 };

    const world = new World(specimen);
    world.step({ moveX: 0, moveY: -1 });

    const snapshot = world.snapshot();
    const canonicalPlayer = snapshot.entities.find((entity) => entity.id === player.id);
    const heldMug = snapshot.entities.find((entity) => entity.id === mug.id);
    expect(canonicalPlayer).toMatchObject({ position: { x: 600, y: player.radius }, heldItemId: mug.id });
    expect(heldMug).toMatchObject({
      kind: "item",
      heldBy: player.id,
      position: { x: 600, y: player.radius }
    });
  });
});
