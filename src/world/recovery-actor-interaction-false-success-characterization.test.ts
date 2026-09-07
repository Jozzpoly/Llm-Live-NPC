import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

function actorFixture(): { world: World; playerId: string; npcId: string } {
  const specimen = createP1Specimen();
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
    throw new Error("Actor-interaction characterization requires canonical player and NPC.");
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

describe("recovery actor-interaction false-success characterization", () => {
  it("reports explicit player-to-NPC interaction as succeeded even though no semantic World event occurs", () => {
    const { world, playerId, npcId } = actorFixture();
    const eventsBefore = world.recentEvents(128);

    expect(world.attemptAction({ action: "interact", actorId: playerId, targetId: npcId })).toMatchObject({
      status: "succeeded",
      code: "npc_interaction_requested",
      actorId: playerId,
      targetId: npcId,
      message: expect.stringContaining("cognition is disabled in P1")
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });

  it("is asymmetric because the reverse NPC-to-player generic interaction is rejected", () => {
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

  it("lets contextual interaction select the nearby NPC and report the same non-semantic success when items are out of range", () => {
    const { world, playerId, npcId } = actorFixture();
    const eventsBefore = world.recentEvents(128);

    expect(world.attemptAction({ action: "interact", actorId: playerId })).toMatchObject({
      status: "succeeded",
      code: "npc_interaction_requested",
      actorId: playerId,
      targetId: npcId
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });
});
