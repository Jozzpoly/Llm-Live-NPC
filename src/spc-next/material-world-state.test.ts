import { describe, expect, it } from "vitest";
import { MaterialWorldState, type MaterialObjectState } from "./material-world-state";

const bounds = { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 };

function crate(position = { x: 200, y: 200 }): MaterialObjectState {
  return {
    id: "crate.workshop.01",
    label: "Workshop crate",
    radius: 18,
    location: { kind: "free", position },
  };
}

function state(): MaterialWorldState {
  const state = new MaterialWorldState({ bounds, interactionRange: 64 });
  state.addObject(crate());
  return state;
}

describe("MaterialWorldState", () => {
  it("preserves one stable logical object identity across free -> held -> free transitions", () => {
    const world = state();
    const pickup = world.attempt({
      kind: "pickup",
      actorId: "resident.janek",
      objectId: "crate.workshop.01",
      actorPosition: { x: 180, y: 200 },
      lineOfSight: true,
    }, 10);

    expect(pickup).toMatchObject({
      status: "succeeded",
      code: "picked_up",
      objectId: "crate.workshop.01",
      before: { id: "crate.workshop.01", location: { kind: "free", position: { x: 200, y: 200 } } },
      after: { id: "crate.workshop.01", location: { kind: "held", actorId: "resident.janek" } },
    });
    expect(world.heldObjectId("resident.janek")).toBe("crate.workshop.01");

    const place = world.attempt({
      kind: "place",
      actorId: "resident.janek",
      objectId: "crate.workshop.01",
      actorPosition: { x: 400, y: 400 },
      position: { x: 430, y: 400 },
      lineOfSight: true,
    }, 20);

    expect(place).toMatchObject({
      status: "succeeded",
      code: "placed",
      objectId: "crate.workshop.01",
      before: { id: "crate.workshop.01", location: { kind: "held", actorId: "resident.janek" } },
      after: { id: "crate.workshop.01", location: { kind: "free", position: { x: 430, y: 400 } } },
    });
    expect(world.object("crate.workshop.01")?.id).toBe("crate.workshop.01");
    expect(world.heldObjectId("resident.janek")).toBeNull();
  });

  it("rejects pickup outside reach or line of sight without mutating material truth", () => {
    const world = state();
    const original = world.object("crate.workshop.01");

    const far = world.attempt({
      kind: "pickup",
      actorId: "resident.janek",
      objectId: "crate.workshop.01",
      actorPosition: { x: 20, y: 20 },
      lineOfSight: true,
    }, 1);
    expect(far.status).toBe("rejected");
    expect(far.code).toBe("out_of_range");
    expect(world.object("crate.workshop.01")).toEqual(original);

    const hidden = world.attempt({
      kind: "pickup",
      actorId: "resident.janek",
      objectId: "crate.workshop.01",
      actorPosition: { x: 190, y: 200 },
      lineOfSight: false,
    }, 2);
    expect(hidden.status).toBe("rejected");
    expect(hidden.code).toBe("occluded");
    expect(world.object("crate.workshop.01")).toEqual(original);
  });

  it("enforces one held material object per actor and exclusive possession", () => {
    const world = state();
    world.addObject({
      id: "crate.workshop.02",
      label: "Second crate",
      radius: 18,
      location: { kind: "free", position: { x: 220, y: 200 } },
    });

    expect(world.attempt({
      kind: "pickup",
      actorId: "resident.janek",
      objectId: "crate.workshop.01",
      actorPosition: { x: 200, y: 200 },
      lineOfSight: true,
    }, 1).status).toBe("succeeded");

    const secondPickup = world.attempt({
      kind: "pickup",
      actorId: "resident.janek",
      objectId: "crate.workshop.02",
      actorPosition: { x: 220, y: 200 },
      lineOfSight: true,
    }, 2);
    expect(secondPickup).toMatchObject({ status: "rejected", code: "actor_already_holding" });

    const theft = world.attempt({
      kind: "pickup",
      actorId: "player.jozz",
      objectId: "crate.workshop.01",
      actorPosition: { x: 200, y: 200 },
      lineOfSight: true,
    }, 3);
    expect(theft).toMatchObject({ status: "rejected", code: "object_unavailable" });
    expect(world.heldObjectId("resident.janek")).toBe("crate.workshop.01");
  });

  it("requires the exact holder and a legal nearby placement before releasing possession", () => {
    const world = state();
    world.attempt({
      kind: "pickup",
      actorId: "resident.janek",
      objectId: "crate.workshop.01",
      actorPosition: { x: 200, y: 200 },
      lineOfSight: true,
    }, 1);

    const wrongActor = world.attempt({
      kind: "place",
      actorId: "player.jozz",
      objectId: "crate.workshop.01",
      actorPosition: { x: 200, y: 200 },
      position: { x: 230, y: 200 },
      lineOfSight: true,
    }, 2);
    expect(wrongActor).toMatchObject({ status: "rejected", code: "actor_not_holder" });

    const tooFar = world.attempt({
      kind: "place",
      actorId: "resident.janek",
      objectId: "crate.workshop.01",
      actorPosition: { x: 500, y: 500 },
      position: { x: 700, y: 500 },
      lineOfSight: true,
    }, 3);
    expect(tooFar).toMatchObject({ status: "rejected", code: "out_of_range" });

    const outside = world.attempt({
      kind: "place",
      actorId: "resident.janek",
      objectId: "crate.workshop.01",
      actorPosition: { x: 10, y: 10 },
      position: { x: 5, y: 5 },
      lineOfSight: true,
    }, 4);
    expect(outside).toMatchObject({ status: "rejected", code: "outside_world" });
    expect(world.object("crate.workshop.01")?.location).toEqual({ kind: "held", actorId: "resident.janek" });
  });

  it("returns defensive object copies and rejects invalid authored state", () => {
    const world = state();
    const copy = world.object("crate.workshop.01")!;
    if (copy.location.kind === "free") copy.location.position.x = 999;
    expect(world.object("crate.workshop.01")?.location).toEqual({ kind: "free", position: { x: 200, y: 200 } });

    expect(() => world.addObject(crate({ x: 200, y: 200 }))).toThrow(/already exists/);
    expect(() => new MaterialWorldState({ bounds, interactionRange: 0 })).toThrow(/interactionRange/);
    expect(() => {
      const invalid = new MaterialWorldState({ bounds, interactionRange: 64 });
      invalid.addObject({
        id: "bad",
        label: "Bad",
        radius: 20,
        location: { kind: "free", position: { x: 5, y: 5 } },
      });
    }).toThrow(/fit World bounds/);
  });
});
