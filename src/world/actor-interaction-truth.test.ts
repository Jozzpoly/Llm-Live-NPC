import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

function actorFixture(): {
  world: World;
  playerId: string;
  npcId: string;
} {
  const specimen = createP1Specimen();
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
    throw new Error("Actor-interaction fixture requires the canonical player and NPC.");
  }

  player.position = { x: 700, y: 390 };
  npc.position = { x: 730, y: 390 };
  return { world: new World(specimen), playerId: player.id, npcId: npc.id };
}

describe("old-substrate actor interaction truth", () => {
  it("rejects explicit player-to-NPC interaction instead of reporting a non-semantic success", () => {
    const { world, playerId, npcId } = actorFixture();
    const eventsBefore = world.recentEvents(128);

    expect(world.validateInteraction(playerId, npcId)).toMatchObject({
      status: "rejected",
      code: "target_not_interactable",
      actorId: playerId,
      targetId: npcId
    });

    expect(world.attemptAction({ action: "interact", actorId: playerId, targetId: npcId })).toMatchObject({
      status: "rejected",
      code: "target_not_interactable",
      actorId: playerId,
      targetId: npcId
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });

  it("keeps actor interaction symmetric at the old generic action boundary", () => {
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

  it("does not let contextual interaction select an actor that World legality rejects", () => {
    const { world, playerId } = actorFixture();
    const eventsBefore = world.recentEvents(128);

    expect(world.attemptAction({ action: "interact", actorId: playerId })).toMatchObject({
      status: "rejected",
      code: "no_interactable",
      actorId: playerId
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });

  it("makes an executor actor-target task fail through the same World legality", () => {
    const { world, playerId, npcId } = actorFixture();
    const executor = new DeterministicExecutor();
    expect(executor.start({ kind: "approach-and-interact", actorId: npcId, targetId: playerId })).toBe(true);

    expect(executor.next(world.snapshot(), (actorId, targetId) => world.validateInteraction(actorId, targetId))).toEqual({});
    expect(executor.state()).toMatchObject({
      status: "failed",
      failureCode: "target_not_interactable",
      task: { kind: "approach-and-interact", actorId: npcId, targetId: playerId }
    });
  });
});
