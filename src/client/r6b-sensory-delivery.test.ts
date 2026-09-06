import { describe, expect, it } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { E1DecisionEnvelope } from "./e1-agent-api";
import { E1AgentHarness } from "./e1-agent-harness";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fixture() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
    throw new Error("Missing R6b2 sensory-delivery fixture.");
  }

  npc.position = { x: 760, y: 390 };
  player.position = { x: 680, y: 390 };
  player.heldItemId = mug.id;
  mug.heldBy = player.id;
  mug.position = { ...player.position };

  const world = new World(specimen);
  const executor = new DeterministicExecutor();
  const driver = new ExecutionDriver(world, executor);
  return { world, executor, driver, npc, player, mug };
}

function waitEnvelope(request: E1CycleRequest): E1DecisionEnvelope {
  return {
    cycleId: request.cycleId,
    decision: { kind: "wait" },
    model: "r6b2-test-model",
    gatewayLogId: null,
    latencyMs: 0
  };
}

describe("R6b2 bounded sensory delivery", () => {
  it("wakes on same-frame transient drop -> pickup and preserves both event-time holder transitions", async () => {
    const { world, executor, driver, player, mug } = fixture();
    const requests: E1CycleRequest[] = [];
    const harness = new E1AgentHarness(world, executor, async (request) => {
      requests.push(structuredClone(request));
      return waitEnvelope(request);
    });

    harness.arm();
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: player.id },
        { action: "interact", actorId: player.id }
      ]
    });

    const run = harness.afterExecutionStep(frame, 1000);
    expect(run).not.toBeNull();
    await run!;

    expect(requests).toHaveLength(1);
    expect(requests[0]!.observedChanges).toEqual([
      {
        kind: "item_holder_changed",
        itemId: mug.id,
        previousHolderId: player.id,
        holderId: null
      },
      {
        kind: "item_holder_changed",
        itemId: mug.id,
        previousHolderId: null,
        holderId: player.id
      }
    ]);
    expect(requests[0]!.observedChangesDropped).toBe(0);
    expect(requests[0]!.perception.fetchableItemIds).toEqual([]);
    expect(harness.state()).toMatchObject({
      cyclesUsed: 1,
      requestStatus: "accepted_wait",
      pendingSensoryChanges: 0,
      pendingSensoryChangesDropped: 0
    });
  });

  it("deduplicates a normal sampled drop transition against the identical event-time transition", async () => {
    const { world, executor, driver, player, mug } = fixture();
    const requests: E1CycleRequest[] = [];
    const harness = new E1AgentHarness(world, executor, async (request) => {
      requests.push(structuredClone(request));
      return waitEnvelope(request);
    });

    harness.arm();
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const run = harness.afterExecutionStep(frame, 1000);
    expect(run).not.toBeNull();
    await run!;

    expect(requests[0]!.observedChanges).toEqual([
      {
        kind: "item_holder_changed",
        itemId: mug.id,
        previousHolderId: player.id,
        holderId: null
      }
    ]);
    expect(requests[0]!.observedChangesDropped).toBe(0);
  });

  it("buffers local semantic changes while cognition is in flight and reports bounded overflow explicitly", async () => {
    const { world, executor, driver, player } = fixture();
    const requests: E1CycleRequest[] = [];
    const firstResponse = deferred<E1DecisionEnvelope>();
    let providerCall = 0;
    const harness = new E1AgentHarness(world, executor, async (request) => {
      requests.push(structuredClone(request));
      providerCall += 1;
      if (providerCall === 1) return firstResponse.promise;
      return waitEnvelope(request);
    });

    harness.arm();
    const firstFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const firstRun = harness.afterExecutionStep(firstFrame, 1000);
    expect(firstRun).not.toBeNull();
    expect(harness.state().inFlight).toBe(true);

    for (let index = 0; index < 35; index += 1) {
      const action =
        index % 2 === 0
          ? ({ action: "interact", actorId: player.id } as const)
          : ({ action: "drop", actorId: player.id } as const);
      const frame = driver.step({
        playerControl: { moveX: 0, moveY: 0 },
        playerActions: [action]
      });
      expect(harness.afterExecutionStep(frame, 1100 + index)).toBeNull();
    }

    expect(harness.state()).toMatchObject({
      inFlight: true,
      pendingSensoryChanges: 32,
      pendingSensoryChangesDropped: 3
    });

    firstResponse.resolve(waitEnvelope(requests[0]!));
    await firstRun!;

    const laterFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    const secondRun = harness.afterExecutionStep(laterFrame, 5000);
    expect(secondRun).not.toBeNull();
    await secondRun!;

    expect(requests).toHaveLength(2);
    expect(requests[1]!.observedChanges).toHaveLength(32);
    expect(requests[1]!.observedChangesDropped).toBe(3);
    expect(harness.state()).toMatchObject({
      pendingSensoryChanges: 0,
      pendingSensoryChangesDropped: 0,
      observedChangesDropped: 3
    });
  });

  it("keeps a semantic event pending through cooldown and delivers it on the first eligible later frame", async () => {
    const { world, executor, driver, player, mug } = fixture();
    const requests: E1CycleRequest[] = [];
    const harness = new E1AgentHarness(world, executor, async (request) => {
      requests.push(structuredClone(request));
      return waitEnvelope(request);
    });

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    await harness.afterExecutionStep(dropFrame, 1000)!;

    const pickupFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id }]
    });
    expect(harness.afterExecutionStep(pickupFrame, 1100)).toBeNull();
    expect(harness.state()).toMatchObject({ pendingSensoryChanges: 1 });

    const eligibleFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    const secondRun = harness.afterExecutionStep(eligibleFrame, 1800);
    expect(secondRun).not.toBeNull();
    await secondRun!;

    expect(requests).toHaveLength(2);
    expect(requests[1]!.observedChanges).toEqual([
      {
        kind: "item_holder_changed",
        itemId: mug.id,
        previousHolderId: null,
        holderId: player.id
      }
    ]);
  });

  it("clears pending sensory history when an arm session is explicitly replaced", async () => {
    const { world, executor, driver, player } = fixture();
    const requests: E1CycleRequest[] = [];
    const harness = new E1AgentHarness(world, executor, async (request) => {
      requests.push(structuredClone(request));
      return waitEnvelope(request);
    });

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    await harness.afterExecutionStep(dropFrame, 1000)!;

    const pickupFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id }]
    });
    expect(harness.afterExecutionStep(pickupFrame, 1100)).toBeNull();
    expect(harness.state().pendingSensoryChanges).toBe(1);

    harness.disarm();
    expect(harness.state()).toMatchObject({
      armed: false,
      pendingSensoryChanges: 0,
      pendingSensoryChangesDropped: 0
    });
    harness.arm();

    const quietFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(harness.afterExecutionStep(quietFrame, 2000)).toBeNull();
    expect(requests).toHaveLength(1);
  });
});
