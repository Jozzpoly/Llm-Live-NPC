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

function fixture() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
    throw new Error("Invalid R5 lifecycle fixture.");
  }

  npc.position = { x: 760, y: 390 };
  player.position = { x: 680, y: 390 };
  player.heldItemId = mug.id;
  mug.heldBy = player.id;
  mug.position = { x: player.position.x, y: player.position.y - player.radius - 10 };

  const world = new World(specimen);
  const executor = new DeterministicExecutor();
  const driver = new ExecutionDriver(world, executor);
  return { world, executor, driver, player, mug };
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

describe("R5a E1 arm-session/request identity", () => {
  it("ignores an old successful completion after re-arm instead of letting cycle #1 finish the new cycle #1", async () => {
    const { world, executor, driver, player, mug } = fixture();
    const pending: Array<ReturnType<typeof deferred<E1DecisionEnvelope>>> = [];
    const harness = new E1AgentHarness(world, executor, async () => {
      const request = deferred<E1DecisionEnvelope>();
      pending.push(request);
      return request.promise;
    });

    harness.arm();
    const firstSessionId = harness.state().sessionId;
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const oldRun = harness.afterExecutionStep(dropFrame, 1000);
    expect(oldRun).not.toBeNull();
    expect(pending).toHaveLength(1);
    const oldRequestId = harness.state().requestId;
    expect(harness.state()).toMatchObject({ inFlight: true, cycleId: 1, requestStatus: "in_flight" });

    harness.disarm();
    harness.arm();
    const freshSessionId = harness.state().sessionId;
    expect(freshSessionId).not.toBe(firstSessionId);

    const pickupFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id, targetId: mug.id }]
    });
    expect(pickupFrame.playerActionResults[0]).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    const freshRun = harness.afterExecutionStep(pickupFrame, 2000);
    expect(freshRun).not.toBeNull();
    expect(pending).toHaveLength(2);
    const freshRequestId = harness.state().requestId;
    expect(freshRequestId).not.toBe(oldRequestId);
    expect(harness.state()).toMatchObject({
      sessionId: freshSessionId,
      requestId: freshRequestId,
      inFlight: true,
      cycleId: 1,
      requestStatus: "in_flight",
      model: null
    });

    pending[0]!.resolve(waitEnvelope(1, "old-session-model"));
    await oldRun!;

    expect(harness.state()).toMatchObject({
      sessionId: freshSessionId,
      requestId: freshRequestId,
      inFlight: true,
      requestStatus: "in_flight",
      model: null,
      gatewayLogId: null
    });

    pending[1]!.resolve(waitEnvelope(1, "fresh-session-model"));
    await freshRun!;
    expect(harness.state()).toMatchObject({
      sessionId: freshSessionId,
      requestId: freshRequestId,
      inFlight: false,
      requestStatus: "accepted_wait",
      model: "fresh-session-model",
      gatewayLogId: "fresh-session-model-log"
    });
  });

  it("ignores an old rejected provider after re-arm instead of contaminating the fresh armed session", async () => {
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
    const freshState = harness.state();
    expect(freshState).toMatchObject({ armed: true, inFlight: false, requestStatus: "armed" });

    oldProvider.reject(new Error("old-session-network-failure"));
    await oldRun!;

    expect(harness.state()).toMatchObject({
      armed: true,
      inFlight: false,
      sessionId: freshState.sessionId,
      requestId: null,
      requestStatus: "armed",
      decisionValidation: null
    });
  });
});
