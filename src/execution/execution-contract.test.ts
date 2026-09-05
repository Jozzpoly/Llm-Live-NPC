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
});
