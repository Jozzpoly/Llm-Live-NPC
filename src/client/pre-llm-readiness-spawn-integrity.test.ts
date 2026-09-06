import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

function circleHitsExpandedAabb(
  position: { x: number; y: number },
  radius: number,
  bounds: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    position.x > bounds.x - radius &&
    position.x < bounds.x + bounds.width + radius &&
    position.y > bounds.y - radius &&
    position.y < bounds.y + bounds.height + radius
  );
}

describe("pre-LLM specimen spawn-integrity characterization", () => {
  it("shows that the current authored free items begin in-bounds and outside blocker footprints", () => {
    const specimen = createP1Specimen();
    const freeItems = specimen.entities.filter((entity) => entity.kind === "item" && entity.heldBy === null);

    expect(freeItems.length).toBeGreaterThan(0);
    for (const item of freeItems) {
      expect(item.position.x - item.radius).toBeGreaterThanOrEqual(0);
      expect(item.position.y - item.radius).toBeGreaterThanOrEqual(0);
      expect(item.position.x + item.radius).toBeLessThanOrEqual(specimen.width);
      expect(item.position.y + item.radius).toBeLessThanOrEqual(specimen.height);
      expect(
        specimen.blockers.some((blocker) => circleHitsExpandedAabb(item.position, item.radius, blocker.bounds))
      ).toBe(false);
    }
  });

  it("shows that World accepts an actor spawned inside a blocker and zero movement does not repair it", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const wall = specimen.blockers.find((blocker) => blocker.id === "workshop.left.north");
    if (!player || player.kind !== "player" || !wall) throw new Error("Missing spawn-overlap fixtures.");

    player.position = { x: 970, y: 200 };
    expect(circleHitsExpandedAabb(player.position, player.radius, wall.bounds)).toBe(true);

    const world = new World(specimen);
    world.step({ moveX: 0, moveY: 0 });

    const after = world.snapshot().entities.find((entity) => entity.id === player.id);
    if (!after || after.kind !== "player") throw new Error("Missing player after stationary step.");

    expect(after.position).toEqual({ x: 970, y: 200 });
    expect(circleHitsExpandedAabb(after.position, after.radius, wall.bounds)).toBe(true);
  });

  it("shows that World accepts a free item whose full geometry begins outside world bounds", () => {
    const specimen = createP1Specimen();
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!mug || mug.kind !== "item") throw new Error("Missing outside-world item fixture.");

    mug.position = { x: -20, y: 650 };
    const world = new World(specimen);
    const admitted = world.snapshot().entities.find((entity) => entity.id === mug.id);

    expect(admitted).toMatchObject({
      kind: "item",
      heldBy: null,
      position: { x: -20, y: 650 }
    });
    expect(world.validatePlacementTarget(mug.id, mug.position)).toMatchObject({
      status: "rejected",
      code: "outside_world"
    });
  });
});
