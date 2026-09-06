import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

function actorPosition(world: World, id: string) {
  const entity = world.snapshot().entities.find((entry) => entry.id === id);
  if (!entity || (entity.kind !== "player" && entity.kind !== "npc")) {
    throw new Error(`Missing actor ${id}`);
  }
  return entity.position;
}

describe("pre-LLM dynamic executor task-validity characterization", () => {
  it("shows that a stale fetch pursues an item held by another actor before eventually failing", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Missing stale-task pursuit fixture.");
    }

    player.position = { x: 1015, y: 670 };
    npc.position = { x: 1105, y: 670 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    executor.start({ kind: "approach-and-interact", actorId: npc.id, targetId: lantern.id });

    driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: player.id, targetId: lantern.id }]
    });
    expect(executor.state().status).toBe("running");
    const before = actorPosition(world, npc.id);

    let frames = 0;
    while (executor.state().status === "running" && frames < 60) {
      driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      frames += 1;
    }

    const after = actorPosition(world, npc.id);
    expect(after.x).toBeLessThan(before.x);
    expect(frames).toBeGreaterThan(0);
    expect(executor.state()).toMatchObject({ status: "failed", failureCode: "target_unavailable" });
    expect(world.snapshot().entities.find((entity) => entity.id === lantern.id)).toMatchObject({ heldBy: player.id });
  });
});