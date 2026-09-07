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

function npcPosition(world: World) {
  const npc = world.snapshot().entities.find((entity) => entity.id === "npc.001");
  if (!npc || npc.kind !== "npc") throw new Error("Missing NPC snapshot.");
  return npc.position;
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

function horizontalWallSpecimen(height = 1) {
  const specimen = createP1Specimen();
  specimen.blockers = [
    {
      id: "probe.horizontal-wall",
      label: "Probe horizontal wall",
      bounds: { x: 500, y: 420, width: 200, height },
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

  it("cannot tunnel through a thin horizontal blocker on the Y axis", () => {
    const specimen = horizontalWallSpecimen(1);
    requirePlayer(specimen).position = { x: 600, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 0, moveY: 1 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 600, y: 404 });
  });

  it("cannot tunnel through a zero-height blocker admitted by the recovered R2 contract", () => {
    const specimen = horizontalWallSpecimen(0);
    requirePlayer(specimen).position = { x: 600, y: 400 };

    const world = new World(specimen);
    world.step({ moveX: 0, moveY: 1 }, 0.25);

    expect(playerPosition(world)).toEqual({ x: 600, y: 404 });
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

  it("stops at the nearest crossed blocker independently of blocker authoring order", () => {
    const makeWorld = (reverse: boolean) => {
      const specimen = createP1Specimen();
      requirePlayer(specimen).position = { x: 500, y: 400 };
      const blockers = [
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
      specimen.blockers = reverse ? blockers.reverse() : blockers;
      specimen.placementSites = [];
      return new World(specimen);
    };

    const canonicalOrder = makeWorld(false);
    const reversedOrder = makeWorld(true);
    canonicalOrder.step({ moveX: 1, moveY: 0 }, 0.25);
    reversedOrder.step({ moveX: 1, moveY: 0 }, 0.25);

    expect(playerPosition(canonicalOrder)).toEqual({ x: 504, y: 400 });
    expect(playerPosition(reversedOrder)).toEqual({ x: 504, y: 400 });
  });

  it("remains stable under repeated pressure into the same contact", () => {
    const specimen = verticalWallSpecimen(1);
    requirePlayer(specimen).position = { x: 500, y: 400 };
    const world = new World(specimen);

    for (let step = 0; step < 21; step += 1) {
      world.step({ moveX: 1, moveY: 0 }, 0.25);
      expect(playerPosition(world)).toEqual({ x: 504, y: 400 });
    }

    expect(world.tick).toBe(21);
  });

  it("applies anti-tunneling to NPC actor controls through the same canonical movement rule", () => {
    const specimen = createP1Specimen();
    requirePlayer(specimen).position = { x: 300, y: 400 };
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!npc || npc.kind !== "npc") throw new Error("Missing NPC fixture.");
    npc.position = { x: 760, y: 400 };
    specimen.actorSpeed = 2000;
    specimen.blockers = [
      {
        id: "probe.npc-wall",
        label: "NPC wall",
        bounds: { x: 800, y: 300, width: 1, height: 200 },
        occludesVision: true
      }
    ];
    specimen.placementSites = [];
    const world = new World(specimen);

    world.stepWithActorControls(
      { moveX: 0, moveY: 0 },
      [{ actorId: "npc.001", moveX: 1, moveY: 0 }],
      1 / 30
    );

    expect(npcPosition(world)).toEqual({ x: 784, y: 400 });
    expect(playerPosition(world)).toEqual({ x: 300, y: 400 });
  });

  it("allows escape from authored overlap while still respecting the next crossed blocker independent of order", () => {
    const makeWorld = (reverse: boolean) => {
      const specimen = createP1Specimen();
      requirePlayer(specimen).position = { x: 520, y: 400 };
      const blockers = [
        {
          id: "probe.start-overlap",
          label: "Start overlap",
          bounds: { x: 520, y: 300, width: 1, height: 200 },
          occludesVision: true
        },
        {
          id: "probe.escape-wall",
          label: "Escape wall",
          bounds: { x: 560, y: 300, width: 1, height: 200 },
          occludesVision: true
        }
      ];
      specimen.blockers = reverse ? blockers.reverse() : blockers;
      specimen.placementSites = [];
      return new World(specimen);
    };

    const canonicalOrder = makeWorld(false);
    const reversedOrder = makeWorld(true);
    canonicalOrder.step({ moveX: 1, moveY: 0 }, 0.25);
    reversedOrder.step({ moveX: 1, moveY: 0 }, 0.25);

    expect(playerPosition(canonicalOrder)).toEqual({ x: 544, y: 400 });
    expect(playerPosition(reversedOrder)).toEqual({ x: 544, y: 400 });
  });

  it("keeps zero-radius actors coherent against ordinary positive-width blockers", () => {
    const specimen = verticalWallSpecimen(10);
    const currentPlayer = requirePlayer(specimen);
    currentPlayer.radius = 0;
    currentPlayer.position = { x: 500, y: 400 };
    const world = new World(specimen);

    world.step({ moveX: 1, moveY: 0 }, 0.25);
    expect(playerPosition(world)).toEqual({ x: 520, y: 400 });

    world.step({ moveX: -1, moveY: 0 }, 0.25);
    expect(playerPosition(world)).toEqual({ x: 472.5, y: 400 });
  });
});
