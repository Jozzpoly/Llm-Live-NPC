import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { E1AgentHarness } from "./e1-agent-harness";

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
    expect(right.playerActionResults.map((result) => result.code)).toEqual(["no_interactable", "dropped_item"]);
    expect(dropThenInteract.world.snapshot()).not.toEqual(interactThenDrop.world.snapshot());
  });

  it("shows that E1 state-delta perception misses real same-tick drop + pickup events whose net state returns to baseline", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("Missing E1 state-reversal fixture.");
    }

    player.position = { x: 600, y: 420 };
    npc.position = { x: 760, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 600, y: 394 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    let providerCalls = 0;
    const harness = new E1AgentHarness(world, executor, async (request) => {
      providerCalls += 1;
      return {
        cycleId: request.cycleId,
        decision: { kind: "wait" },
        model: "unexpected-provider-call",
        gatewayLogId: null,
        latencyMs: 0
      };
    });

    harness.arm();
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: player.id },
        { action: "interact", actorId: player.id }
      ]
    });

    expect(frame.playerActionResults.map((result) => result.code)).toEqual(["dropped_item", "picked_up_item"]);
    expect(
      world.recentEvents(128).filter((event) => event.entityId === mug.id).map((event) => event.type)
    ).toEqual(["item.dropped", "item.picked_up"]);

    expect(harness.afterExecutionStep(frame, 1000)).toBeNull();
    expect(providerCalls).toBe(0);
    expect(harness.state()).toMatchObject({
      requestStatus: "armed",
      cyclesUsed: 0,
      observedChanges: []
    });
  });
});