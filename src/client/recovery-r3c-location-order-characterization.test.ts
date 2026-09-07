import { describe, expect, it } from "vitest";
import { projectE1Perception } from "../agent/e1-grounding";
import { createP1Specimen } from "../world/specimen";
import type { LocationZone, Vec2 } from "../world/types";
import { World } from "../world/world";

function requirePlayer(specimen: ReturnType<typeof createP1Specimen>) {
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  if (!player || player.kind !== "player") throw new Error("Missing player fixture.");
  return player;
}

function requireNpc(specimen: ReturnType<typeof createP1Specimen>) {
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  if (!npc || npc.kind !== "npc") throw new Error("Missing NPC fixture.");
  return npc;
}

function contains(location: LocationZone, point: Vec2): boolean {
  return (
    point.x >= location.bounds.x &&
    point.x <= location.bounds.x + location.bounds.width &&
    point.y >= location.bounds.y &&
    point.y <= location.bounds.y + location.bounds.height
  );
}

function worldAt(point: Vec2, reverseLocations = false): World {
  const specimen = createP1Specimen();
  requirePlayer(specimen).position = { ...point };
  if (reverseLocations) specimen.locations.reverse();
  return new World(specimen);
}

function e1LocationAt(point: Vec2, reverseLocations = false): string | null {
  const specimen = createP1Specimen();
  const npc = requireNpc(specimen);
  npc.position = { ...point };
  const world = new World(specimen);
  const snapshot = world.snapshot();
  if (reverseLocations) snapshot.locations.reverse();
  return projectE1Perception(snapshot, npc.id, (start, end) => world.hasLineOfSight(start, end)).observer.locationId;
}

describe("recovery R3c location-order characterization", () => {
  it("keeps World primary location identity stable when authored cottage/yard overlap order is reversed", () => {
    const point = { x: 440, y: 560 };
    const canonical = worldAt(point).playerLocationId;
    const reordered = worldAt(point, true).playerLocationId;

    expect(reordered).toBe(canonical);
  });

  it("keeps E1 primary location identity stable when the same overlap is reordered in a snapshot", () => {
    const point = { x: 440, y: 560 };
    const canonical = e1LocationAt(point);
    const reordered = e1LocationAt(point, true);

    expect(reordered).toBe(canonical);
  });

  it("does not let World and E1 disagree solely because the read-model location array is reordered", () => {
    const specimen = createP1Specimen();
    const point = { x: 440, y: 560 };
    const player = requirePlayer(specimen);
    const npc = requireNpc(specimen);
    player.position = { ...point };
    npc.position = { ...point };

    const world = new World(specimen);
    const reorderedSnapshot = world.snapshot();
    reorderedSnapshot.locations.reverse();
    const perception = projectE1Perception(
      reorderedSnapshot,
      npc.id,
      (start, end) => world.hasLineOfSight(start, end)
    );

    expect(perception.observer.locationId).toBe(world.playerLocationId);
  });

  it("keeps primary identity stable at the inclusive yard/grove shared boundary when authoring order changes", () => {
    const point = { x: 930, y: 560 };
    const canonical = worldAt(point).playerLocationId;
    const reordered = worldAt(point, true).playerLocationId;

    expect(reordered).toBe(canonical);
  });

  it("preserves authored overlap as legal substrate data rather than treating overlap itself as structural corruption", () => {
    const specimen = createP1Specimen();
    const point = { x: 440, y: 560 };
    const containingIds = specimen.locations
      .filter((location) => contains(location, point))
      .map((location) => location.id)
      .sort((a, b) => a.localeCompare(b));

    expect(containingIds).toEqual(["cottage", "yard"]);
    expect(() => new World(specimen)).not.toThrow();
  });
});
