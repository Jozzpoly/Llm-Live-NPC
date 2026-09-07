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

function verticalWallSpecimen(width = 1) {
  const specimen = createP1Specimen();
  specimen.blockers = [
    {
      id: "probe.vertical-wall",
      label: "Probe vertical wall",
      bounds: { x: 520, y: 300, width, height: 200 },
      occludesVision: true
    }
  ];
  specimen.placementSites = [];
  return specimen;
}

describe("recovery R3a movement/collision characterization", () => {
  it("cannot tunnel through a thin blocker during one legal maximum-duration step", () => {
    const specimen = verticalWallSpecimen(1);
    requirePlayer(specimen).position = { x: 500, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 504, y: 400 });
  });

  it("cannot tunnel through a zero-width blocker admitted by the recovered R2 contract", () => {
    const specimen = verticalWallSpecimen(0);
    requirePlayer(specimen).position = { x: 500, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 504, y: 400 });
  });

  it("cannot tunnel through the authored workshop wall at much higher finite actor speed", () => {
    const specimen = createP1Specimen();
    requirePlayer(specimen).position = { x: 1280, y: 300 };
    specimen.actorSpeed = 2000;

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 });

    expect(playerPosition(world)).toEqual({ x: 1284, y: 300 });
  });

  it("resolves thin-wall crossing symmetrically from the opposite side", () => {
    const specimen = verticalWallSpecimen(1);
    requirePlayer(specimen).position = { x: 550, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: -1, moveY: 0 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 537, y: 400 });
  });

  it("blocks movement into a blocker when the actor begins exactly touching its boundary", () => {
    const specimen = verticalWallSpecimen(1);
    requirePlayer(specimen).position = { x: 504, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 504, y: 400 });
  });

  it("does not snap an authored overlapping actor backward when a small commanded move remains inside the overlap", () => {
    const specimen = verticalWallSpecimen(1);
    requirePlayer(specimen).position = { x: 520, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.01);

    expect(playerPosition(world).x).toBeCloseTo(521.9, 10);
  });

  it("allows an actor that starts touching a blocker to move away", () => {
    const specimen = verticalWallSpecimen(1);
    requirePlayer(specimen).position = { x: 504, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: -1, moveY: 0 }, 0.25);

    expect(playerPosition(world).x).toBeCloseTo(456.5, 10);
  });

  it("allows tangential motion while exactly touching a blocker boundary", () => {
    const specimen = verticalWallSpecimen(1);
    requirePlayer(specimen).position = { x: 504, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 0, moveY: 1 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 504, y: 447.5 });
  });

  it("preserves deterministic axis-separated sliding after an X collision", () => {
    const specimen = verticalWallSpecimen(1);
    requirePlayer(specimen).position = { x: 500, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 1 }, 0.25);

    const position = playerPosition(world);
    expect(position.x).toBe(504);
    expect(position.y).toBeCloseTo(433.587572106361, 10);
  });

  it("stops at the nearest crossed blocker rather than the first endpoint-overlapping blocker", () => {
    const specimen = createP1Specimen();
    requirePlayer(specimen).position = { x: 500, y: 400 };
    specimen.blockers = [
      {
        id: "probe.near-wall",
        label: "Near wall",
        bounds: { x: 520, y: 300, width: 1, height: 200 },
        occludesVision: true
      },
      {
        id: "probe.far-wall",
        label: "Far wall",
        bounds: { x: 560, y: 300, width: 1, height: 200 },
        occludesVision: true
      }
    ];
    specimen.placementSites = [];

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 504, y: 400 });
  });
});
