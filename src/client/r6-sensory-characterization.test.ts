import { describe, expect, it } from "vitest";
import { projectE1Perception } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { WorldSnapshot } from "../world/types";
import { E1AgentHarness } from "./e1-agent-harness";

function directionFixture(facing: { x: number; y: number }): WorldSnapshot {
  return {
    tick: 1,
    width: 1000,
    height: 1000,
    entities: [
      {
        id: "npc.001",
        kind: "npc",
        label: "NPC-001",
        position: { x: 400, y: 400 },
        radius: 16,
        heldItemId: null,
        facing
      },
      {
        id: "item.mug",
        kind: "item",
        label: "Mug",
        position: { x: 500, y: 400 },
        radius: 9,
        heldBy: null
      }
    ],
    blockers: [],
    locations: [],
    placementSites: [],
    playerLocationId: null
  };
}

describe("R6 sensory-foundation characterization", () => {
  it("shows that current perceived direction is world-space and does not change when the observer rotates", () => {
    const facingEast = projectE1Perception(directionFixture({ x: 1, y: 0 }), "npc.001", () => true);
    const facingNorth = projectE1Perception(directionFixture({ x: 0, y: -1 }), "npc.001", () => true);

    const eastDirection = facingEast.visibleEntities.find((entity) => entity.id === "item.mug")?.direction;
    const northDirection = facingNorth.visibleEntities.find((entity) => entity.id === "item.mug")?.direction;

    expect(eastDirection).toEqual({ x: 1, y: 0 });
    expect(northDirection).toEqual({ x: 1, y: 0 });
    expect(northDirection).toEqual(eastDirection);
  });

  it("shows that R3b canonical held-item locality closes the old visible-item / invisible-holder relation leak", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing R6 relation fixture.");
    }

    npc.position = { x: 600, y: 400 };
    player.position = { x: 800, y: 400 };
    mug.position = { x: 800, y: 400 };
    const world = new World(specimen);

    expect(world.attemptAction({ action: "interact", actorId: player.id, targetId: mug.id })).toMatchObject({
      status: "succeeded",
      code: "picked_up_item"
    });

    const near = projectE1Perception(world.snapshot(), npc.id, (start, end) => world.hasLineOfSight(start, end));
    expect(near.visibleEntities.find((entity) => entity.id === mug.id)).toMatchObject({ heldBy: player.id });
    expect(near.visibleEntities.some((entity) => entity.id === player.id)).toBe(true);

    for (let step = 0; step < 5; step += 1) world.step({ moveX: 1, moveY: 0 });

    const farSnapshot = world.snapshot();
    const farPlayer = farSnapshot.entities.find((entity) => entity.id === player.id);
    const farMug = farSnapshot.entities.find((entity) => entity.id === mug.id);
    expect(farPlayer?.position).toEqual(farMug?.position);

    const far = projectE1Perception(farSnapshot, npc.id, (start, end) => world.hasLineOfSight(start, end));
    expect(far.visibleEntities.some((entity) => entity.id === player.id)).toBe(false);
    expect(far.visibleEntities.some((entity) => entity.id === mug.id)).toBe(false);
  });

  it("shows that real same-tick drop/pickup events can still disappear from sampled E1 temporal perception", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing R6 transient fixture.");
    }

    npc.position = { x: 760, y: 390 };
    player.position = { x: 680, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { ...player.position };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    let providerCalls = 0;
    const harness = new E1AgentHarness(world, executor, async (request) => {
      providerCalls += 1;
      return {
        cycleId: request.cycleId,
        decision: { kind: "wait" },
        model: "unexpected-r6-call",
        gatewayLogId: null,
        latencyMs: 0
      };
    });

    harness.arm();
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: player.id },
        { action: "interact", actorId: player.id }
      ]
    });

    expect(frame.playerActionResults.map((result) => result.code)).toEqual(["dropped_item", "picked_up_item"]);
    expect(
      world.recentEvents(128).filter((event) => event.entityId === mug.id).map((event) => event.type)
    ).toEqual(["item.dropped", "item.picked_up"]);

    expect(harness.afterExecutionStep(frame, 1000)).toBeNull();
    expect(providerCalls).toBe(0);
    expect(harness.state()).toMatchObject({ cyclesUsed: 0, observedChanges: [] });
  });
});
