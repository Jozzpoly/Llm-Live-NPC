import { describe, expect, it } from "vitest";
import { projectE1Perception } from "../agent/e1-grounding";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { WorldSnapshot } from "../world/types";
import { E1AgentHarness } from "./e1-agent-harness";

class CountingWorld extends World {
  snapshotCalls = 0;

  override snapshot(): WorldSnapshot {
    this.snapshotCalls += 1;
    return super.snapshot();
  }
}

describe("pre-LLM embodied substrate characterization", () => {
  it("shows that a visible held item can reveal the ID of its out-of-range holder", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing relational-visibility fixture.");
    }

    npc.position = { x: 760, y: 100 };
    player.position = { x: 760, y: 330 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    // Exact canonical held-item offset used by World: radius 16 + 10 px north.
    mug.position = { x: 760, y: 304 };

    const perception = projectE1Perception(new World(specimen).snapshot(), npc.id, () => true);

    expect(perception.visibleEntities.some((entity) => entity.id === player.id)).toBe(false);
    expect(perception.visibleEntities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      distance: 204,
      heldBy: player.id
    });
  });

  it("shows that a disarmed E1 harness still reprojects perception after every execution step", () => {
    const world = new CountingWorld(createP1Specimen());
    const executor = new DeterministicExecutor();
    let providerCalls = 0;
    const harness = new E1AgentHarness(world, executor, async () => {
      providerCalls += 1;
      throw new Error("Provider must not run while E1 is disarmed.");
    });

    const before = world.snapshotCalls;
    expect(
      harness.afterExecutionStep(
        { playerActionResults: [], executorActionResult: null },
        1000
      )
    ).toBeNull();

    expect(world.snapshotCalls).toBe(before + 1);
    expect(providerCalls).toBe(0);
    expect(harness.state()).toMatchObject({ armed: false, requestStatus: "disarmed" });
  });

  it("shows that player and NPC bodies can overlap because movement resolves only world blockers, not actors", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
      throw new Error("Missing actor-overlap fixture.");
    }

    player.position = { x: 600, y: 400 };
    npc.position = { x: 650, y: 400 };
    const world = new World(specimen);

    for (let step = 0; step < 2; step += 1) {
      world.stepWithActorControls(
        { moveX: 1, moveY: 0 },
        [{ actorId: npc.id, moveX: -1, moveY: 0 }]
      );
    }

    const snapshot = world.snapshot();
    const movedPlayer = snapshot.entities.find((entity) => entity.id === player.id);
    const movedNpc = snapshot.entities.find((entity) => entity.id === npc.id);
    if (!movedPlayer || movedPlayer.kind !== "player" || !movedNpc || movedNpc.kind !== "npc") {
      throw new Error("Missing moved actors.");
    }

    const distance = Math.hypot(
      movedPlayer.position.x - movedNpc.position.x,
      movedPlayer.position.y - movedNpc.position.y
    );
    expect(distance).toBeLessThan(movedPlayer.radius + movedNpc.radius);
  });

  it("shows that normal pickup plus legal movement can carry a canonical held item outside world bounds", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing held-item world-edge fixture.");
    }

    player.position = { x: 600, y: 60 };
    mug.position = { x: 600, y: 40 };
    const world = new World(specimen);

    expect(
      world.attemptAction({ action: "interact", actorId: player.id, targetId: mug.id })
    ).toMatchObject({ status: "succeeded", code: "picked_up_item" });

    for (let step = 0; step < 10; step += 1) world.step({ moveX: 0, moveY: -1 });

    const snapshot = world.snapshot();
    const movedPlayer = snapshot.entities.find((entity) => entity.id === player.id);
    const heldMug = snapshot.entities.find((entity) => entity.id === mug.id);
    if (!movedPlayer || movedPlayer.kind !== "player" || !heldMug || heldMug.kind !== "item") {
      throw new Error("Missing moved held-item fixture.");
    }

    expect(movedPlayer.position.y).toBe(player.radius);
    expect(heldMug.heldBy).toBe(player.id);
    expect(heldMug.position.y).toBe(-10);
    expect(heldMug.position.y - heldMug.radius).toBeLessThan(0);
    expect(world.validatePlacementTarget(mug.id, heldMug.position)).toMatchObject({
      status: "rejected",
      code: "outside_world"
    });
  });

  it("shows that normal held-item following can place canonical item geometry inside an authored blocker", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    const wall = specimen.blockers.find((blocker) => blocker.id === "workshop.bottom");
    if (!player || player.kind !== "player" || !lantern || lantern.kind !== "item" || !wall) {
      throw new Error("Missing held-item wall fixture.");
    }

    player.position = { x: 1100, y: 500 };
    lantern.position = { x: 1100, y: 480 };
    const world = new World(specimen);

    expect(
      world.attemptAction({ action: "interact", actorId: player.id, targetId: lantern.id })
    ).toMatchObject({ status: "succeeded", code: "picked_up_item" });

    for (let step = 0; step < 10; step += 1) world.step({ moveX: 0, moveY: -1 });

    const snapshot = world.snapshot();
    const movedPlayer = snapshot.entities.find((entity) => entity.id === player.id);
    const heldLantern = snapshot.entities.find((entity) => entity.id === lantern.id);
    if (!movedPlayer || movedPlayer.kind !== "player" || !heldLantern || heldLantern.kind !== "item") {
      throw new Error("Missing wall-adjacent held item.");
    }

    expect(movedPlayer.position.y).toBe(wall.bounds.y + wall.bounds.height + movedPlayer.radius);
    expect(heldLantern.position.y).toBeGreaterThan(wall.bounds.y);
    expect(heldLantern.position.y).toBeLessThan(wall.bounds.y + wall.bounds.height);
    expect(world.hasLineOfSight(movedPlayer.position, heldLantern.position)).toBe(false);
  });
});
