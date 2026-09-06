import { describe, expect, it } from "vitest";
import { projectE1Perception } from "../agent/e1-grounding";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

describe("World/E1 location membership consistency", () => {
  it("gives player World truth and NPC E1 perception the same higher-priority identity in an authored overlap", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
      throw new Error("Missing actor fixtures.");
    }

    player.position = { x: 440, y: 560 };
    npc.position = { x: 440, y: 560 };
    const world = new World(specimen);

    expect(world.playerLocationId).toBe("cottage");
    const perception = projectE1Perception(
      world.snapshot(),
      npc.id,
      (start, end) => world.hasLineOfSight(start, end)
    );
    expect(perception.observer.locationId).toBe("cottage");
    expect(perception.observer.locationLabel).toBe("Cottage");
  });

  it("keeps E1 location identity stable when snapshot location order is reversed", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!npc || npc.kind !== "npc") throw new Error("Missing NPC fixture.");
    npc.position = { x: 440, y: 560 };

    const world = new World(specimen);
    const canonical = world.snapshot();
    const reordered = structuredClone(canonical);
    reordered.locations.reverse();

    const project = (snapshot: typeof canonical) =>
      projectE1Perception(snapshot, npc.id, (start, end) => world.hasLineOfSight(start, end));

    expect(project(canonical).observer.locationId).toBe("cottage");
    expect(project(reordered).observer.locationId).toBe("cottage");
  });
});
