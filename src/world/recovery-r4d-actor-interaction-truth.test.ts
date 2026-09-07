import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

function actorFixture(): { world: World; playerId: string; npcId: string } {
  const specimen = createP1Specimen();
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
    throw new Error("R4d actor-interaction fixture requires canonical player and NPC.");
  }

  player.position = { x: 700, y: 390 };
  npc.position = { x: 730, y: 390 };
  for (const entity of specimen.entities) {
    if (entity.kind === "item") {
      entity.position = { x: 120, y: 120 };
      entity.heldBy = null;
    }
  }
  player.heldItemId = null;
  npc.heldItemId = null;

  return { world: new World(specimen), playerId: player.id, npcId: npc.id };
}

describe("recovery R4d actor interaction truth", () => {
  it("rejects explicit player-to-NPC interaction instead of reporting a semantic success that never occurred", () => {
    const { world, playerId, npcId } = actorFixture();
    const eventsBefore = world.recentEvents(128);

    expect(world.attemptAction({ action: "interact", actorId: playerId, targetId: npcId })).toMatchObject({
      status: "rejected",
      code: "target_not_interactable",
      actorId: playerId,
      targetId: npcId
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });

  it("keeps unsupported generic actor interaction symmetric", () => {
    const { world, playerId, npcId } = actorFixture();
    const eventsBefore = world.recentEvents(128);

    expect(world.attemptAction({ action: "interact", actorId: npcId, targetId: playerId })).toMatchObject({
      status: "rejected",
      code: "target_not_interactable",
      actorId: npcId,
      targetId: playerId
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });

  it("does not let contextual item interaction select a nearby NPC when no valid item is available", () => {
    const { world, playerId } = actorFixture();
    const eventsBefore = world.recentEvents(128);

    expect(world.attemptAction({ action: "interact", actorId: playerId })).toMatchObject({
      status: "rejected",
      code: "no_interactable",
      actorId: playerId
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });
});
