import { describe, expect, it } from "vitest";
import {
  E1CognitionGate,
  projectE1Perception,
  type E1CycleRequest,
  type E1ObservedChange
} from "../agent/e1-grounding";
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

function fixture(executor = new DeterministicExecutor()) {
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

  it("keeps a local semantic event pending while the executor is busy and delivers it after bounded failure", async () => {
    const boundedExecutor = new DeterministicExecutor(1);
    const { world, executor, driver, player, mug } = fixture(boundedExecutor);
    const requests: E1CycleRequest[] = [];
    const harness = new E1AgentHarness(world, executor, async (request) => {
      requests.push(structuredClone(request));
      return waitEnvelope(request);
    });

    harness.arm();
    expect(
      executor.start({
        kind: "approach-and-interact",
        actorId: "npc.001",
        targetId: "item.hammer"
      })
    ).toBe(true);

    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    expect(executor.state().status).toBe("running");
    expect(harness.afterExecutionStep(dropFrame, 1000)).toBeNull();
    expect(harness.state()).toMatchObject({ pendingSensoryChanges: 1, cyclesUsed: 0 });

    const failedExecutorFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(executor.state()).toMatchObject({ status: "failed", failureCode: "step_budget_exhausted" });
    const run = harness.afterExecutionStep(failedExecutorFrame, 2000);
    expect(run).not.toBeNull();
    await run!;

    expect(requests).toHaveLength(1);
    expect(requests[0]!.observedChanges).toEqual([
      {
        kind: "item_holder_changed",
        itemId: mug.id,
        previousHolderId: player.id,
        holderId: null
      }
    ]);
    expect(harness.state()).toMatchObject({ pendingSensoryChanges: 0, cyclesUsed: 1 });
  });

  it("preserves a fresh sampled reconciliation fact when a full buffered event batch must overflow", () => {
    const { world } = fixture();
    const baseline = projectE1Perception(world.snapshot(), "npc.001", () => true);
    const current = structuredClone(baseline);
    current.observer.locationId = "probe.location.changed";
    current.observer.locationLabel = "Probe location";

    const buffered: E1ObservedChange[] = Array.from({ length: 32 }, (_, index) => ({
      kind: "item_holder_changed" as const,
      itemId: `item.buffered.${index}`,
      previousHolderId: index % 2 === 0 ? "player.jozz" : null,
      holderId: index % 2 === 0 ? null : "player.jozz"
    }));

    const gate = new E1CognitionGate(3, 0);
    gate.arm(baseline, null);
    const request = gate.consider(current, null, false, 1000, buffered, 0);
    expect(request).not.toBeNull();
    expect(request!.observedChanges).toHaveLength(32);
    expect(request!.observedChangesDropped).toBe(1);
    expect(request!.observedChanges).toContainEqual({
      kind: "observer_location_changed",
      previousLocationId: baseline.observer.locationId,
      locationId: "probe.location.changed"
    });
    expect(request!.observedChanges).not.toContainEqual(
      expect.objectContaining({ itemId: "item.buffered.0" })
    );
    expect(request!.observedChanges).toContainEqual(
      expect.objectContaining({ itemId: "item.buffered.1" })
    );
    expect(request!.observedChanges.at(-1)).toEqual({
      kind: "observer_location_changed",
      previousLocationId: baseline.observer.locationId,
      locationId: "probe.location.changed"
    });
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
