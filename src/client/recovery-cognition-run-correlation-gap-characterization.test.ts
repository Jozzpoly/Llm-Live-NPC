import { describe, expect, it } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { E1AgentHarness } from "./e1-agent-harness";

describe("recovery cognition-to-executor correlation characterization", () => {
  it("currently reduces two distinct cognition cycles to runId + generic cognition cause in execution history", async () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Invalid cognition-run correlation characterization fixture.");
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
        decision: targetId ? { kind: "fetch" as const, targetId } : { kind: "wait" as const },
        model: "correlation-characterization-model",
        gatewayLogId: `correlation-log-${request.cycleId}`,
        latencyMs: 1
      };
    });

    harness.arm();
    const sessionId = harness.state().sessionId;
    expect(sessionId).not.toBeNull();

    const playerDropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const firstCycle = harness.afterExecutionStep(playerDropFrame, 1000);
    expect(firstCycle).not.toBeNull();
    await firstCycle;
    expect(harness.state()).toMatchObject({ sessionId, cycleId: 1, requestStatus: "accepted_fetch" });

    const firstPickupFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(firstPickupFrame.executorActionResult).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    expect(firstPickupFrame.executorActionRun).toEqual({ runId: 1, cause: { kind: "cognition" } });
    expect(harness.afterExecutionStep(firstPickupFrame, 1034)).toBeNull();

    const npcDrop = world.attemptAction({ action: "drop", actorId: npc.id });
    expect(npcDrop).toMatchObject({ status: "succeeded", code: "dropped_item", targetId: mug.id });

    const secondTriggerFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    const secondCycle = harness.afterExecutionStep(secondTriggerFrame, 1800);
    expect(secondCycle).not.toBeNull();
    await secondCycle;
    expect(harness.state()).toMatchObject({ sessionId, cycleId: 2, requestStatus: "accepted_fetch" });

    const secondPickupFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(secondPickupFrame.executorActionResult).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    expect(secondPickupFrame.executorActionRun).toEqual({ runId: 2, cause: { kind: "cognition" } });

    expect(requests.map((request) => request.cycleId)).toEqual([1, 2]);

    const executorAttempts = driver.recentActionAttempts().filter((attempt) => attempt.source === "executor");
    expect(executorAttempts).toHaveLength(2);
    expect(executorAttempts.map((attempt) => attempt.executorRun)).toEqual([
      { runId: 1, cause: { kind: "cognition" } },
      { runId: 2, cause: { kind: "cognition" } }
    ]);

    for (const attempt of executorAttempts) {
      expect(attempt.executorRun?.cause.kind).toBe("cognition");
      expect(Object.keys(attempt.executorRun?.cause ?? {})).toEqual(["kind"]);
    }
  });
});
