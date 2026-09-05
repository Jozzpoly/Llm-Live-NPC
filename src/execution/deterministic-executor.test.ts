import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";

function actor(world: World, id: string) {
  const entity = world.snapshot().entities.find((entry) => entry.id === id);
  if (!entity || (entity.kind !== "player" && entity.kind !== "npc")) throw new Error(`Missing actor ${id}`);
  return entity;
}

function runFetchLantern(world: World, executor: DeterministicExecutor, maxTicks = 180): void {
  executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" });

  for (let index = 0; index < maxTicks && executor.state().status === "running"; index += 1) {
    const command = executor.next(world.snapshot());
    world.stepWithActorControls({ moveX: 0, moveY: 0 }, command.control ? [command.control] : []);
    if (command.action) executor.acceptActionResult(world.attemptAction(command.action));
  }
}

describe("B2 deterministic executor", () => {
  it("drives NPC-001 through the current specimen and picks up the existing lantern through World action legality", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();

    runFetchLantern(world, executor);

    expect(executor.state()).toMatchObject({
      status: "succeeded",
      task: { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" },
      failureCode: null
    });
    expect(actor(world, "npc.001").heldItemId).toBe("item.lantern");
    expect(world.snapshot().entities.find((entity) => entity.id === "item.lantern")).toMatchObject({
      kind: "item",
      heldBy: "npc.001"
    });
    expect(world.lastActionResult()).toMatchObject({
      actorId: "npc.001",
      action: "interact",
      targetId: "item.lantern",
      status: "succeeded",
      code: "picked_up_item"
    });
    expect(
      world.recentEvents(128).some(
        (event) => event.type === "item.picked_up" && event.actorId === "npc.001" && event.entityId === "item.lantern"
      )
    ).toBe(true);
    expect(world.tick).toBeLessThan(180);
  });

  it("is deterministic for the same task and world specimen", () => {
    const leftWorld = new World(createP1Specimen());
    const rightWorld = new World(createP1Specimen());
    const leftExecutor = new DeterministicExecutor();
    const rightExecutor = new DeterministicExecutor();

    runFetchLantern(leftWorld, leftExecutor);
    runFetchLantern(rightWorld, rightExecutor);

    expect(leftExecutor.state()).toEqual(rightExecutor.state());
    expect(leftWorld.snapshot()).toEqual(rightWorld.snapshot());
    expect(leftWorld.recentEvents(128)).toEqual(rightWorld.recentEvents(128));
    expect(leftWorld.lastActionResult()).toEqual(rightWorld.lastActionResult());
  });

  it("fails causally when the requested target does not exist instead of inventing a fallback", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();
    executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "missing.target" });

    expect(executor.next(world.snapshot())).toEqual({});
    expect(executor.state()).toEqual({
      status: "failed",
      task: { kind: "approach-and-interact", actorId: "npc.001", targetId: "missing.target" },
      failureCode: "target_not_found"
    });
    expect(world.tick).toBe(0);
    expect(actor(world, "npc.001").heldItemId).toBeNull();
  });

  it("keeps actor controls inside one canonical world tick and updates NPC facing through the same movement rule", () => {
    const world = new World(createP1Specimen());
    const before = actor(world, "npc.001").position;

    world.stepWithActorControls(
      { moveX: 0, moveY: 0 },
      [{ actorId: "npc.001", moveX: 0.25, moveY: 0.25 }]
    );

    const npc = actor(world, "npc.001");
    expect(world.tick).toBe(1);
    expect(npc.position).not.toEqual(before);
    expect(npc.facing.x).toBeCloseTo(Math.SQRT1_2, 8);
    expect(npc.facing.y).toBeCloseTo(Math.SQRT1_2, 8);
  });
});
