import { describe, expect, it } from "vitest";
import { resolvePrimaryLocation } from "./location-membership";
import { createP1Specimen } from "./specimen";
import { validateWorldSpecimenStructure } from "./specimen-structural-validation";
import type { LocationZone } from "./types";
import { World } from "./world";

function zone(id: string, primaryPriority: number, x = 0): LocationZone {
  return {
    id,
    label: id,
    primaryPriority,
    bounds: { x, y: 0, width: 200, height: 200 }
  };
}

describe("recovery R3c explicit primary-location semantics", () => {
  it("uses authored primaryPriority rather than array order when overlapping zones differ in precedence", () => {
    const low = zone("low", -5);
    const high = zone("high", 10.5);
    const point = { x: 100, y: 100 };

    expect(resolvePrimaryLocation([low, high], point)?.id).toBe("high");
    expect(resolvePrimaryLocation([high, low], point)?.id).toBe("high");
  });

  it("keeps equal-priority overlap legal and resolves the current primary projection deterministically by id", () => {
    const makeWorld = (reverse: boolean) => {
      const specimen = createP1Specimen();
      const player = specimen.entities.find((entity) => entity.id === "player.jozz");
      if (!player || player.kind !== "player") throw new Error("Missing player fixture.");

      player.position = { x: 100, y: 100 };
      specimen.locations = [zone("zone.beta", 7), zone("zone.alpha", 7)];
      if (reverse) specimen.locations.reverse();
      return new World(specimen);
    };

    expect(makeWorld(false).playerLocationId).toBe("zone.alpha");
    expect(makeWorld(true).playerLocationId).toBe("zone.alpha");
  });

  it("requires finite primaryPriority without imposing location-overlap topology policy", () => {
    const finite = createP1Specimen();
    finite.locations[0]!.primaryPriority = -3.25;
    expect(() => validateWorldSpecimenStructure(finite)).not.toThrow();

    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const specimen = createP1Specimen();
      specimen.locations[0]!.primaryPriority = invalid;
      expect(() => validateWorldSpecimenStructure(specimen)).toThrow(/primaryPriority must be finite/);
    }
  });

  it("emits the same low-to-high primary-location lifecycle independent of authored array order", () => {
    const makeWorld = (reverse: boolean) => {
      const specimen = createP1Specimen();
      const player = specimen.entities.find((entity) => entity.id === "player.jozz");
      if (!player || player.kind !== "player") throw new Error("Missing player fixture.");

      specimen.blockers = [];
      specimen.placementSites = [];
      specimen.locations = [
        { ...zone("probe.low", 0, 100), bounds: { x: 100, y: 300, width: 200, height: 200 } },
        { ...zone("probe.high", 10, 200), bounds: { x: 200, y: 300, width: 200, height: 200 } }
      ];
      if (reverse) specimen.locations.reverse();
      player.position = { x: 160, y: 400 };
      return new World(specimen);
    };

    for (const reverse of [false, true]) {
      const world = makeWorld(reverse);
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
});
