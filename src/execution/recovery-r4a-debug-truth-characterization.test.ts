import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";
import { ExecutionDriver } from "./execution-driver";

function fixture() {
  const specimen = createP1Specimen();
  specimen.blockers = [];
  specimen.placementSites = [];

  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
  if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !mug || mug.kind !== "item" || !lantern || lantern.kind !== "item") {
    throw new Error("Missing R4a characterization fixtures.");
  }

  player.position = { x: 300, y: 300 };
  mug.position = { x: 330, y: 300 };
  mug.heldBy = null;
  npc.position = { x: 700, y: 300 };
  lantern.position = { x: 730, y: 300 };
  lantern.heldBy = null;
  player.heldItemId = null;
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

describe("recovery R4a current diagnostic truth characterization", () => {
  it("proves one execution frame can contain three ordered atomic attempts while World.lastActionResult exposes only the final one", () => {
    const { world, driver, playerId, mugId, lanternId } = fixture();

    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: playerId },
        { action: "interact", actorId: playerId, targetId: mugId }
      ]
    });

    expect(frame.playerActionResults).toHaveLength(2);
    expect(frame.playerActionResults[0]).toMatchObject({
      actorId: playerId,
      action: "drop",
      status: "rejected",
      code: "not_holding_item"
    });
    expect(frame.playerActionResults[1]).toMatchObject({
      actorId: playerId,
      action: "interact",
      targetId: mugId,
      status: "succeeded",
      code: "picked_up_item"
    });
    expect(frame.executorActionResult).toMatchObject({
      actorId: "npc.001",
      action: "interact",
      targetId: lanternId,
      status: "succeeded",
      code: "picked_up_item"
    });

    const orderedSeqs = [
      ...frame.playerActionResults.map((result) => result.seq),
      frame.executorActionResult!.seq
    ];
    expect(orderedSeqs).toEqual([...orderedSeqs].sort((a, b) => a - b));

    expect(world.lastActionResult()).toEqual(frame.executorActionResult);
    expect(world.lastActionResult()?.seq).not.toBe(frame.playerActionResults[0]?.seq);
    expect(world.lastActionResult()?.seq).not.toBe(frame.playerActionResults[1]?.seq);
  });

  it("shows that later empty execution frames preserve only that one last result rather than a complete bounded attempt history", () => {
    const { world, driver, playerId, mugId } = fixture();
    const populated = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: playerId },
        { action: "interact", actorId: playerId, targetId: mugId }
      ]
    });
    const last = world.lastActionResult();
    expect(last).toEqual(populated.executorActionResult);

    const empty = driver.step({ playerControl: { moveX: 0, moveY: 0 }, playerActions: [] });
    expect(empty.playerActionResults).toEqual([]);
    expect(empty.executorActionResult).toBeNull();
    expect(world.lastActionResult()).toEqual(last);
  });
});
