import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

describe("pre-LLM execution-frame observability characterization", () => {
  it("shows that ExecutionFrameResult preserves same-frame attempts that World.lastActionResult collapses", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (
      !player ||
      player.kind !== "player" ||
      !npc ||
      npc.kind !== "npc" ||
      !mug ||
      mug.kind !== "item" ||
      !lantern ||
      lantern.kind !== "item"
    ) {
      throw new Error("Missing execution-frame observability fixtures.");
    }

    player.position = { x: 600, y: 420 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 600, y: 394 };

    npc.position = { x: 760, y: 390 };
    lantern.position = { x: 790, y: 390 };

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

    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: player.id },
        { action: "interact", actorId: player.id, targetId: npc.id }
      ]
    });

    expect(frame.playerActionResults).toHaveLength(2);
    expect(frame.playerActionResults[0]).toMatchObject({
      status: "succeeded",
      code: "dropped_item",
      actorId: player.id,
      targetId: mug.id
    });
    expect(frame.playerActionResults[1]).toMatchObject({
      status: "rejected",
      code: "target_out_of_range",
      actorId: player.id,
      targetId: npc.id
    });
    expect(frame.executorActionResult).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      actorId: npc.id,
      targetId: lantern.id
    });

    expect(world.lastActionResult()).toEqual(frame.executorActionResult);
    expect(world.lastActionResult()).not.toEqual(frame.playerActionResults[0]);
    expect(world.lastActionResult()).not.toEqual(frame.playerActionResults[1]);
  });
});
