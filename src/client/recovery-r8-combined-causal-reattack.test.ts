import { describe, expect, it } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { E1DecisionEnvelope } from "./e1-agent-api";
import { E1AgentHarness } from "./e1-agent-harness";
import { startManualExecutorTask } from "./manual-executor-trigger";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fetchEnvelope(cycleId: number, targetId: string, model = "r8-model"): E1DecisionEnvelope {
  return {
    cycleId,
    decision: { kind: "fetch", targetId },
    model,
    gatewayLogId: `${model}-log-${cycleId}`,
    latencyMs: 1
  };
}

function e1Fixture() {
  const specimen = createP1Specimen();
  specimen.blockers = [];
  specimen.placementSites = [];

  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
  if (
    !player || player.kind !== "player" ||
    !npc || npc.kind !== "npc" ||
    !mug || mug.kind !== "item" ||
    !lantern || lantern.kind !== "item"
  ) {
    throw new Error("Invalid R8 recovery fixture.");
  }

  player.position = { x: 735, y: 390 };
  npc.position = { x: 760, y: 390 };
  player.heldItemId = mug.id;
  mug.heldBy = player.id;
  mug.position = { ...player.position };
  npc.heldItemId = null;
  lantern.heldBy = null;
  lantern.position = { x: 785, y: 390 };

  const world = new World(specimen);
  const executor = new DeterministicExecutor();
  const driver = new ExecutionDriver(world, executor);
  return { world, executor, driver, player, npc, mug, lantern };
}

