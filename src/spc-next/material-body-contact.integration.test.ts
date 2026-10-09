import { describe, expect, it } from "vitest";
import { resolveMaterialBodyMotion } from "./material-body-contact";
import { createFiveResidentRegionComposition } from "./five-resident-region";

const CRATE = "crate.workshop.01";
const PLAYER = "player.jozz";

describe("pre-Luna opt-in material topology: free crate is a World body obstruction", () => {
  it("sweeps high-speed motion, lets an actor move through after pickup, and obstructs again after placement", () => {
    const composition = createFiveResidentRegionComposition({
      materialBodyCollision: true,
      playerStart: { x: 1_850, y: 720 },
    });
    const world = composition.world;
    const actor = () => world.publicSnapshot().actors.find((item) => item.id === PLAYER)!;
    expect(world.options.materialBodyCollision).toBe(true);

    // One enormous movement impulse is deliberately adversarial; a fast
    // controller must not tunnel through solid free material.
    world.setActorMotionIntent(PLAYER, { x: 100_000, y: 0 });
    // Max speed is clamped to 150 by authoritative ActorWorldState.
    for (let i = 0; i < 50; i += 1) world.step();
    const obstructed = actor();
    expect(obstructed.position.x).toBeGreaterThan(1_900);
    expect(obstructed.position.x).toBeLessThan(1_920);
    const outcome = world.diagnostics().lastMotionOutcomes.find((entry) => entry.actorId === PLAYER)!;
    expect(outcome.constraints).toContain("material_object");
    expect(outcome.resolution).toBe("blocked");

    const pickedUp = world.attemptMaterialAction(PLAYER, { kind: "pickup", objectId: CRATE });
    expect(pickedUp).toMatchObject({ status: "succeeded", code: "picked_up" });
    expect(world.materialObject(CRATE)?.location).toEqual({ kind: "held", actorId: PLAYER });

    world.setActorMotionIntent(PLAYER, { x: 150, y: 0 });
    for (let i = 0; i < 65; i += 1) world.step();
    const carrying = actor();
    expect(carrying.position.x).toBeGreaterThan(2_055);
    expect(world.diagnostics().lastMotionOutcomes.find((entry) => entry.actorId === PLAYER)?.constraints)
      .not.toContain("material_object");

    const impossible = world.attemptMaterialAction(PLAYER, {
      kind: "place", objectId: CRATE, position: carrying.position,
    });
    expect(impossible).toMatchObject({ status: "rejected", code: "body_occupied" });
    expect(world.materialObject(CRATE)?.location).toEqual({ kind: "held", actorId: PLAYER });

    const moved = { x: carrying.position.x + 42, y: carrying.position.y };
    expect(world.attemptMaterialAction(PLAYER, {
      kind: "place", objectId: CRATE, position: moved,
    })).toMatchObject({ status: "succeeded", code: "placed" });
    expect(world.materialObject(CRATE)?.location).toEqual({ kind: "free", position: moved });

    world.setActorMotionIntent(PLAYER, { x: 150, y: 0 });
    for (let i = 0; i < 50; i += 1) world.step();
    expect(actor().position.x).toBeLessThan(moved.x - 35.9);
    expect(world.diagnostics().lastMotionOutcomes.find((entry) => entry.actorId === PLAYER)?.constraints)
      .toContain("material_object");
  });

  it("is absent from canonical R6 default World; no hidden semantic or physical upgrade", () => {
    const composition = createFiveResidentRegionComposition({ playerStart: { x: 1_850, y: 720 } });
    const world = composition.world;
    expect(world.options.materialBodyCollision).toBeUndefined();
    world.setActorMotionIntent(PLAYER, { x: 150, y: 0 });
    for (let i = 0; i < 100; i += 1) world.step();
    const player = world.publicSnapshot().actors.find((actor) => actor.id === PLAYER)!;
    expect(player.position.x).toBeGreaterThan(1_952);
    expect(world.materialObject(CRATE)?.location.kind).toBe("free");
    expect(world.diagnostics().lastMotionOutcomes.find((entry) => entry.actorId === PLAYER)?.constraints)
      .not.toContain("material_object");
  });

  it("does not tunnel through a free crate even with a high-speed World actor", () => {
    const obstacle = [{
      id: CRATE, label: "crate", radius: 18,
      location: { kind: "free" as const, position: { x: 200, y: 200 } },
    }];
    const solved = resolveMaterialBodyMotion({ x: 100, y: 200 }, { x: 500, y: 200 }, obstacle);
    expect(solved.blockedByObjectId).toBe(CRATE);
    expect(solved.position.x).toBeGreaterThan(160);
    expect(solved.position.x).toBeLessThan(165);
    expect(solved.position.y).toBe(200);
    const clear = resolveMaterialBodyMotion({ x: 100, y: 200 }, { x: 500, y: 200 }, [
      { ...obstacle[0]!, location: { kind: "held" as const, actorId: PLAYER } },
    ]);
    expect(clear.blockedByObjectId).toBeNull();
    expect(clear.position).toEqual({ x: 500, y: 200 });
  });
});
