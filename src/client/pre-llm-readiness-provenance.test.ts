import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

describe("pre-LLM action provenance characterization", () => {
  it("shows that the ExecutionDriver playerActions channel can directly execute an NPC action outside the executor", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Missing readiness-audit provenance fixture.");
    }

    npc.position = { x: 760, y: 390 };
    lantern.position = { x: 790, y: 390 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);

    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: npc.id, targetId: lantern.id }]
    });

    expect(executor.state().status).toBe("idle");
    expect(frame.executorActionResult).toBeNull();
    expect(frame.playerActionResults[0]).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      actorId: npc.id,
      targetId: lantern.id
    });
    expect(world.snapshot().entities.find((entity) => entity.id === lantern.id)).toMatchObject({
      kind: "item",
      heldBy: npc.id
    });

    const pickupEvent = world.recentEvents(128).find(
      (event) => event.type === "item.picked_up" && event.actorId === npc.id && event.entityId === lantern.id
    );
    expect(pickupEvent).toBeDefined();

    // World records who acted, but neither the result nor semantic event carries
    // a source/causation identity that distinguishes executor vs script/channel.
    expect("source" in frame.playerActionResults[0]!).toBe(false);
    expect("causationId" in frame.playerActionResults[0]!).toBe(false);
    expect("source" in pickupEvent!).toBe(false);
    expect("causationId" in pickupEvent!).toBe(false);
  });
});
