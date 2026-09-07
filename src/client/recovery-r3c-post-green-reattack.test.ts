import { describe, expect, it } from "vitest";
import { projectE1Perception } from "../agent/e1-grounding";
import { createP1Specimen } from "../world/specimen";
import type { LocationZone } from "../world/types";
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

function location(id: string, primaryPriority: number, x: number): LocationZone {
  return {
    id,
    label: id,
    primaryPriority,
    bounds: { x, y: 300, width: 200, height: 200 }
  };
}

function overlapWorld(reverseLocations = false): World {
  const specimen = createP1Specimen();
  specimen.blockers = [];
  specimen.placementSites = [];
  specimen.locations = [location("probe.low", 0, 100), location("probe.high", 10, 200)];
  if (reverseLocations) specimen.locations.reverse();
  requirePlayer(specimen).position = { x: 160, y: 400 };
  return new World(specimen);
}

describe("recovery R3c post-green re-attack", () => {
  it("emits the same low-to-high primary-location lifecycle independent of authored array order", () => {
    for (const reverseLocations of [false, true]) {
      const world = overlapWorld(reverseLocations);
      expect(world.playerLocationId).toBe("probe.low");

      world.step({ moveX: 1, moveY: 0 }, 0.25);
      expect(world.playerLocationId).toBe("probe.high");

      const lifecycle = world
        .recentEvents(32)
        .filter((event) => event.type === "location.entered" || event.type === "location.exited")
        .map((event) => [event.type, event.locationId, event.tick]);

      expect(lifecycle).toEqual([
        ["location.entered", "probe.low", 0],
        ["location.exited", "probe.low", 1],
        ["location.entered", "probe.high", 1]
      ]);
    }
  });

  it("keeps E1 observer primary identity aligned with World after a priority transition even when snapshot order is reversed", () => {
    const specimen = createP1Specimen();
    specimen.blockers = [];
    specimen.placementSites = [];
    specimen.locations = [location("probe.low", 0, 100), location("probe.high", 10, 200)];
    const player = requirePlayer(specimen);
    const npc = requireNpc(specimen);
    player.position = { x: 160, y: 400 };
    npc.position = { x: 207.5, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.25);
    expect(world.playerLocationId).toBe("probe.high");

    const snapshot = world.snapshot();
    snapshot.locations.reverse();
    const perception = projectE1Perception(
      snapshot,
      npc.id,
      (start, end) => world.hasLineOfSight(start, end)
    );

    expect(perception.observer.locationId).toBe("probe.high");
    expect(perception.observer.locationId).toBe(world.playerLocationId);
  });

  it("keeps equal-priority overlap legal and gives its deterministic id fallback real lifecycle semantics", () => {
    for (const reverseLocations of [false, true]) {
      const specimen = createP1Specimen();
      specimen.blockers = [];
      specimen.placementSites = [];
      specimen.locations = [location("zone.beta", 7, 100), location("zone.alpha", 7, 200)];
      if (reverseLocations) specimen.locations.reverse();
      requirePlayer(specimen).position = { x: 160, y: 400 };

      const world = new World(specimen);
      expect(world.playerLocationId).toBe("zone.beta");

      world.step({ moveX: 1, moveY: 0 }, 0.25);
      expect(world.playerLocationId).toBe("zone.alpha");

      const lifecycle = world
        .recentEvents(32)
        .filter((event) => event.type === "location.entered" || event.type === "location.exited")
        .map((event) => [event.type, event.locationId, event.tick]);

      expect(lifecycle).toEqual([
        ["location.entered", "zone.beta", 0],
        ["location.exited", "zone.beta", 1],
        ["location.entered", "zone.alpha", 1]
      ]);
    }
  });
});
