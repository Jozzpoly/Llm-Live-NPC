import { describe, expect, it } from "vitest";
import {
  createFiveResidentRegionComposition,
  FIVE_RESIDENT_MATERIAL_OBJECTS,
  FIVE_RESIDENT_PRE_LUNA_WORKSHOP_MATERIAL_OBJECTS,
} from "./five-resident-region";

const PLAYER = "player.workshop-tester";
const SPARE = "crate.workshop.spare";
const TIMBER = "crate.workshop.timber";

describe("pre-Luna workshop: physical choices, not decorative props or scripted jobs", () => {
  it("preserves canonical R6 while composing four real manipulable, non-overlapping objects in workshop-only mode", () => {
    const standard = createFiveResidentRegionComposition();
    const optIn = createFiveResidentRegionComposition({ materialBodyCollision: true });
    expect(standard.world.materialObjects()).toEqual(FIVE_RESIDENT_MATERIAL_OBJECTS);
    expect(optIn.world.materialObjects()).toHaveLength(4);
    expect(optIn.world.materialObjects().map((o) => o.id).sort()).toEqual([
      ...FIVE_RESIDENT_MATERIAL_OBJECTS,
      ...FIVE_RESIDENT_PRE_LUNA_WORKSHOP_MATERIAL_OBJECTS,
    ].map((o) => o.id).sort());

    const free = optIn.world.materialObjects();
    for (let i = 0; i < free.length; i++) {
      const object = free[i]!;
      if (object.location.kind !== "free") throw new Error("workshop initial object must be physical and free");
      for (const other of free.slice(i + 1)) {
        if (other.location.kind !== "free") throw new Error("workshop other object must be free");
        const distance = Math.hypot(
          object.location.position.x - other.location.position.x,
          object.location.position.y - other.location.position.y,
        );
        expect(distance).toBeGreaterThan(object.radius + other.radius + 8);
      }
      for (const actor of optIn.world.publicSnapshot().actors) {
        const distance = Math.hypot(
          object.location.position.x - actor.position.x,
          object.location.position.y - actor.position.y,
        );
        expect(distance).toBeGreaterThan(object.radius + 18 + 2);
      }
    }
    // Workshop extra objects do NOT teach Janek new purposes or knowledge;
    // his sole existing material identity is the canonical original crate.
    expect(optIn.runtimes["resident.janek"].publicState().activity.kind).toBe("idle");
    expect(optIn.world.options.materialBodyCollision).toBe(true);
    expect(standard.world.options.materialBodyCollision).toBeUndefined();
  });

  it("lets the player build and reopen an actual obstruction, with real multi-object occupancy veto", () => {
    const world = createFiveResidentRegionComposition({ materialBodyCollision: true }).world;
    world.addPlayer(PLAYER, { x: 2_010, y: 850 });

    // The same World admits exactly one carried item. Trying to place into
    // the real timber parcel must fail, not replace or teleport either item.
    expect(world.attemptMaterialAction(PLAYER, { kind: "pickup", objectId: SPARE }))
      .toMatchObject({ status: "succeeded", code: "picked_up" });
    expect(world.attemptMaterialAction(PLAYER, { kind: "pickup", objectId: TIMBER }))
      .toMatchObject({ status: "rejected", code: "actor_already_holding" });
    expect(world.attemptMaterialAction(PLAYER, {
      kind: "place", objectId: SPARE, position: { x: 2_055, y: 825 },
    })).toMatchObject({ status: "rejected", code: "object_occupied" });
    expect(world.materialObject(SPARE)?.location).toEqual({
      kind: "held", actorId: PLAYER,
    });
    expect(world.materialObject(TIMBER)?.location).toEqual({
      kind: "free", position: { x: 2_055, y: 825 },
    });

    const y = () => world.publicSnapshot().actors.find((actor) => actor.id === PLAYER)!.position.y;
    world.setActorMotionIntent(PLAYER, { x: 0, y: -150 });
    for (let i = 0; i < 20; i++) world.step();
    world.setActorMotionIntent(PLAYER, { x: 0, y: 0 });
    expect(y()).toBeCloseTo(816, 4); // actual 0.68 carrying burden

    const newBlocker = { x: 2_002, y: 770 };
    expect(world.attemptMaterialAction(PLAYER, {
      kind: "place", objectId: SPARE, position: newBlocker,
    })).toMatchObject({ status: "succeeded", code: "placed" });
    world.setActorMotionIntent(PLAYER, { x: 0, y: -150 });
    for (let i = 0; i < 30; i++) world.step();
    const stopped = y();
    expect(stopped).toBeGreaterThan(800);
    expect(stopped).toBeLessThan(816);
    expect(world.diagnostics().lastMotionOutcomes.find((o) => o.actorId === PLAYER)?.constraints)
      .toContain("material_object");

    expect(world.attemptMaterialAction(PLAYER, { kind: "pickup", objectId: SPARE }))
      .toMatchObject({ status: "succeeded", code: "picked_up" });
    for (let i = 0; i < 30; i++) world.step();
    expect(y()).toBeLessThan(775);
    expect(world.diagnostics().lastMotionOutcomes.find((o) => o.actorId === PLAYER)?.constraints)
      .not.toContain("material_object");
    expect(world.materialObject(SPARE)?.location.kind).toBe("held");
    expect(world.materialObject(TIMBER)?.location.kind).toBe("free");
  });
});
