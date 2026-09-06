import { describe, expect, it } from "vitest";
import { resolveLocationZone } from "./location-membership";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

describe("explicit singular location membership", () => {
  it("resolves the authored cottage/yard overlap by priority independent of array order", () => {
    const specimen = createP1Specimen();
    const point = { x: 440, y: 560 };

    expect(resolveLocationZone(specimen.locations, point)?.id).toBe("cottage");
    expect(resolveLocationZone([...specimen.locations].reverse(), point)?.id).toBe("cottage");
  });

  it("makes World player location independent of location authoring order", () => {
    const makeWorld = (reverse: boolean) => {
      const specimen = createP1Specimen();
      const player = specimen.entities.find((entity) => entity.id === "player.jozz");
      if (!player || player.kind !== "player") throw new Error("Missing player fixture.");
      player.position = { x: 440, y: 560 };
      if (reverse) specimen.locations.reverse();
      return new World(specimen);
    };

    expect(makeWorld(false).playerLocationId).toBe("cottage");
    expect(makeWorld(true).playerLocationId).toBe("cottage");
  });

  it("rejects equal-priority overlapping zones rather than inventing a tie-break semantic", () => {
    const specimen = createP1Specimen();
    const cottage = specimen.locations.find((location) => location.id === "cottage");
    const yard = specimen.locations.find((location) => location.id === "yard");
    if (!cottage || !yard) throw new Error("Missing overlap fixtures.");

    yard.priority = cottage.priority;
    expect(() => new World(specimen)).toThrow(
      /Location zones cottage and yard overlap at equal priority 20|Location zones yard and cottage overlap at equal priority 20/
    );
  });

  it("treats a shared inclusive boundary as ambiguous when priorities tie", () => {
    const specimen = createP1Specimen();
    const grove = specimen.locations.find((location) => location.id === "grove");
    const yard = specimen.locations.find((location) => location.id === "yard");
    if (!grove || !yard) throw new Error("Missing boundary fixtures.");

    // yard ends at x=930 and grove begins at x=930; current membership bounds
    // are inclusive, so the shared line belongs to both zones.
    yard.priority = grove.priority;
    expect(() => new World(specimen)).toThrow(/overlap at equal priority 10/);
  });

  it("requires authored priority to be a finite integer", () => {
    const specimen = createP1Specimen();
    specimen.locations[0]!.priority = 1.5;
    expect(() => new World(specimen)).toThrow(/priority must be a finite integer/);

    const nonFinite = createP1Specimen();
    nonFinite.locations[0]!.priority = Number.NaN;
    expect(() => new World(nonFinite)).toThrow(/priority must be a finite integer/);
  });

  it("emits singular lifecycle when movement enters a higher-priority overlap", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    if (!player || player.kind !== "player") throw new Error("Missing player fixture.");

    specimen.blockers = [];
    specimen.placementSites = [];
    specimen.locations = [
      {
        id: "probe.low",
        label: "Low priority zone",
        priority: 0,
        bounds: { x: 100, y: 300, width: 200, height: 200 }
      },
      {
        id: "probe.high",
        label: "High priority zone",
        priority: 10,
        bounds: { x: 200, y: 300, width: 200, height: 200 }
      }
    ];
    player.position = { x: 160, y: 400 };

    const world = new World(specimen);
    expect(world.playerLocationId).toBe("probe.low");

    world.step({ moveX: 1, moveY: 0 }, 0.25);
    expect(world.playerLocationId).toBe("probe.high");

    const lifecycle = world
      .recentEvents(32)
      .filter((event) => event.type === "location.entered" || event.type === "location.exited");
    expect(lifecycle.map((event) => [event.type, event.locationId, event.tick])).toEqual([
      ["location.entered", "probe.low", 0],
      ["location.exited", "probe.low", 1],
      ["location.entered", "probe.high", 1]
    ]);
  });
});
