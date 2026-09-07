import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

describe("recovery R2 zero-valued geometry characterization", () => {
  it("admits actorSpeed zero as a stable frozen-motion configuration", () => {
    const specimen = createP1Specimen();
    specimen.actorSpeed = 0;
    const world = new World(specimen);
    const before = world.snapshot().entities.find((entity) => entity.id === "player.jozz");
    if (!before || before.kind !== "player") throw new Error("Missing player before zero-speed step.");

    world.step({ moveX: 1, moveY: 0 });

    const after = world.snapshot().entities.find((entity) => entity.id === "player.jozz");
    if (!after || after.kind !== "player") throw new Error("Missing player after zero-speed step.");
    expect(after.position).toEqual(before.position);
    expect(after.facing).toEqual({ x: 1, y: 0 });
    expect(Number.isFinite(after.position.x)).toBe(true);
    expect(Number.isFinite(after.position.y)).toBe(true);
  });

  it("admits a zero-radius item without poisoning pickup/drop state", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") throw new Error("Missing zero-radius fixtures.");
    player.position = { x: 260, y: 650 };
    mug.radius = 0;

    const world = new World(specimen);
    expect(world.attemptAction({ action: "interact", actorId: player.id, targetId: mug.id })).toMatchObject({
      status: "succeeded",
      code: "picked_up_item"
    });
    expect(world.attemptAction({ action: "drop", actorId: player.id })).toMatchObject({
      status: "succeeded",
      code: "dropped_item"
    });

    const dropped = world.snapshot().entities.find((entity) => entity.id === mug.id);
    expect(dropped).toMatchObject({ kind: "item", radius: 0, heldBy: null });
    if (!dropped) throw new Error("Missing dropped zero-radius item.");
    expect(Number.isFinite(dropped.position.x)).toBe(true);
    expect(Number.isFinite(dropped.position.y)).toBe(true);
  });

  it("admits a zero-width blocker that still has meaningful swept-by-radius collision and LOS semantics", () => {
    const specimen = createP1Specimen();
    specimen.blockers.push({
      id: "evidence.zero-width-wall",
      label: "Zero-width wall",
      bounds: { x: 630, y: 350, width: 0, height: 140 },
      occludesVision: true
    });

    const world = new World(specimen);
    expect(world.hasLineOfSight({ x: 600, y: 420 }, { x: 660, y: 420 })).toBe(false);

    const before = world.snapshot().entities.find((entity) => entity.id === "player.jozz");
    if (!before || before.kind !== "player") throw new Error("Missing player before zero-width collision step.");
    world.step({ moveX: 1, moveY: 0 });
    const after = world.snapshot().entities.find((entity) => entity.id === "player.jozz");
    if (!after || after.kind !== "player") throw new Error("Missing player after zero-width collision step.");

    expect(after.position.x).toBeLessThanOrEqual(630 - after.radius);
    expect(Number.isFinite(after.position.x)).toBe(true);
  });

  it("admits zero-width location/site AABBs without corrupting snapshot structure", () => {
    const specimen = createP1Specimen();
    specimen.locations.push({
      id: "evidence.zero-width-location",
      label: "Zero-width location",
      bounds: { x: 600, y: 400, width: 0, height: 40 }
    });
    specimen.placementSites.push({
      id: "evidence.zero-width-site",
      label: "Zero-width site",
      relation: "on",
      bounds: { x: 600, y: 400, width: 0, height: 40 }
    });

    const world = new World(specimen);
    const snapshot = world.snapshot();
    expect(snapshot.locations.find((entry) => entry.id === "evidence.zero-width-location")?.bounds.width).toBe(0);
    expect(snapshot.placementSites.find((entry) => entry.id === "evidence.zero-width-site")?.bounds.width).toBe(0);
  });
});
