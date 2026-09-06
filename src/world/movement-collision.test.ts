import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

function requirePlayer(specimen: ReturnType<typeof createP1Specimen>) {
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  if (!player || player.kind !== "player") throw new Error("Missing player fixture.");
  return player;
}

function playerPosition(world: World) {
  const player = world.snapshot().entities.find((entity) => entity.id === "player.jozz");
  if (!player || player.kind !== "player") throw new Error("Missing player snapshot.");
  return player.position;
}

function verticalThinWallSpecimen() {
  const specimen = createP1Specimen();
  specimen.blockers = [
    {
      id: "probe.thin-vertical-wall",
      label: "Thin vertical wall",
      bounds: { x: 520, y: 300, width: 1, height: 200 },
      occludesVision: true
    }
  ];
  specimen.placementSites = [];
  return specimen;
}

describe("World swept static-blocker movement", () => {
  it("preserves the current authored wall stop at the legal maximum step duration", () => {
    const specimen = createP1Specimen();
    requirePlayer(specimen).position = { x: 1280, y: 300 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 1284, y: 300 });
  });

  it("cannot tunnel through a one-pixel blocker during one legal maximum-duration step", () => {
    const specimen = verticalThinWallSpecimen();
    requirePlayer(specimen).position = { x: 500, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 504, y: 400 });
  });

  it("cannot tunnel through the authored workshop wall when finite actor speed is much higher", () => {
    const specimen = createP1Specimen();
    requirePlayer(specimen).position = { x: 1280, y: 300 };
    specimen.actorSpeed = 2000;

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 });

    expect(playerPosition(world)).toEqual({ x: 1284, y: 300 });
  });

  it("resolves the same thin blocker symmetrically when crossing from the opposite side", () => {
    const specimen = verticalThinWallSpecimen();
    requirePlayer(specimen).position = { x: 550, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: -1, moveY: 0 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 537, y: 400 });
  });

  it("sweeps vertical movement against a thin horizontal blocker", () => {
    const specimen = createP1Specimen();
    requirePlayer(specimen).position = { x: 600, y: 400 };
    specimen.blockers = [
      {
        id: "probe.thin-horizontal-wall",
        label: "Thin horizontal wall",
        bounds: { x: 500, y: 420, width: 200, height: 1 },
        occludesVision: true
      }
    ];
    specimen.placementSites = [];

    const world = new World(specimen);
    world.step({ moveX: 0, moveY: 1 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 600, y: 404 });
  });

  it("preserves deterministic axis-separated sliding after the swept X collision", () => {
    const specimen = verticalThinWallSpecimen();
    requirePlayer(specimen).position = { x: 500, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 1 }, 0.25);

    const position = playerPosition(world);
    expect(position.x).toBe(504);
    expect(position.y).toBeCloseTo(433.587572106361, 10);
  });

  it("does not trap an actor that starts touching a blocker and moves away from it", () => {
    const specimen = verticalThinWallSpecimen();
    requirePlayer(specimen).position = { x: 504, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: -1, moveY: 0 }, 0.25);

    expect(playerPosition(world).x).toBeCloseTo(456.5, 10);
  });
});
