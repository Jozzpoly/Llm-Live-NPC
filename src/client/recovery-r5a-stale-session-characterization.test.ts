import { describe, expect, it } from "vitest";
import type { E1DecisionEnvelope } from "./e1-agent-api";
import { E1AgentHarness } from "./e1-agent-harness";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function waitEnvelope(cycleId: number, model: string): E1DecisionEnvelope {
  return {
    cycleId,
    decision: { kind: "wait" },
    model,
    gatewayLogId: `${model}-log`,
    latencyMs: 1
  };
}

function fixture() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
    throw new Error("Invalid R5a recovery characterization fixture.");
  }

  npc.position = { x: 760, y: 390 };
  player.position = { x: 680, y: 390 };
  player.heldItemId = mug.id;
  mug.heldBy = player.id;
  mug.position = { ...player.position };

  const world = new World(specimen);
  const executor = new DeterministicExecutor();
  const driver = new ExecutionDriver(world, executor);
  return { world, executor, driver, player, mug };
}

describe("recovery R5a stale arm-session characterization", () => {
  it("currently lets an old successful cycle #1 finish and overwrite a fresh cycle #1 after re-arm", async () => {
    const { world, executor, driver, player, mug } = fixture();
    const pending: Array<ReturnType<typeof deferred<E1DecisionEnvelope>>> = [];
    const harness = new E1AgentHarness(world, executor, async () => {
      const request = deferred<E1DecisionEnvelope>();
      pending.push(request);
      return request.promise;
    });

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const oldRun = harness.afterExecutionStep(dropFrame, 1000);
    expect(oldRun).not.toBeNull();
    expect(pending).toHaveLength(1);
    expect(harness.state()).toMatchObject({ armed: true, inFlight: true, cycleId: 1 });

    harness.disarm();
    harness.arm();

    const pickupFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id, targetId: mug.id }]
    });
    expect(pickupFrame.playerActionResults[0]).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    const freshRun = harness.afterExecutionStep(pickupFrame, 2000);
    expect(freshRun).not.toBeNull();
    expect(pending).toHaveLength(2);
    expect(harness.state()).toMatchObject({ armed: true, inFlight: true, cycleId: 1, model: null });

    pending[0]!.resolve(waitEnvelope(1, "old-session-model"));
    await oldRun!;

    expect(harness.state()).toMatchObject({
      armed: true,
      inFlight: false,
      cycleId: 1,
      requestStatus: "accepted_wait",
      model: "old-session-model",
      gatewayLogId: "old-session-model-log"
    });

    pending[1]!.resolve(waitEnvelope(1, "fresh-session-model"));
    await freshRun!;
    expect(harness.state()).toMatchObject({
      inFlight: false,
      requestStatus: "accepted_wait",
      model: "old-session-model",
      gatewayLogId: "old-session-model-log"
    });
  });

  it("currently lets an old rejected request poison a freshly re-armed idle session", async () => {
    const { world, executor, driver, player } = fixture();
    const oldProvider = deferred<E1DecisionEnvelope>();
    const harness = new E1AgentHarness(world, executor, () => oldProvider.promise);

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const oldRun = harness.afterExecutionStep(dropFrame, 1000);
    expect(oldRun).not.toBeNull();

    harness.disarm();
    harness.arm();
    expect(harness.state()).toMatchObject({ armed: true, inFlight: false, requestStatus: "armed" });

    oldProvider.reject(new Error("old-session-network-failure"));
    await oldRun!;

    expect(harness.state()).toMatchObject({
      armed: true,
      inFlight: false,
      requestStatus: "request_error",
      decisionValidation: "old-session-network-failure"
    });
  });
});
