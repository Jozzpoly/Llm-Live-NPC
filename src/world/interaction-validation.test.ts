import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

describe("World interaction legality", () => {
  it("reports semantic target unavailability before incidental range and does not mutate World", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Missing interaction-legality fixtures.");
    }

    player.position = { x: 600, y: 420 };
    player.heldItemId = lantern.id;
    lantern.heldBy = player.id;
    lantern.position = { x: 600, y: 394 };
    npc.position = { x: 760, y: 390 };

    const world = new World(specimen);
    const before = world.snapshot();
    const eventsBefore = world.recentEvents(128);

    expect(world.validateInteraction(npc.id, lantern.id)).toMatchObject({
      status: "rejected",
      code: "target_unavailable",
      actorId: npc.id,
      targetId: lantern.id
    });
    expect(world.snapshot()).toEqual(before);
    expect(world.recentEvents(128)).toEqual(eventsBefore);
    expect(world.lastActionResult()).toBeNull();

    expect(world.attemptAction({ action: "interact", actorId: npc.id, targetId: lantern.id })).toMatchObject({
      status: "rejected",
      code: "target_unavailable",
      actorId: npc.id,
      targetId: lantern.id
    });
  });

  it("uses one World range contract for explicit interaction legality", () => {
    const outOfRangeSpecimen = createP1Specimen();
    const farNpc = outOfRangeSpecimen.entities.find((entity) => entity.id === "npc.001");
    const farLantern = outOfRangeSpecimen.entities.find((entity) => entity.id === "item.lantern");
    if (!farNpc || farNpc.kind !== "npc" || !farLantern || farLantern.kind !== "item") {
      throw new Error("Missing range fixtures.");
    }
    farNpc.position = { x: 700, y: 400 };
    farLantern.position = { x: 755, y: 400 };
    const farWorld = new World(outOfRangeSpecimen);
    expect(farWorld.validateInteraction(farNpc.id, farLantern.id)).toMatchObject({
      status: "rejected",
      code: "target_out_of_range"
    });

    const atRangeSpecimen = createP1Specimen();
    const nearNpc = atRangeSpecimen.entities.find((entity) => entity.id === "npc.001");
    const nearLantern = atRangeSpecimen.entities.find((entity) => entity.id === "item.lantern");
    if (!nearNpc || nearNpc.kind !== "npc" || !nearLantern || nearLantern.kind !== "item") {
      throw new Error("Missing range fixtures.");
    }
    nearNpc.position = { x: 700, y: 400 };
    nearLantern.position = { x: 754, y: 400 };
    const nearWorld = new World(atRangeSpecimen);
    expect(nearWorld.validateInteraction(nearNpc.id, nearLantern.id)).toEqual({
      status: "accepted",
      actorId: nearNpc.id,
      targetId: nearLantern.id,
      targetKind: "item"
    });
  });
});
