import { describe, expect, it } from "vitest";
import { E1CognitionGate, type E1Perception } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { E1DecisionEnvelope } from "./e1-agent-api";
import { E1AgentHarness } from "./e1-agent-harness";

function makePerception(fetchableItemIds: string[], tick = 1): E1Perception {
  return {
    tick,
    observer: {
      id: "npc.001",
      label: "NPC-001",
      locationId: "yard",
      locationLabel: "Common Yard",
      heldItemId: null
    },
    visibleEntities: fetchableItemIds.map((id, index) => ({
      id,
      kind: "item" as const,
      label: id,
      distance: 20 + index,
      direction: { x: 1, y: 0 },
      heldBy: null
    })),
    fetchableItemIds: [...fetchableItemIds]
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("pre-LLM readiness characterization", () => {
  it("shows that cycle IDs are reused across arm sessions, so an old completion can match a fresh pending cycle", () => {
    const gate = new E1CognitionGate(3, 0);
    const baseline = makePerception([], 1);
    const oldChange = makePerception(["item.mug"], 2);
    const freshChange = makePerception(["item.hammer"], 3);

    gate.arm(baseline, null);
    const oldCycle = gate.consider(oldChange, null, false, 1000);
    expect(oldCycle?.cycleId).toBe(1);

    gate.disarm();
    gate.arm(baseline, null);
    const freshCycle = gate.consider(freshChange, null, false, 2000);
    expect(freshCycle?.cycleId).toBe(1);
    expect(gate.state()).toMatchObject({ inFlight: true, pendingCycleId: 1 });

    // Characterization of the ABA gap: finish() has no session identity, so the
    // stale session-A cycle ID is accepted as the pending session-B cycle ID.
    expect(gate.finish(oldCycle!.cycleId)).toBe(true);
    expect(gate.state()).toMatchObject({ inFlight: false, pendingCycleId: null });
  });

  it("shows end-to-end that an old async E1 response can finish a fresh arm session and suppress its real response", async () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing readiness-audit E1 ABA fixture.");
    }

    npc.position = { x: 760, y: 390 };
    player.position = { x: 680, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 680, y: 364 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
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
    expect(harness.state()).toMatchObject({ inFlight: true, cycleId: 1 });

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
    expect(harness.state()).toMatchObject({ inFlight: true, cycleId: 1 });

    // Session A resolves after session B already owns pending cycle #1.
    pending[0]!.resolve({
      cycleId: 1,
      decision: { kind: "wait" },
      model: "old-session-model",
      gatewayLogId: "old-session-log",
      latencyMs: 900
    });
    await oldRun!;

    expect(harness.state()).toMatchObject({
      inFlight: false,
      requestStatus: "accepted_wait",
      model: "old-session-model",
      gatewayLogId: "old-session-log"
    });

    // The actual session-B response now finds no matching in-flight cycle and is
    // silently ignored; the stale session-A provenance remains visible.
    pending[1]!.resolve({
      cycleId: 1,
      decision: { kind: "wait" },
      model: "fresh-session-model",
      gatewayLogId: "fresh-session-log",
      latencyMs: 10
    });
    await freshRun!;
    expect(harness.state()).toMatchObject({
      inFlight: false,
      requestStatus: "accepted_wait",
      model: "old-session-model",
      gatewayLogId: "old-session-log"
    });
  });

  it("shows that a transient perception change can disappear completely while cognition is in flight", () => {
    const gate = new E1CognitionGate(3, 0);
    const baseline = makePerception([], 1);
    const requestedState = makePerception(["item.mug"], 2);
    const transientState = makePerception(["item.hammer"], 3);

    gate.arm(baseline, null);
    const cycle = gate.consider(requestedState, null, false, 1000);
    expect(cycle).not.toBeNull();

    // The transient state is visible to consider(), but the gate refuses a new
    // cycle while in flight and does not journal the observation.
    expect(gate.consider(transientState, null, false, 1100)).toBeNull();
    expect(gate.finish(cycle!.cycleId)).toBe(true);

    // By the time cognition is available again the world returned to the state
    // that initiated the request, so no later cycle can reveal the transient.
    expect(gate.consider(requestedState, null, false, 2000)).toBeNull();
  });

  it("shows that location lifecycle is player-only even when NPC-001 crosses into another authored location", () => {
    const world = new World(createP1Specimen());

    for (let step = 0; step < 36; step += 1) {
      world.stepWithActorControls(
        { moveX: 0, moveY: 0 },
        [{ actorId: "npc.001", moveX: 0, moveY: -1 }]
      );
    }

    const npc = world.snapshot().entities.find((entity) => entity.id === "npc.001");
    expect(npc?.position.y).toBeLessThan(180);
    expect(world.recentEvents(128).filter((event) => event.actorId === "npc.001" && event.type.startsWith("location."))).toEqual([]);
    expect(world.snapshot().playerLocationId).toBe("yard");
  });

  it("shows that World construction currently accepts inconsistent actor/item ownership", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing readiness-audit inventory fixture.");
    }

    player.heldItemId = mug.id;
    mug.heldBy = null;

    const world = new World(specimen);
    const snapshot = world.snapshot();
    expect(snapshot.entities.find((entity) => entity.id === player.id)).toMatchObject({ heldItemId: mug.id });
    expect(snapshot.entities.find((entity) => entity.id === mug.id)).toMatchObject({ heldBy: null });
  });

  it("shows that NPC interaction is currently a placeholder success without a semantic World event", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
      throw new Error("Missing readiness-audit NPC interaction fixture.");
    }

    player.position = { x: 730, y: 390 };
    npc.position = { x: 760, y: 390 };
    const world = new World(specimen);
    const eventsBefore = world.recentEvents(128);

    const result = world.attemptAction({
      action: "interact",
      actorId: player.id,
      targetId: npc.id
    });

    expect(result).toMatchObject({
      status: "succeeded",
      code: "npc_interaction_requested",
      targetId: npc.id
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });

  it("shows that the same interaction contract is asymmetric: NPC-001 cannot interact with the player", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
      throw new Error("Missing readiness-audit actor interaction fixture.");
    }

    player.position = { x: 730, y: 390 };
    npc.position = { x: 760, y: 390 };
    const world = new World(specimen);

    expect(
      world.attemptAction({ action: "interact", actorId: npc.id, targetId: player.id })
    ).toMatchObject({
      status: "rejected",
      code: "target_not_interactable",
      actorId: npc.id,
      targetId: player.id
    });
  });

  it("shows that a durative fetch task keeps pursuing an item after the player takes ownership", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Missing readiness-audit executor invalidation fixture.");
    }

    player.position = { x: 1015, y: 670 };
    npc.position = { x: 1105, y: 670 };
    lantern.position = { x: 1060, y: 670 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    executor.start({ kind: "approach-and-interact", actorId: npc.id, targetId: lantern.id });

    const contestedFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id, targetId: lantern.id }]
    });

    expect(contestedFrame.playerActionResults[0]).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    expect(contestedFrame.executorActionResult).toMatchObject({ status: "rejected", code: "target_out_of_range" });
    expect(executor.state().status).toBe("running");
    expect(world.snapshot().entities.find((entity) => entity.id === lantern.id)).toMatchObject({ heldBy: player.id });

    const nextCommand = executor.next(world.snapshot());
    expect(nextCommand.control).toMatchObject({ actorId: npc.id });
    expect(nextCommand.action).toBeUndefined();
    expect(executor.state().status).toBe("running");
  });

  it("shows that malformed specimen numbers can poison canonical World state despite valid controls", () => {
    const specimen = createP1Specimen();
    specimen.actorSpeed = Number.NaN;
    const world = new World(specimen);

    world.step({ moveX: 1, moveY: 0 });
    const player = world.snapshot().entities.find((entity) => entity.id === "player.jozz");
    expect(player?.position.x).toBeNaN();
  });
});
