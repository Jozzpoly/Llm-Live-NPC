import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

function player(specimen: ReturnType<typeof createP1Specimen>) {
  const entity = specimen.entities.find((entry) => entry.id === "player.jozz");
  if (!entity || entity.kind !== "player") throw new Error("Missing player fixture.");
  return entity;
}

function npc(specimen: ReturnType<typeof createP1Specimen>) {
  const entity = specimen.entities.find((entry) => entry.id === "npc.001");
  if (!entity || entity.kind !== "npc") throw new Error("Missing NPC fixture.");
  return entity;
}

function actorPosition(world: World, id: string) {
  const entity = world.snapshot().entities.find((entry) => entry.id === id);
  if (!entity || (entity.kind !== "player" && entity.kind !== "npc")) throw new Error(`Missing actor ${id}.`);
  return entity.position;
}

function verticalWall(x = 520, width = 1) {
  return {
    id: `probe.vertical.${x}.${width}`,
    label: "Probe vertical wall",
    bounds: { x, y: 300, width, height: 200 },
    occludesVision: true
  };
}

function horizontalWall(y = 420, height = 1) {
  return {
    id: `probe.horizontal.${y}.${height}`,
    label: "Probe horizontal wall",
    bounds: { x: 500, y, width: 200, height },
    occludesVision: true
  };
}

describe("recovery R3a post-green re-attack", () => {
  it("remains stable under repeated pressure into the same contact instead of jittering or leaking through", () => {
    const specimen = createP1Specimen();
    player(specimen).position = { x: 500, y: 400 };
    specimen.blockers = [verticalWall()];
    specimen.placementSites = [];
    const world = new World(specimen);

    for (let step = 0; step < 21; step += 1) {
      world.step({ moveX: 1, moveY: 0 }, 0.25);
      expect(actorPosition(world, "player.jozz")).toEqual({ x: 504, y: 400 });
    }

    expect(world.tick).toBe(21);
  });

  it("applies the same anti-tunneling rule to NPC actor controls, not only the singular player path", () => {
    const specimen = createP1Specimen();
    player(specimen).position = { x: 300, y: 400 };
    npc(specimen).position = { x: 760, y: 400 };
    specimen.actorSpeed = 2000;
    specimen.blockers = [verticalWall(800, 1)];
    specimen.placementSites = [];
    const world = new World(specimen);

    world.stepWithActorControls(
      { moveX: 0, moveY: 0 },
      [{ actorId: "npc.001", moveX: 1, moveY: 0 }],
      1 / 30
    );

    expect(actorPosition(world, "npc.001")).toEqual({ x: 784, y: 400 });
    expect(actorPosition(world, "player.jozz")).toEqual({ x: 300, y: 400 });
  });

  it("resolves Y-axis crossing symmetrically from below and above", () => {
    const makeWorld = (startY: number) => {
      const specimen = createP1Specimen();
      player(specimen).position = { x: 600, y: startY };
      specimen.blockers = [horizontalWall()];
      specimen.placementSites = [];
      return new World(specimen);
    };

    const below = makeWorld(400);
    below.step({ moveX: 0, moveY: 1 }, 0.25);
    expect(actorPosition(below, "player.jozz")).toEqual({ x: 600, y: 404 });

    const above = makeWorld(450);
    above.step({ moveX: 0, moveY: -1 }, 0.25);
    expect(actorPosition(above, "player.jozz")).toEqual({ x: 600, y: 437 });
  });

  it("allows authored overlap to exit on either axis and in either direction without reverse depenetration", () => {
    const run = (
      blocker: ReturnType<typeof verticalWall> | ReturnType<typeof horizontalWall>,
      start: { x: number; y: number },
      control: { moveX: number; moveY: number },
      expected: { x: number; y: number }
    ) => {
      const specimen = createP1Specimen();
      player(specimen).position = start;
      specimen.blockers = [blocker];
      specimen.placementSites = [];
      const world = new World(specimen);
      world.step(control, 0.25);
      expect(actorPosition(world, "player.jozz")).toEqual(expected);
    };

    run(verticalWall(), { x: 520, y: 400 }, { moveX: 1, moveY: 0 }, { x: 567.5, y: 400 });
    run(verticalWall(), { x: 520, y: 400 }, { moveX: -1, moveY: 0 }, { x: 472.5, y: 400 });
    run(horizontalWall(), { x: 600, y: 420 }, { moveX: 0, moveY: 1 }, { x: 600, y: 467.5 });
    run(horizontalWall(), { x: 600, y: 420 }, { moveX: 0, moveY: -1 }, { x: 600, y: 372.5 });
  });

  it("ignores the blocker containing an authored start but still stops at a second blocker crossed during escape", () => {
    const makeWorld = (reverse: boolean) => {
      const specimen = createP1Specimen();
      player(specimen).position = { x: 520, y: 400 };
      const blockers = [verticalWall(520, 1), verticalWall(560, 1)];
      specimen.blockers = reverse ? blockers.reverse() : blockers;
      specimen.placementSites = [];
      return new World(specimen);
    };

    const canonical = makeWorld(false);
    const reversed = makeWorld(true);
    canonical.step({ moveX: 1, moveY: 0 }, 0.25);
    reversed.step({ moveX: 1, moveY: 0 }, 0.25);

    expect(actorPosition(canonical, "player.jozz")).toEqual({ x: 544, y: 400 });
    expect(actorPosition(reversed, "player.jozz")).toEqual({ x: 544, y: 400 });
  });

  it("supports zero-radius actors against ordinary positive-width blockers without trapping contact", () => {
    const specimen = createP1Specimen();
    const currentPlayer = player(specimen);
    currentPlayer.radius = 0;
    currentPlayer.position = { x: 500, y: 400 };
    specimen.blockers = [verticalWall(520, 10)];
    specimen.placementSites = [];
    const world = new World(specimen);

    world.step({ moveX: 1, moveY: 0 }, 0.25);
    expect(actorPosition(world, "player.jozz")).toEqual({ x: 520, y: 400 });

    world.step({ moveX: -1, moveY: 0 }, 0.25);
    expect(actorPosition(world, "player.jozz")).toEqual({ x: 472.5, y: 400 });
  });

  it("retains world-bound clamping after the static-blocker sweep", () => {
    const specimen = createP1Specimen();
    player(specimen).position = { x: 1400, y: 400 };
    specimen.blockers = [];
    specimen.placementSites = [];
    const world = new World(specimen);

    world.step({ moveX: 1, moveY: 0 }, 0.25);
    expect(actorPosition(world, "player.jozz")).toEqual({ x: 1424, y: 400 });
  });

  it("characterizes the doubly-degenerate point-on-line contact as ambiguous/sticky rather than silently calling it qualified", () => {
    const specimen = createP1Specimen();
    const currentPlayer = player(specimen);
    currentPlayer.radius = 0;
    currentPlayer.position = { x: 500, y: 400 };
    specimen.blockers = [verticalWall(520, 0)];
    specimen.placementSites = [];
    const world = new World(specimen);

    world.step({ moveX: 1, moveY: 0 }, 0.25);
    expect(actorPosition(world, "player.jozz")).toEqual({ x: 520, y: 400 });

    world.step({ moveX: -1, moveY: 0 }, 0.25);
    expect(actorPosition(world, "player.jozz")).toEqual({ x: 520, y: 400 });
  });
});
