import { describe, expect, it } from "vitest";
import { MATERIAL_CARRY_SPEED_FACTOR, facingRelativePlacement, resolveMaterialBodyMotion } from "./material-body-contact";
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
    // The same crossing is slower because the body is carrying a real crate.
    expect(carrying.position.x - obstructed.position.x)
      .toBeCloseTo((65 * 150 / 60) * MATERIAL_CARRY_SPEED_FACTOR, 4);
    expect(carrying.position.x).toBeGreaterThan(2_020);
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

  it("physically constrains a real resident's authored walk and lets the same World route reopen when the crate is lifted", () => {
    const composition = createFiveResidentRegionComposition({
      materialBodyCollision: true,
      playerStart: { x: 2_008, y: 720 },
    });
    const world = composition.world;
    world.setResidentActivity("resident.janek", {
      id: "activity:janek:physical-topology-characterization",
      kind: "travel",
      targetActorId: null,
      targetPosition: { x: 2_080, y: 720 },
      text: null,
      speed: 95,
      reason: "research: actual World passage beside the workshop",
    });

    for (let i = 0; i < 100; i += 1) world.step();
    const before = world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek")!;
    expect(before.position.x).toBeLessThan(1_921);
    const blockedOutcome = world.diagnostics().lastMotionOutcomes
      .find((outcome) => outcome.actorId === "resident.janek");
    expect(blockedOutcome?.constraints).toContain("material_object");

    // A participant on the other side lifts the identical real object.
    expect(world.attemptMaterialAction(PLAYER, {
      kind: "pickup", objectId: CRATE,
    })).toMatchObject({ status: "succeeded", code: "picked_up" });
    for (let i = 0; i < 180; i += 1) world.step();
    const after = world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek")!;
    expect(after.position.x).toBeGreaterThan(1_952);
    expect(world.materialObject(CRATE)?.location).toMatchObject({
      kind: "held", actorId: PLAYER,
    });
  });

  it("uses an actor's real persistent facing for a directional World-validated drop", () => {
    const world = createFiveResidentRegionComposition({
      materialBodyCollision: true,
      playerStart: { x: 1_905, y: 700 },
    }).world;
    expect(world.attemptMaterialAction(PLAYER, {
      kind: "pickup", objectId: CRATE,
    }).status).toBe("succeeded");

    world.setActorMotionIntent(PLAYER, { x: -150, y: 0 });
    for (let tick = 0; tick < 12; tick += 1) world.step();
    world.setActorMotionIntent(PLAYER, { x: 0, y: 0 });
    world.step();
    const player = world.publicSnapshot().actors.find((actor) => actor.id === PLAYER)!;
    expect(player.facing.x).toBeCloseTo(-1);
    expect(player.velocity).toEqual({ x: 0, y: 0 });
    const placement = facingRelativePlacement(player.position, player.facing, 42);
    expect(placement.x).toBeLessThan(player.position.x - 41.9);
    expect(placement.y).toBeCloseTo(player.position.y);
    expect(facingRelativePlacement({ x: 12, y: 12 }, { x: 0, y: -7 }, 42))
      .toEqual({ x: 12, y: -30 });

    // UI proposes; the actual World retains control over whether the request
    // may be executed. No client-relative teleport or object mutation bypass.
    expect(world.attemptMaterialAction(PLAYER, {
      kind: "place", objectId: CRATE, position: placement,
    })).toMatchObject({ status: "succeeded", code: "placed" });
    expect(world.materialObject(CRATE)?.location).toMatchObject({
      kind: "free", position: placement,
    });
    world.setActorMotionIntent(PLAYER, { x: -150, y: 0 });
    for (let tick = 0; tick < 30; tick += 1) world.step();
    const obstructed = world.publicSnapshot().actors.find((actor) => actor.id === PLAYER)!;
    expect(obstructed.position.x).toBeGreaterThan(placement.x + 35.9);
  });

  it("applies the same burden to a resident's factual carried material in authored locomotion", () => {
    const make = (carrying: boolean) => {
      const composition = createFiveResidentRegionComposition({
        materialBodyCollision: true,
      });
      const world = composition.world;
      if (carrying) world.addMaterialObject({
        id: "crate.research.resident-held",
        label: "Supply crate (initially carried research circumstance)",
        radius: 14,
        location: { kind: "held", actorId: "resident.janek" },
      });
      // Authored motor stimulus, NOT a genuine Janek decision or fake job.
      world.setResidentActivity("resident.janek", {
        id: "activity.janek.test-northward-travel",
        kind: "travel",
        targetActorId: null,
        targetPosition: { x: 1_900, y: 570 },
        text: null,
        speed: 95,
        reason: "bounded physical carrying locomotion test",
      });
      return world;
    };
    const loaded = make(true), free = make(false);
    for (let i = 0; i < 45; i += 1) {
      loaded.step();
      free.step();
    }
    const y = (world: typeof loaded) => world.publicSnapshot().actors
      .find((actor) => actor.id === "resident.janek")!.position.y;
    expect(y(loaded)).toBeGreaterThan(y(free) + 15);
    const loadedMotion = loaded.diagnostics().lastMotionOutcomes
      .find((o) => o.actorId === "resident.janek");
    expect(loadedMotion?.constraints).toContain("material_load");
    expect(free.diagnostics().lastMotionOutcomes
      .find((o) => o.actorId === "resident.janek")?.constraints)
      .not.toContain("material_load");
    expect(loaded.materialObject("crate.research.resident-held")?.location)
      .toEqual({ kind: "held", actorId: "resident.janek" });
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

  it("makes a World-held object physically costly to carry, then restores normal pace when placed", () => {
    const loadedComposition = createFiveResidentRegionComposition({
      materialBodyCollision: true,
      playerStart: { x: 1_905, y: 700 },
    });
    const ordinaryComposition = createFiveResidentRegionComposition({
      materialBodyCollision: true,
      playerStart: { x: 1_905, y: 700 },
    });
    const laden = loadedComposition.world;
    const unladen = ordinaryComposition.world;
    const getX = (world: typeof laden) =>
      world.publicSnapshot().actors.find((actor) => actor.id === PLAYER)!.position.x;

    expect(laden.attemptMaterialAction(PLAYER, {
      kind: "pickup", objectId: CRATE,
    })).toMatchObject({ status: "succeeded", code: "picked_up" });
    for (const world of [laden, unladen]) {
      world.setActorMotionIntent(PLAYER, { x: -150, y: 0 });
      for (let tick = 0; tick < 60; tick += 1) world.step();
    }
    const loadedDistance = 1_905 - getX(laden);
    const unladenDistance = 1_905 - getX(unladen);
    expect(unladenDistance).toBeCloseTo(150, 4);
    expect(loadedDistance).toBeCloseTo(102, 4);
    expect(loadedDistance).toBeLessThan(unladenDistance);
    const carryingOutcome = laden.diagnostics().lastMotionOutcomes
      .find((outcome) => outcome.actorId === PLAYER)!;
    expect(carryingOutcome.constraints).toEqual(["material_load"]);
    expect(carryingOutcome.resolution).toBe("constrained");

    laden.setActorMotionIntent(PLAYER, { x: 0, y: 0 });
    laden.step();
    expect(laden.diagnostics().lastMotionOutcomes.find((o) => o.actorId === PLAYER)?.constraints)
      .toEqual([]);
    const atRest = laden.publicSnapshot().actors.find((a) => a.id === PLAYER)!.position;
    expect(laden.attemptMaterialAction(PLAYER, {
      kind: "place", objectId: CRATE,
      position: { x: atRest.x + 42, y: atRest.y },
    })).toMatchObject({ status: "succeeded", code: "placed" });

    const before = getX(laden);
    laden.setActorMotionIntent(PLAYER, { x: -150, y: 0 });
    for (let tick = 0; tick < 60; tick += 1) laden.step();
    expect(before - getX(laden)).toBeCloseTo(150, 4);
    expect(laden.diagnostics().lastMotionOutcomes.find((o) => o.actorId === PLAYER)?.constraints)
      .not.toContain("material_load");
    expect(laden.materialObject(CRATE)?.location).toMatchObject({ kind: "free" });

    // Under the original R6 defaults, carrying never silently changes movement.
    const canonical = createFiveResidentRegionComposition({
      playerStart: { x: 1_905, y: 700 },
    }).world;
    expect(canonical.attemptMaterialAction(PLAYER, {
      kind: "pickup", objectId: CRATE,
    }).status).toBe("succeeded");
    canonical.setActorMotionIntent(PLAYER, { x: -150, y: 0 });
    for (let tick = 0; tick < 60; tick += 1) canonical.step();
    expect(1_905 - getX(canonical)).toBeCloseTo(150, 4);
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
