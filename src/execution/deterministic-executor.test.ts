import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";
import { ExecutionDriver } from "./execution-driver";

function actor(world: World, id: string) {
  const entity = world.snapshot().entities.find((entry) => entry.id === id);
  if (!entity || (entity.kind !== "player" && entity.kind !== "npc")) throw new Error(`Missing actor ${id}`);
  return entity;
}

function nextExecutor(world: World, executor: DeterministicExecutor) {
  return executor.next(
    world.snapshot(),
    (actorId, targetId) => world.validateInteraction(actorId, targetId)
  );
}

function runFetchLantern(world: World, executor: DeterministicExecutor): void {
  const driver = new ExecutionDriver(world, executor);
  executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" });

  while (executor.state().status === "running") {
    driver.step({ playerControl: { moveX: 0, moveY: 0 } });
  }
}

describe("B2 deterministic executor", () => {
  it("drives NPC-001 through the current specimen and picks up the existing lantern through the shared execution driver", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();

    runFetchLantern(world, executor);

    expect(executor.state()).toMatchObject({
      status: "succeeded",
      task: { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" },
      failureCode: null,
      stepBudget: 180
    });
    expect(executor.state().stepsUsed).toBeLessThan(180);
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
  });

  it("is deterministic for the same task and world specimen through the shared driver", () => {
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

  it("rejects invalid external player control before consuming executor state or mutating world state", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" });

    const worldBefore = world.snapshot();
    const eventsBefore = world.recentEvents(128);
    const actionBefore = world.lastActionResult();
    const executorBefore = executor.state();

    expect(() =>
      driver.step({ playerControl: { moveX: Number.NaN, moveY: 0 } })
    ).toThrow("Player control requires a finite movement vector.");

    expect(executor.state()).toEqual(executorBefore);
    expect(world.snapshot()).toEqual(worldBefore);
    expect(world.recentEvents(128)).toEqual(eventsBefore);
    expect(world.lastActionResult()).toEqual(actionBefore);
  });

  it("fails causally when the requested target does not exist instead of inventing a fallback", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();
    executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "missing.target" });

    expect(nextExecutor(world, executor)).toEqual({});
    expect(executor.state()).toEqual({
      status: "failed",
      task: { kind: "approach-and-interact", actorId: "npc.001", targetId: "missing.target" },
      failureCode: "target_not_found",
      stepsUsed: 1,
      stepBudget: 180
    });
    expect(world.tick).toBe(0);
    expect(actor(world, "npc.001").heldItemId).toBeNull();
  });

  it("fails invalid target geometry before producing movement or an atomic action", () => {
    const world = new World(createP1Specimen());
    const snapshot = world.snapshot();
    const lantern = snapshot.entities.find((entity) => entity.id === "item.lantern");
    if (!lantern) throw new Error("Missing lantern snapshot");
    lantern.position.x = Number.NaN;

    const executor = new DeterministicExecutor();
    executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" });

    expect(
      executor.next(snapshot, (actorId, targetId) => world.validateInteraction(actorId, targetId))
    ).toEqual({});
    expect(executor.state()).toMatchObject({
      status: "failed",
      failureCode: "invalid_target_geometry",
      stepsUsed: 1
    });
    expect(world.tick).toBe(0);
    expect(world.lastActionResult()).toBeNull();
  });

  it("enforces the executor step budget in runtime state rather than only in a test harness", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor(2);
    const driver = new ExecutionDriver(world, executor);
    executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" });

    driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    driver.step({ playerControl: { moveX: 0, moveY: 0 } });

    expect(executor.state()).toMatchObject({
      status: "failed",
      failureCode: "step_budget_exhausted",
      stepsUsed: 2,
      stepBudget: 2
    });
    expect(world.tick).toBe(3);
  });

  it("preserves player-action-before-executor-action ordering inside the shared driver", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Missing B2 ordering specimen entities");
    }
    player.position = { x: 1015, y: 670 };
    npc.position = { x: 1105, y: 670 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" });

    const result = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: "player.jozz", targetId: "item.lantern" }]
    });

    expect(result.playerActionResults[0]).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    expect(result.executorActionResult).toMatchObject({ status: "rejected", code: "target_unavailable" });
    expect(executor.state()).toMatchObject({ status: "failed", failureCode: "target_unavailable" });
    expect(actor(world, "player.jozz").heldItemId).toBe("item.lantern");
    expect(actor(world, "npc.001").heldItemId).toBeNull();
  });

  it("stops pursuing a target as soon as another actor makes it semantically unavailable", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Missing B2 dynamic-validity specimen entities");
    }

    player.position = { x: 1015, y: 670 };
    npc.position = { x: 1120, y: 670 };
    lantern.position = { x: 1060, y: 670 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    executor.start({ kind: "approach-and-interact", actorId: npc.id, targetId: lantern.id });

    const contestedFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id, targetId: lantern.id }]
    });

    expect(contestedFrame.playerActionResults[0]).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    expect(contestedFrame.executorActionResult).toBeNull();
    expect(executor.state().status).toBe("running");

    const positionAfterContestedFrame = actor(world, npc.id).position;
    const nextFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });

    expect(nextFrame.executorActionResult).toBeNull();
    expect(executor.state()).toMatchObject({ status: "failed", failureCode: "target_unavailable" });
    expect(actor(world, npc.id).position).toEqual(positionAfterContestedFrame);
    expect(actor(world, player.id).heldItemId).toBe(lantern.id);
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

  it("rejects an invalid actor-control frame before mutating canonical world state", () => {
    const world = new World(createP1Specimen());
    const before = world.snapshot();

    expect(() =>
      world.stepWithActorControls(
        { moveX: 1, moveY: 0 },
        [
          { actorId: "npc.001", moveX: 1, moveY: 0 },
          { actorId: "npc.001", moveX: 0, moveY: 1 }
        ]
      )
    ).toThrow(/Duplicate actor control/);

    expect(world.snapshot()).toEqual(before);
  });
});