describe("recovery R8 combined causal re-attack", () => {
  it("keeps same-frame player-vs-cognition ordering truthful without fabricating cognition success", async () => {
    const { world, executor, driver, player, mug } = e1Fixture();
    const requests: E1CycleRequest[] = [];
    const harness = new E1AgentHarness(world, executor, async (request) => {
      requests.push(structuredClone(request));
      return fetchEnvelope(request.cycleId, mug.id);
    });

    harness.arm();
    const initialDrop = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const cognition = harness.afterExecutionStep(initialDrop, 1000);
    expect(cognition).not.toBeNull();
    await cognition;

    expect(requests.map((request) => request.cycleId)).toEqual([1]);
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: 1, cause: { kind: "cognition", sessionId: 1, cycleId: 1 } }
    });

    // Executor derives an interact command from the pre-step snapshot where the
    // mug is free. The player then acts first in the canonical frame ordering.
    const raceFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id, targetId: mug.id }]
    });

    expect(raceFrame.playerActionResults).toHaveLength(1);
    expect(raceFrame.playerActionResults[0]).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      actorId: player.id,
      targetId: mug.id
    });
    expect(raceFrame.executorActionRun).toEqual({
      runId: 1,
      cause: { kind: "cognition", sessionId: 1, cycleId: 1 }
    });
    expect(raceFrame.executorActionResult).toMatchObject({
      status: "rejected",
      code: "target_unavailable",
      actorId: "npc.001",
      targetId: mug.id
    });
    expect(world.lastActionResult()).toMatchObject({
      status: "rejected",
      code: "target_unavailable",
      actorId: "npc.001"
    });
    expect(executor.state()).toMatchObject({
      status: "running",
      failureCode: null,
      run: { runId: 1, cause: { kind: "cognition", sessionId: 1, cycleId: 1 } }
    });

    expect(harness.afterExecutionStep(raceFrame, 1034)).toBeNull();
    expect(harness.state().experience).toBeNull();

    const raceAttempts = driver.recentActionAttempts().slice(-2);
    expect(raceAttempts).toEqual([
      expect.objectContaining({
        source: "player",
        actorId: player.id,
        status: "succeeded",
        code: "picked_up_item",
        targetId: mug.id
      }),
      expect.objectContaining({
        source: "executor",
        actorId: "npc.001",
        status: "rejected",
        code: "target_unavailable",
        targetId: mug.id,
        executorRun: { runId: 1, cause: { kind: "cognition", sessionId: 1, cycleId: 1 } }
      })
    ]);

    const secondDrop = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    expect(secondDrop.playerActionResults[0]).toMatchObject({ status: "succeeded", code: "dropped_item" });
    expect(harness.afterExecutionStep(secondDrop, 1067)).toBeNull();
    expect(executor.state().status).toBe("running");

    const completionFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(completionFrame.executorActionRun).toEqual({
      runId: 1,
      cause: { kind: "cognition", sessionId: 1, cycleId: 1 }
    });
    expect(completionFrame.executorActionResult).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      actorId: "npc.001",
      targetId: mug.id
    });
    expect(executor.state().status).toBe("succeeded");
    expect(harness.afterExecutionStep(completionFrame, 1100)).toBeNull();
    expect(harness.state().experience).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      targetId: mug.id
    });
  });

  it("lets an accepted manual task disarm an in-flight E1 request and makes the late model completion inert", async () => {
    const { world, executor, driver, player, npc, mug, lantern } = e1Fixture();
    const pending = deferred<E1DecisionEnvelope>();
    const harness = new E1AgentHarness(world, executor, () => pending.promise);

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const oldCycle = harness.afterExecutionStep(dropFrame, 1000);
    expect(oldCycle).not.toBeNull();
    expect(harness.state()).toMatchObject({ armed: true, inFlight: true, sessionId: 1, cycleId: 1 });
    expect(executor.state().status).toBe("idle");

    let lifecycleCalls = 0;
    const manual = startManualExecutorTask(
      executor,
      { kind: "approach-and-interact", actorId: npc.id, targetId: lantern.id },
      () => {
        lifecycleCalls += 1;
        harness.disarm();
      }
    );

    expect(manual.started).toBe(true);
    expect(lifecycleCalls).toBe(1);
    expect(harness.state()).toMatchObject({ armed: false, requestStatus: "disarmed" });
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: 1, cause: { kind: "manual" } }
    });

    pending.resolve(fetchEnvelope(1, mug.id, "late-e1-model"));
    await oldCycle;

    expect(harness.state()).toMatchObject({
      armed: false,
      requestStatus: "disarmed",
      decisionKind: null,
      model: null,
      gatewayLogId: null
    });
    expect(executor.state()).toMatchObject({
      status: "running",
      task: { targetId: lantern.id },
      run: { runId: 1, cause: { kind: "manual" } }
    });

    const manualFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(manualFrame.executorActionRun).toEqual({ runId: 1, cause: { kind: "manual" } });
    expect(manualFrame.executorActionResult).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      actorId: npc.id,
      targetId: lantern.id
    });
  });

  it("rejects manual takeover while a real correlated cognition run owns the executor without disarming E1", async () => {
    const { world, executor, driver, player, npc, mug, lantern } = e1Fixture();
    const harness = new E1AgentHarness(world, executor, async (request) =>
      fetchEnvelope(request.cycleId, mug.id)
    );

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const cognition = harness.afterExecutionStep(dropFrame, 1000);
    expect(cognition).not.toBeNull();
    await cognition;

    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: 1, cause: { kind: "cognition", sessionId: 1, cycleId: 1 } }
    });
    expect(harness.state().armed).toBe(true);

    let lifecycleCalls = 0;
    const manual = startManualExecutorTask(
      executor,
      { kind: "approach-and-interact", actorId: npc.id, targetId: lantern.id },
      () => {
        lifecycleCalls += 1;
        harness.disarm();
      }
    );

    expect(manual.started).toBe(false);
    expect(lifecycleCalls).toBe(0);
    expect(harness.state().armed).toBe(true);
    expect(executor.state()).toMatchObject({
      status: "running",
      task: { targetId: mug.id },
      run: { runId: 1, cause: { kind: "cognition", sessionId: 1, cycleId: 1 } }
    });
  });

  it("records unsupported player-to-NPC interaction as a player rejection without inventing a semantic World event", () => {
    const specimen = createP1Specimen();
    specimen.blockers = [];
    specimen.placementSites = [];
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
      throw new Error("Invalid R8 actor-interaction fixture.");
    }

    player.position = { x: 700, y: 390 };
    npc.position = { x: 730, y: 390 };
    player.heldItemId = null;
    npc.heldItemId = null;
    for (const entity of specimen.entities) {
      if (entity.kind === "item") {
        entity.position = { x: 120, y: 120 };
        entity.heldBy = null;
      }
    }

    const world = new World(specimen);
    const driver = new ExecutionDriver(world, new DeterministicExecutor());
    const eventsBefore = world.recentEvents(128);

    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id, targetId: npc.id }]
    });

    expect(frame.executorActionResult).toBeNull();
    expect(frame.executorActionRun).toBeNull();
    expect(frame.playerActionResults).toEqual([
      expect.objectContaining({
        status: "rejected",
        code: "target_not_interactable",
        actorId: player.id,
        targetId: npc.id
      })
    ]);
    expect(driver.recentActionAttempts()).toEqual([
      expect.objectContaining({
        source: "player",
        status: "rejected",
        code: "target_not_interactable",
        actorId: player.id,
        targetId: npc.id,
        executorRun: undefined
      })
    ]);
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });
});
