import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

describe("recovery R2 admission matrix", () => {
  it("currently admits two player entities and gives player control to only the first one", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    if (!player || player.kind !== "player") throw new Error("Missing player fixture.");

    const alternate = structuredClone(player);
    alternate.id = "player.alt";
    alternate.position = { x: 700, y: 420 };
    specimen.entities.push(alternate);

    const world = new World(specimen);
    const before = world.snapshot();
    const primaryBefore = before.entities.find((entity) => entity.id === "player.jozz");
    const alternateBefore = before.entities.find((entity) => entity.id === "player.alt");
    if (!primaryBefore || !alternateBefore) throw new Error("Missing admitted players.");

    world.step({ moveX: 1, moveY: 0 });

    const after = world.snapshot();
    const primaryAfter = after.entities.find((entity) => entity.id === "player.jozz");
    const alternateAfter = after.entities.find((entity) => entity.id === "player.alt");
    if (!primaryAfter || !alternateAfter) throw new Error("Missing admitted players after step.");

    expect(after.entities.filter((entity) => entity.kind === "player")).toHaveLength(2);
    expect(primaryAfter.position.x).toBeGreaterThan(primaryBefore.position.x);
    expect(alternateAfter.position).toEqual(alternateBefore.position);
  });

  it("currently admits actor->item one-way ownership and can create two actors claiming the same item", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("Missing ownership fixtures.");
    }

    player.heldItemId = mug.id;
    mug.heldBy = null;
    mug.position = { x: 730, y: 390 };

    const world = new World(specimen);
    const result = world.attemptAction({ action: "interact", actorId: npc.id, targetId: mug.id });
    expect(result).toMatchObject({ status: "succeeded", code: "picked_up_item" });

    const snapshot = world.snapshot();
    const playerAfter = snapshot.entities.find((entity) => entity.id === player.id);
    const npcAfter = snapshot.entities.find((entity) => entity.id === npc.id);
    const mugAfter = snapshot.entities.find((entity) => entity.id === mug.id);

    expect(playerAfter).toMatchObject({ heldItemId: mug.id });
    expect(npcAfter).toMatchObject({ heldItemId: mug.id });
    expect(mugAfter).toMatchObject({ heldBy: npc.id });
  });

  it("currently admits item->actor one-way ownership and leaves the item unavailable while the named holder cannot drop it", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("Missing ownership fixtures.");
    }

    player.heldItemId = null;
    mug.heldBy = player.id;
    mug.position = { x: 730, y: 390 };

    const world = new World(specimen);
    expect(world.attemptAction({ action: "interact", actorId: npc.id, targetId: mug.id })).toMatchObject({
      status: "rejected",
      code: "target_unavailable"
    });
    expect(world.attemptAction({ action: "drop", actorId: player.id })).toMatchObject({
      status: "rejected",
      code: "not_holding_item"
    });
  });

  it("currently admits non-finite world dimensions and a later movement step poisons canonical actor geometry", () => {
    const specimen = createP1Specimen();
    specimen.width = Number.NaN;

    const world = new World(specimen);
    expect(Number.isNaN(world.snapshot().width)).toBe(true);

    world.step({ moveX: 1, moveY: 0 });
    const player = world.snapshot().entities.find((entity) => entity.id === "player.jozz");
    if (!player || player.kind !== "player") throw new Error("Missing player after poisoned step.");
    expect(Number.isNaN(player.position.x)).toBe(true);
  });

  it("currently admits duplicate authored blocker/location/site IDs", () => {
    const specimen = createP1Specimen();
    specimen.blockers.push(structuredClone(specimen.blockers[0]!));
    specimen.locations.push(structuredClone(specimen.locations[0]!));
    specimen.placementSites.push(structuredClone(specimen.placementSites[0]!));

    const world = new World(specimen);
    const snapshot = world.snapshot();
    expect(snapshot.blockers.filter((entry) => entry.id === specimen.blockers[0]!.id)).toHaveLength(2);
    expect(snapshot.locations.filter((entry) => entry.id === specimen.locations[0]!.id)).toHaveLength(2);
    expect(snapshot.placementSites.filter((entry) => entry.id === specimen.placementSites[0]!.id)).toHaveLength(2);
  });

  it("currently admits topology-policy states such as blocked actors and free items outside world bounds", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing topology fixtures.");
    }

    player.position = { x: 970, y: 200 };
    mug.position = { x: -20, y: 650 };

    const world = new World(specimen);
    const snapshot = world.snapshot();
    expect(snapshot.entities.find((entity) => entity.id === player.id)).toMatchObject({ position: { x: 970, y: 200 } });
    expect(snapshot.entities.find((entity) => entity.id === mug.id)).toMatchObject({ position: { x: -20, y: 650 } });
  });

  it("currently treats held-item attachment position as representation, allowing it outside canonical world bounds", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing held-item fixtures.");
    }

    player.position = { x: 500, y: player.radius };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 500, y: -10 };

    const world = new World(specimen);
    world.step({ moveX: 0, moveY: 0 });
    const held = world.snapshot().entities.find((entity) => entity.id === mug.id);
    expect(held).toMatchObject({ heldBy: player.id, position: { x: 500, y: -10 } });
  });
});
