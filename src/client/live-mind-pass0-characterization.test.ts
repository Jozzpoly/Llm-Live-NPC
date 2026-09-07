import { describe, expect, it } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { E1AgentHarness } from "./e1-agent-harness";

describe("Live Mind refoundation Pass 0 characterization", () => {
  it("characterizes actor interaction as asymmetric and non-semantic in the current World", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
      throw new Error("Pass 0 fixture requires the canonical player and NPC-001.");
    }

    player.position = { x: 700, y: 390 };
    npc.position = { x: 730, y: 390 };
    const world = new World(specimen);
    const eventsBefore = world.recentEvents(128);

    const playerToNpc = world.attemptAction({
      action: "interact",
      actorId: player.id,
      targetId: npc.id
    });

    expect(playerToNpc).toMatchObject({
      status: "succeeded",
      code: "npc_interaction_requested",
      actorId: player.id,
      targetId: npc.id
    });
    expect(playerToNpc.message).toContain("cognition is disabled in P1");
    expect(world.recentEvents(128)).toEqual(eventsBefore);

    const npcToPlayer = world.attemptAction({
      action: "interact",
      actorId: npc.id,
      targetId: player.id
    });

    expect(npcToPlayer).toMatchObject({
      status: "rejected",
      code: "target_not_interactable",
      actorId: npc.id,
      targetId: player.id
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });

  it("characterizes E1 request identity as stopping before executor task, World result and experience", async () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Pass 0 fixture requires NPC-001, the player and mug.");
    }

    npc.position = { x: 760, y: 390 };
    player.position = { x: 680, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { ...player.position };

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
        model: "pass0-fake-model",
        gatewayLogId: `pass0-${request.cycleId}`,
        latencyMs: 1
      };
    });

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const cycle = harness.afterExecutionStep(dropFrame, 1000);
    expect(cycle).not.toBeNull();
    await cycle;

    const cognitionState = harness.state();
    expect(cognitionState.sessionId).not.toBeNull();
    expect(cognitionState.requestId).not.toBeNull();
    expect(cognitionState.requestStatus).toBe("accepted_fetch");

    expect(executor.state().task).toEqual({
      kind: "approach-and-interact",
      actorId: "npc.001",
      targetId: "item.mug"
    });
    expect(executor.state().task).not.toHaveProperty("sessionId");
    expect(executor.state().task).not.toHaveProperty("requestId");
    expect(executor.state().task).not.toHaveProperty("origin");

    const pickupFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    const result = pickupFrame.executorActionResult;
    expect(result).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      actorId: "npc.001",
      targetId: "item.mug"
    });
    expect(result).not.toHaveProperty("sessionId");
    expect(result).not.toHaveProperty("requestId");
    expect(result).not.toHaveProperty("origin");

    expect(pickupFrame.semanticActionOccurrences).toHaveLength(1);
    expect(pickupFrame.semanticActionOccurrences[0]?.source).toBe("executor");
    expect(pickupFrame.semanticActionOccurrences[0]).not.toHaveProperty("sessionId");
    expect(pickupFrame.semanticActionOccurrences[0]).not.toHaveProperty("requestId");

    expect(harness.afterExecutionStep(pickupFrame, 1034)).toBeNull();
    const experience = harness.state().experience;
    expect(experience).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      targetId: "item.mug"
    });
    expect(experience).not.toHaveProperty("sessionId");
    expect(experience).not.toHaveProperty("requestId");
    expect(experience).not.toHaveProperty("origin");

    expect(requests).toHaveLength(1);
  });
});
