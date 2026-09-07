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
    throw new Error("Invalid R5a recovery fixture.");
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

describe("recovery R5a arm-session identity", () => {
  it("keeps an old successful cycle #1 from finishing or overwriting a fresh cycle #1 after re-arm", async () => {
    const { world, executor, driver, player, mug } = fixture();
    const pending: Array<ReturnType<typeof deferred<E1DecisionEnvelope>>> = [];
    const harness = new E1AgentHarness(world, executor, async () => {
      const request = deferred<E1DecisionEnvelope>();
      pending.push(request);
      return request.promise;
    });

    harness.arm();
    const oldSessionId = harness.state().sessionId;
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const oldRun = harness.afterExecutionStep(dropFrame, 1000);
    expect(oldRun).not.toBeNull();
    expect(pending).toHaveLength(1);
    expect(harness.state()).toMatchObject({ sessionId: oldSessionId, inFlight: true, cycleId: 1 });

    harness.disarm();
    harness.arm();
    const freshSessionId = harness.state().sessionId;
    expect(freshSessionId).not.toBe(oldSessionId);

    const pickupFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id, targetId: mug.id }]
    });
    expect(pickupFrame.playerActionResults[0]).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    const freshRun = harness.afterExecutionStep(pickupFrame, 2000);
    expect(freshRun).not.toBeNull();
    expect(pending).toHaveLength(2);
    expect(harness.state()).toMatchObject({
      sessionId: freshSessionId,
      armed: true,
      inFlight: true,
      cycleId: 1,
      requestStatus: "in_flight",
      model: null
    });

    pending[0]!.resolve(waitEnvelope(1, "old-session-model"));
    await oldRun!;

    expect(harness.state()).toMatchObject({
      sessionId: freshSessionId,
      armed: true,
      inFlight: true,
      cycleId: 1,
      requestStatus: "in_flight",
      model: null,
      gatewayLogId: null
    });

    pending[1]!.resolve(waitEnvelope(1, "fresh-session-model"));
    await freshRun!;
    expect(harness.state()).toMatchObject({
      sessionId: freshSessionId,
      inFlight: false,
      requestStatus: "accepted_wait",
      model: "fresh-session-model",
      gatewayLogId: "fresh-session-model-log"
    });
  });

  it("ignores an old rejected provider after re-arm instead of poisoning the fresh idle session", async () => {
    const { world, executor, driver, player } = fixture();
    const oldProvider = deferred<E1DecisionEnvelope>();
    const harness = new E1AgentHarness(world, executor, () => oldProvider.promise);

    harness.arm();
    const oldSessionId = harness.state().sessionId;
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const oldRun = harness.afterExecutionStep(dropFrame, 1000);
    expect(oldRun).not.toBeNull();

    harness.disarm();
    harness.arm();
    const freshSessionId = harness.state().sessionId;
    expect(freshSessionId).not.toBe(oldSessionId);
    expect(harness.state()).toMatchObject({
      sessionId: freshSessionId,
      armed: true,
      inFlight: false,
      requestStatus: "armed",
      decisionValidation: null
    });

    oldProvider.reject(new Error("old-session-network-failure"));
    await oldRun!;

    expect(harness.state()).toMatchObject({
      sessionId: freshSessionId,
      armed: true,
      inFlight: false,
      requestStatus: "armed",
      decisionValidation: null
    });
  });
});
