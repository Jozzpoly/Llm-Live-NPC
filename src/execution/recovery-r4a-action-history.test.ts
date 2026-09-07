import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";
import { ExecutionDriver } from "./execution-driver";

function threeAttemptFixture() {
  const specimen = createP1Specimen();
  specimen.blockers = [];
  specimen.placementSites = [];

  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
  if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !mug || mug.kind !== "item" || !lantern || lantern.kind !== "item") {
    throw new Error("Missing R4a fixtures.");
  }

  player.position = { x: 300, y: 300 };
  mug.position = { x: 330, y: 300 };
  mug.heldBy = null;
  player.heldItemId = null;
  npc.position = { x: 700, y: 300 };
  lantern.position = { x: 730, y: 300 };
  lantern.heldBy = null;
  npc.heldItemId = null;

  const world = new World(specimen);
  const executor = new DeterministicExecutor();
  const driver = new ExecutionDriver(world, executor);
  expect(
    executor.start({
      kind: "approach-and-interact",
      actorId: npc.id,
      targetId: lantern.id
    })
  ).toBe(true);

  return { world, driver, playerId: player.id, mugId: mug.id, lanternId: lantern.id };
}

function emptyDriverFixture() {
  const world = new World(createP1Specimen());
  const playerId = world.snapshot().entities.find((entity) => entity.kind === "player")?.id;
  if (!playerId) throw new Error("Missing player fixture.");
  return {
    driver: new ExecutionDriver(world, new DeterministicExecutor()),
    playerId
  };
}

describe("recovery R4a driver-scoped action-attempt history", () => {
  it("preserves player attempts followed by the executor attempt with explicit channel source", () => {
    const { driver, playerId, mugId, lanternId } = threeAttemptFixture();

    driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: playerId },
        { action: "interact", actorId: playerId, targetId: mugId }
      ]
    });

    expect(driver.recentActionAttempts()).toEqual([
      expect.objectContaining({
        source: "player",
        actorId: playerId,
        action: "drop",
        status: "rejected",
        code: "not_holding_item"
      }),
      expect.objectContaining({
        source: "player",
        actorId: playerId,
        action: "interact",
        targetId: mugId,
        status: "succeeded",
        code: "picked_up_item"
      }),
      expect.objectContaining({
        source: "executor",
        actorId: "npc.001",
        action: "interact",
        targetId: lanternId,
        status: "succeeded",
        code: "picked_up_item"
      })
    ]);
  });

  it("does not erase recent attempts when later fixed-step frames contain no atomic action", () => {
    const { driver, playerId } = threeAttemptFixture();
    driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: playerId }]
    });
    const before = driver.recentActionAttempts();

    driver.step({ playerControl: { moveX: 0, moveY: 0 }, playerActions: [] });
    driver.step({ playerControl: { moveX: 0, moveY: 0 }, playerActions: [] });

    expect(driver.recentActionAttempts()).toEqual(before);
  });

  it("retains only the newest 12 attempts and returns isolated copies", () => {
    const { driver, playerId } = emptyDriverFixture();

    for (let attempt = 0; attempt < 14; attempt += 1) {
      driver.step({
        playerControl: { moveX: 0, moveY: 0 },
        playerActions: [{ action: "drop", actorId: playerId }]
      });
    }

    const recent = driver.recentActionAttempts();
    expect(recent).toHaveLength(12);
    expect(recent.map((entry) => entry.seq)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

    recent[0]!.message = "mutated outside driver";
    expect(driver.recentActionAttempts()[0]!.message).not.toBe("mutated outside driver");
  });

  it("keeps histories isolated between ExecutionDriver instances", () => {
    const first = emptyDriverFixture();
    const second = emptyDriverFixture();

    first.driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: first.playerId }]
    });

    expect(first.driver.recentActionAttempts()).toHaveLength(1);
    expect(second.driver.recentActionAttempts()).toEqual([]);
  });
});
