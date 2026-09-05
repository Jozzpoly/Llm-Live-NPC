import { describe, expect, it } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { E1AgentHarness } from "./e1-agent-harness";

describe("E1 grounded agent harness", () => {
  it("carries a player drop through temporal perception, cognition, existing executor, World pickup and subsequent experience", async () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Invalid E1 integration fixture.");
    }

    npc.position = { x: 760, y: 390 };
    player.position = { x: 680, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: player.position.x, y: player.position.y - player.radius - 10 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    const requests: E1CycleRequest[] = [];
    const harness = new E1AgentHarness(world, executor, async (request) => {
      requests.push(structuredClone(request));
      const targetId = request.perception.fetchableItemIds[0];
      return {
        cycleId: request.cycleId,
        decision: targetId ? { kind: "fetch", targetId } : { kind: "wait" },
        model: "fake-e1-model",
        gatewayLogId: `fake-log-${request.cycleId}`,
        latencyMs: 1
      };
    });

    harness.arm();
    expect(harness.state().fetchableItemIds).toEqual([]);
    expect(harness.state().visibleEntityIds).toContain("item.mug");

    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: "player.jozz" }]
    });
    const firstCycle = harness.afterExecutionStep(dropFrame, 1000);
    expect(firstCycle).not.toBeNull();
    await firstCycle;

    expect(requests).toHaveLength(1);
    expect(requests[0]?.perception.fetchableItemIds).toEqual(["item.mug"]);
    expect(requests[0]?.observedChanges).toContainEqual({
      kind: "item_holder_changed",
      itemId: "item.mug",
      previousHolderId: "player.jozz",
      holderId: null
    });
    expect(harness.state().observedChanges).toContain("item.mug: holder player.jozz → free");
    expect(executor.state().status).toBe("running");
    expect(executor.state().task?.targetId).toBe("item.mug");

    // The dropped mug is only 41 px from NPC-001, so this deliberately covers
    // the edge case where the E1 task can succeed on its first executor step.
    const pickupFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(pickupFrame.executorActionResult?.code).toBe("picked_up_item");
    expect(executor.state().status).toBe("succeeded");
    expect(harness.afterExecutionStep(pickupFrame, 1034)).toBeNull();

    const afterPickup = harness.state();
    expect(afterPickup.experience).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      targetId: "item.mug"
    });

    const postOutcomeFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    const postOutcomeCycle = harness.afterExecutionStep(postOutcomeFrame, 1800);
    expect(postOutcomeCycle).not.toBeNull();
    await postOutcomeCycle;

    expect(requests).toHaveLength(2);
    expect(requests[1]?.previousExperience).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      targetId: "item.mug"
    });
    expect(requests[1]?.observedChanges).toEqual(
      expect.arrayContaining([
        {
          kind: "observer_held_item_changed",
          previousItemId: null,
          itemId: "item.mug"
        },
        {
          kind: "item_holder_changed",
          itemId: "item.mug",
          previousHolderId: null,
          holderId: "npc.001"
        }
      ])
    );
    expect(requests[1]?.perception.observer.heldItemId).toBe("item.mug");
    expect(requests[1]?.perception.fetchableItemIds).toEqual([]);
    expect(harness.state().requestStatus).toBe("accepted_wait");
    expect(harness.state().cyclesUsed).toBe(2);
  });
});
