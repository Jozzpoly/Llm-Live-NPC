import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

describe("pre-LLM input/action-batch characterization", () => {
  it("shows that same-frame drop + contextual interact can drop and immediately re-pick the same item", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing same-frame action fixture.");
    }

    player.position = { x: 600, y: 420 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 600, y: 394 };

    const world = new World(specimen);
    const driver = new ExecutionDriver(world, new DeterministicExecutor());

    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: player.id },
        { action: "interact", actorId: player.id }
      ]
    });

    expect(frame.playerActionResults).toHaveLength(2);
    expect(frame.playerActionResults[0]).toMatchObject({
      tick: 1,
      status: "succeeded",
      code: "dropped_item",
      targetId: mug.id
    });
    expect(frame.playerActionResults[1]).toMatchObject({
      tick: 1,
      status: "succeeded",
      code: "picked_up_item",
      targetId: mug.id
    });

    const snapshot = world.snapshot();
    expect(snapshot.entities.find((entity) => entity.id === player.id)).toMatchObject({ heldItemId: mug.id });
    expect(snapshot.entities.find((entity) => entity.id === mug.id)).toMatchObject({ heldBy: player.id });

    const itemEvents = world
      .recentEvents(128)
      .filter((event) => event.entityId === mug.id && (event.type === "item.dropped" || event.type === "item.picked_up"));
    expect(itemEvents.map((event) => event.type)).toEqual(["item.dropped", "item.picked_up"]);
    expect(itemEvents.map((event) => event.tick)).toEqual([1, 1]);
  });

  it("shows that same-frame player action order is semantically observable", () => {
    const makeHeldWorld = () => {
      const specimen = createP1Specimen();
      const player = specimen.entities.find((entity) => entity.id === "player.jozz");
      const mug = specimen.entities.find((entity) => entity.id === "item.mug");
      if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
        throw new Error("Missing action ordering fixture.");
      }
      player.position = { x: 600, y: 420 };
      player.heldItemId = mug.id;
      mug.heldBy = player.id;
      mug.position = { x: 600, y: 394 };
      return { world: new World(specimen), playerId: player.id, mugId: mug.id };
    };

    const dropThenInteract = makeHeldWorld();
    const left = new ExecutionDriver(dropThenInteract.world, new DeterministicExecutor()).step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: dropThenInteract.playerId },
        { action: "interact", actorId: dropThenInteract.playerId }
      ]
    });

    const interactThenDrop = makeHeldWorld();
    const right = new ExecutionDriver(interactThenDrop.world, new DeterministicExecutor()).step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "interact", actorId: interactThenDrop.playerId },
        { action: "drop", actorId: interactThenDrop.playerId }
      ]
    });

    expect(left.playerActionResults.map((result) => result.code)).toEqual(["dropped_item", "picked_up_item"]);
    expect(right.playerActionResults.map((result) => result.code)).toEqual(["npc_interaction_requested", "dropped_item"]);
    expect(dropThenInteract.world.snapshot()).not.toEqual(interactThenDrop.world.snapshot());
  });
});
