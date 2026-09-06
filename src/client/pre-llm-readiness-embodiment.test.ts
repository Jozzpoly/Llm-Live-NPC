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
  it("shows that a visible held item can reveal the ID of an actor that failed the visibility gate", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing relational-visibility fixture.");
    }

    npc.position = { x: 760, y: 390 };
    player.position = { x: 810, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 810, y: 364 };

    const snapshot = new World(specimen).snapshot();
    const perception = projectE1Perception(
      snapshot,
      npc.id,
      (_start, end) => !(end.x === player.position.x && end.y === player.position.y)
    );

    expect(perception.visibleEntities.some((entity) => entity.id === player.id)).toBe(false);
    expect(perception.visibleEntities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
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
});
