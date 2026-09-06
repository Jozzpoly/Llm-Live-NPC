import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";

function expectFinitePositive(value: number): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThan(0);
}

function expectFiniteAabb(bounds: { x: number; y: number; width: number; height: number }): void {
  expect(Number.isFinite(bounds.x)).toBe(true);
  expect(Number.isFinite(bounds.y)).toBe(true);
  expectFinitePositive(bounds.width);
  expectFinitePositive(bounds.height);
}

function expectUnique(ids: readonly string[]): void {
  expect(new Set(ids).size).toBe(ids.length);
}

describe("pre-LLM current authored specimen invariant inventory", () => {
  it("shows that the current specimen has one player and unique authored IDs within each semantic category", () => {
    const specimen = createP1Specimen();

    expect(specimen.entities.filter((entity) => entity.kind === "player")).toHaveLength(1);
    expectUnique(specimen.entities.map((entity) => entity.id));
    expectUnique(specimen.blockers.map((blocker) => blocker.id));
    expectUnique(specimen.locations.map((location) => location.id));
    expectUnique(specimen.placementSites.map((site) => site.id));
  });

  it("shows that current authored scalar and geometry values are finite and physically non-degenerate", () => {
    const specimen = createP1Specimen();

    expectFinitePositive(specimen.width);
    expectFinitePositive(specimen.height);
    expectFinitePositive(specimen.actorSpeed);

    for (const entity of specimen.entities) {
      expect(Number.isFinite(entity.position.x)).toBe(true);
      expect(Number.isFinite(entity.position.y)).toBe(true);
      expectFinitePositive(entity.radius);
      if (entity.kind === "player" || entity.kind === "npc") {
        expect(Number.isFinite(entity.facing.x)).toBe(true);
        expect(Number.isFinite(entity.facing.y)).toBe(true);
        expect(Math.hypot(entity.facing.x, entity.facing.y)).toBeCloseTo(1, 8);
      }
    }

    for (const blocker of specimen.blockers) expectFiniteAabb(blocker.bounds);
    for (const location of specimen.locations) expectFiniteAabb(location.bounds);
    for (const site of specimen.placementSites) expectFiniteAabb(site.bounds);
  });

  it("shows that current authored held-item ownership is reciprocal and non-duplicated", () => {
    const specimen = createP1Specimen();
    const actors = specimen.entities.filter((entity) => entity.kind === "player" || entity.kind === "npc");
    const items = specimen.entities.filter((entity) => entity.kind === "item");

    const heldItemIds = actors.flatMap((actor) => (actor.heldItemId ? [actor.heldItemId] : []));
    expectUnique(heldItemIds);

    for (const actor of actors) {
      if (!actor.heldItemId) continue;
      const item = items.find((candidate) => candidate.id === actor.heldItemId);
      expect(item).toBeDefined();
      expect(item!.heldBy).toBe(actor.id);
    }

    for (const item of items) {
      if (!item.heldBy) continue;
      const actor = actors.find((candidate) => candidate.id === item.heldBy);
      expect(actor).toBeDefined();
      expect(actor!.heldItemId).toBe(item.id);
    }
  });
});
