import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";

function worldAtDistance(distance: number): World {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
  if (!npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
    throw new Error("Missing geometry characterization entities");
  }

  npc.position = { x: 600, y: 300 };
  lantern.position = { x: 600 + distance, y: 300 };
  npc.heldItemId = null;
  lantern.heldBy = null;
  return new World(specimen);
}

function executorCommandAtDistance(distance: number) {
  const world = worldAtDistance(distance);
  const executor = new DeterministicExecutor();
  expect(executor.start({
    kind: "approach-and-interact",
    actorId: "npc.001",
    targetId: "item.lantern"
  })).toBe(true);
  return { world, executor, command: executor.next(world.snapshot()) };
}

describe("Recovery R1 evidence — executor approach margin vs World interaction range", () => {
  it("characterizes the 50 px band as World-interactable but still conservatively approached by the executor", () => {
    const directWorld = worldAtDistance(50);
    expect(directWorld.attemptAction({
      action: "interact",
      actorId: "npc.001",
      targetId: "item.lantern"
    })).toMatchObject({ status: "succeeded", code: "picked_up_item" });

    const { command } = executorCommandAtDistance(50);
    expect(command.action).toBeUndefined();
    expect(command.control).toMatchObject({ actorId: "npc.001" });
    expect(command.control?.moveX).toBeGreaterThan(0);
  });

  it("at 48 px the executor emits an interact that the World accepts", () => {
    const { world, command } = executorCommandAtDistance(48);
    expect(command.action).toEqual({
      action: "interact",
      actorId: "npc.001",
      targetId: "item.lantern"
    });
    expect(world.attemptAction(command.action!)).toMatchObject({
      status: "succeeded",
      code: "picked_up_item"
    });
  });

  it("just outside the World range the executor approaches rather than emitting a doomed range action", () => {
    const directWorld = worldAtDistance(55);
    expect(directWorld.attemptAction({
      action: "interact",
      actorId: "npc.001",
      targetId: "item.lantern"
    })).toMatchObject({ status: "rejected", code: "target_out_of_range" });

    const { command } = executorCommandAtDistance(55);
    expect(command.action).toBeUndefined();
    expect(command.control).toMatchObject({ actorId: "npc.001" });
  });
});
