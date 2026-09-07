import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";
import { ExecutionDriver } from "./execution-driver";

describe("execution contract debt guards", () => {
  it("fails a player-owned NPC task causally instead of sending player control through the NPC control channel", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    const playerBefore = world.snapshot().entities.find((entity) => entity.id === "player.jozz");
    const lanternBefore = world.snapshot().entities.find((entity) => entity.id === "item.lantern");

    executor.start({
      kind: "approach-and-interact",
      actorId: "player.jozz",
      targetId: "item.lantern"
    });

    expect(() => driver.step({ playerControl: { moveX: 0, moveY: 0 } })).not.toThrow();
    expect(executor.state()).toMatchObject({
      status: "failed",
      failureCode: "unsupported_actor_kind",
      stepsUsed: 1
    });
    expect(world.tick).toBe(1);
    expect(world.snapshot().entities.find((entity) => entity.id === "player.jozz")).toEqual(playerBefore);
    expect(world.snapshot().entities.find((entity) => entity.id === "item.lantern")).toEqual(lanternBefore);
    expect(world.lastActionResult()).toBeNull();
  });

  it("rejects an NPC action on the playerActions channel before consuming executor or World state", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" });

    const worldBefore = world.snapshot();
    const eventsBefore = world.recentEvents(128);
    const executorBefore = executor.state();

    expect(() =>
      driver.step({
        playerControl: { moveX: 0, moveY: 0 },
        playerActions: [{ action: "interact", actorId: "npc.001", targetId: "item.lantern" }]
      })
    ).toThrow("Player action channel requires canonical player actor player.jozz: npc.001");

    expect(world.snapshot()).toEqual(worldBefore);
    expect(world.recentEvents(128)).toEqual(eventsBefore);
    expect(world.lastActionResult()).toBeNull();
    expect(executor.state()).toEqual(executorBefore);
  });
});
