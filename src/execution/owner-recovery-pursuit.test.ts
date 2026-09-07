import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";
import { ExecutionDriver } from "./execution-driver";

function entityPosition(world: World, id: string) {
  const entity = world.snapshot().entities.find((entry) => entry.id === id);
  if (!entity) throw new Error(`Missing entity ${id}`);
  return entity.position;
}

describe("Owner recovery — moving held target pursuit", () => {
  it("keeps a fetch task alive and follows a player carrying the target while the target remains spatially out of interaction range", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entry) => entry.id === "player.jozz");
    const npc = specimen.entities.find((entry) => entry.id === "npc.001");
    const lantern = specimen.entities.find((entry) => entry.id === "item.lantern");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Missing recovery fixture entities");
    }

    player.position = { x: 760, y: 390 };
    npc.position = { x: 420, y: 390 };
    player.heldItemId = lantern.id;
    lantern.heldBy = player.id;
    lantern.position = { ...player.position };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);

    expect(executor.start({
      kind: "approach-and-interact",
      actorId: npc.id,
      targetId: lantern.id
    })).toBe(true);

    const npcStartX = entityPosition(world, npc.id).x;
    const playerStartX = entityPosition(world, player.id).x;

    for (let frame = 0; frame < 12; frame += 1) {
      driver.step({ playerControl: { moveX: 1, moveY: 0 } });
      expect(executor.state().status).toBe("running");
    }

    const npcEndX = entityPosition(world, npc.id).x;
    const playerEndX = entityPosition(world, player.id).x;

    expect(npcEndX).toBeGreaterThan(npcStartX);
    expect(playerEndX).toBeGreaterThan(playerStartX);
    expect(executor.state()).toMatchObject({
      status: "running",
      task: {
        kind: "approach-and-interact",
        actorId: npc.id,
        targetId: lantern.id
      },
      failureCode: null
    });
  });
});
