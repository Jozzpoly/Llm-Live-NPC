import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { E1DecisionEnvelope } from "./e1-agent-api";
import { E1AgentHarness } from "./e1-agent-harness";

function rejectedDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

describe("pre-LLM lifecycle and semantic characterization", () => {
  it("shows that a rejected request from an old arm session can contaminate a fresh armed session", async () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing readiness-audit rejection fixture.");
    }

    npc.position = { x: 760, y: 390 };
    player.position = { x: 680, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 680, y: 364 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    const pending = rejectedDeferred<E1DecisionEnvelope>();
    const harness = new E1AgentHarness(world, executor, () => pending.promise);

    harness.arm();
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const oldRun = harness.afterExecutionStep(frame, 1000);
    expect(oldRun).not.toBeNull();
    expect(harness.state().requestStatus).toBe("in_flight");

    harness.disarm();
    harness.arm();
    expect(harness.state()).toMatchObject({ armed: true, inFlight: false, requestStatus: "armed" });

    pending.reject(new Error("old-session-network-failure"));
    await oldRun!;

    // The old rejection is written into the new session because the catch path
    // only suppresses stale failures while the gate is disarmed.
    expect(harness.state()).toMatchObject({
      armed: true,
      inFlight: false,
      requestStatus: "request_error",
      decisionValidation: "old-session-network-failure"
    });
  });

  it("shows that a transport failure consumes the triggering perception change instead of retrying it", async () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing transport-failure stimulus fixture.");
    }

    npc.position = { x: 760, y: 390 };
    player.position = { x: 680, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 680, y: 364 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    let providerCalls = 0;
    const harness = new E1AgentHarness(world, executor, async () => {
      providerCalls += 1;
      throw new Error("synthetic-transport-failure");
    });

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const failedRun = harness.afterExecutionStep(dropFrame, 1000);
    expect(failedRun).not.toBeNull();
    await failedRun!;

    expect(providerCalls).toBe(1);
    expect(harness.state()).toMatchObject({
      requestStatus: "request_error",
      cyclesUsed: 1,
      inFlight: false,
      decisionValidation: "synthetic-transport-failure"
    });

    // The world remains in the same dropped-item state. The gate already moved
    // its wake fingerprint to that state before the provider failed, so later
    // frames do not re-emit the lost stimulus or retry cognition.
    const laterFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(harness.afterExecutionStep(laterFrame, 5000)).toBeNull();
    expect(providerCalls).toBe(1);
    expect(harness.state()).toMatchObject({ requestStatus: "request_error", cyclesUsed: 1 });
  });

  it("shows that current singular location identity depends on authored array order when zones overlap", () => {
    const first = createP1Specimen();
    const player = first.entities.find((entity) => entity.id === "player.jozz");
    if (!player || player.kind !== "player") throw new Error("Missing player location fixture.");

    // This point lies inside both the authored Cottage and Common Yard zones.
    player.position = { x: 440, y: 560 };
    const cottage = first.locations.find((location) => location.id === "cottage");
    const yard = first.locations.find((location) => location.id === "yard");
    if (!cottage || !yard) throw new Error("Missing overlap location fixtures.");

    expect(440).toBeGreaterThanOrEqual(cottage.bounds.x);
    expect(440).toBeLessThanOrEqual(cottage.bounds.x + cottage.bounds.width);
    expect(560).toBeGreaterThanOrEqual(cottage.bounds.y);
    expect(560).toBeLessThanOrEqual(cottage.bounds.y + cottage.bounds.height);
    expect(440).toBeGreaterThanOrEqual(yard.bounds.x);
    expect(440).toBeLessThanOrEqual(yard.bounds.x + yard.bounds.width);
    expect(560).toBeGreaterThanOrEqual(yard.bounds.y);
    expect(560).toBeLessThanOrEqual(yard.bounds.y + yard.bounds.height);

    expect(new World(first).playerLocationId).toBe("cottage");

    const reordered = createP1Specimen();
    const reorderedPlayer = reordered.entities.find((entity) => entity.id === "player.jozz");
    if (!reorderedPlayer || reorderedPlayer.kind !== "player") throw new Error("Missing reordered player fixture.");
    reorderedPlayer.position = { x: 440, y: 560 };
    reordered.locations.sort((a, b) => {
      if (a.id === "yard") return -1;
      if (b.id === "yard") return 1;
      return 0;
    });

    expect(new World(reordered).playerLocationId).toBe("yard");
  });
});