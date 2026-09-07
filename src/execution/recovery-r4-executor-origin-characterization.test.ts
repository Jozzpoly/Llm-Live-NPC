import { describe, expect, it } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { DeterministicExecutor } from "./deterministic-executor";
import { ExecutionDriver } from "./execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { E1AgentHarness } from "../client/e1-agent-harness";
import { startManualExecutorTask } from "../client/manual-executor-trigger";

interface OriginTrace {
  taskAfterStart: ReturnType<DeterministicExecutor["state"]>["task"];
  attempts: ReturnType<ExecutionDriver["recentActionAttempts"]>;
}

function createHeldMugFixture(): {
  world: World;
  executor: DeterministicExecutor;
  driver: ExecutionDriver;
} {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
    throw new Error("Invalid R4 executor-origin characterization fixture.");
  }

  npc.position = { x: 760, y: 390 };
  player.position = { x: 680, y: 390 };
  player.heldItemId = mug.id;
  mug.heldBy = player.id;
  mug.position = { x: player.position.x, y: player.position.y - player.radius - 10 };

  const world = new World(specimen);
  const executor = new DeterministicExecutor();
  return { world, executor, driver: new ExecutionDriver(world, executor) };
}

async function runManualOrigin(): Promise<OriginTrace> {
  const { executor, driver } = createHeldMugFixture();
  driver.step({
    playerControl: { moveX: 0, moveY: 0 },
    playerActions: [{ action: "drop", actorId: "player.jozz" }]
  });

  const start = startManualExecutorTask(
    executor,
    {
      kind: "approach-and-interact",
      actorId: "npc.001",
      targetId: "item.mug"
    },
    () => {}
  );
  expect(start.started).toBe(true);
  const taskAfterStart = executor.state().task;

  const pickupFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
  expect(pickupFrame.executorActionResult?.code).toBe("picked_up_item");
  return { taskAfterStart, attempts: driver.recentActionAttempts() };
}

async function runCognitionOrigin(): Promise<OriginTrace> {
  const { world, executor, driver } = createHeldMugFixture();
  const requests: E1CycleRequest[] = [];
  const harness = new E1AgentHarness(world, executor, async (request) => {
    requests.push(structuredClone(request));
    return {
      cycleId: request.cycleId,
      decision: { kind: "fetch", targetId: "item.mug" },
      model: "r4-origin-characterization",
      gatewayLogId: `r4-origin-${request.cycleId}`,
      latencyMs: 1
    };
  });

  harness.arm();
  const dropFrame = driver.step({
    playerControl: { moveX: 0, moveY: 0 },
    playerActions: [{ action: "drop", actorId: "player.jozz" }]
  });
  const cycle = harness.afterExecutionStep(dropFrame, 1000);
  if (!cycle) throw new Error("Expected E1 cognition cycle after player drop.");
  await cycle;
  expect(requests).toHaveLength(1);
  expect(harness.state().requestStatus).toBe("accepted_fetch");
  const taskAfterStart = executor.state().task;

  const pickupFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
  expect(pickupFrame.executorActionResult?.code).toBe("picked_up_item");
  return { taskAfterStart, attempts: driver.recentActionAttempts() };
}

describe("R4 executor-origin provenance characterization", () => {
  it("collapses manual-debug and E1-cognition origins into the same executor task and action-attempt trace", async () => {
    const manual = await runManualOrigin();
    const cognition = await runCognitionOrigin();

    expect(cognition.taskAfterStart).toEqual(manual.taskAfterStart);
    expect(cognition.attempts).toEqual(manual.attempts);

    const executorAttempt = manual.attempts.find((attempt) => attempt.source === "executor");
    expect(executorAttempt).toMatchObject({
      source: "executor",
      action: "interact",
      actorId: "npc.001",
      targetId: "item.mug",
      status: "succeeded",
      code: "picked_up_item"
    });
    expect(executorAttempt && "origin" in executorAttempt).toBe(false);
    expect(executorAttempt && "cycleId" in executorAttempt).toBe(false);
    expect(executorAttempt && "requestId" in executorAttempt).toBe(false);
  });
});
