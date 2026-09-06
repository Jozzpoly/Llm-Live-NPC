import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

function requirePlayer(specimen: ReturnType<typeof createP1Specimen>) {
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  if (!player || player.kind !== "player") throw new Error("Missing player fixture.");
  return player;
}

describe("pre-LLM World step/collision characterization", () => {
  it("shows that the current authored 20 px workshop wall still blocks a legal maximum-duration step", () => {
    const specimen = createP1Specimen();
    const player = requirePlayer(specimen);
    player.position = { x: 1280, y: 300 };

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.25);

    const after = world.snapshot().entities.find((entity) => entity.id === player.id);
    expect(after).toMatchObject({ position: { x: 1284, y: 300 } });
  });

  it("shows that an otherwise valid thin blocker can be crossed by one legal maximum-duration step", () => {
    const specimen = createP1Specimen();
    const player = requirePlayer(specimen);
    player.position = { x: 500, y: 400 };
    specimen.blockers = [
      {
        id: "probe.thin-wall",
        label: "Thin probe wall",
        bounds: { x: 520, y: 300, width: 1, height: 200 },
        occludesVision: true
      }
    ];
    specimen.locations = [];
    specimen.placementSites = [];

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 }, 0.25);

    const after = world.snapshot().entities.find((entity) => entity.id === player.id);
    if (!after || after.kind !== "player") throw new Error("Missing player after thin-wall step.");

    expect(after.position.x).toBeCloseTo(547.5, 8);
    expect(after.position.x - after.radius).toBeGreaterThan(521);
  });

  it("shows that the same thin blocker stops the current normal 30 Hz step", () => {
    const specimen = createP1Specimen();
    const player = requirePlayer(specimen);
    player.position = { x: 500, y: 400 };
    specimen.blockers = [
      {
        id: "probe.thin-wall",
        label: "Thin probe wall",
        bounds: { x: 520, y: 300, width: 1, height: 200 },
        occludesVision: true
      }
    ];
    specimen.locations = [];
    specimen.placementSites = [];

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 });

    const after = world.snapshot().entities.find((entity) => entity.id === player.id);
    expect(after).toMatchObject({ position: { x: 504, y: 400 } });
  });

  it("shows that step-duration restriction alone cannot protect collision if a finite specimen speed is raised", () => {
    const specimen = createP1Specimen();
    const player = requirePlayer(specimen);
    player.position = { x: 1280, y: 300 };
    specimen.actorSpeed = 2000;

    const world = new World(specimen);
    world.step({ moveX: 1, moveY: 0 });

    const after = world.snapshot().entities.find((entity) => entity.id === player.id);
    if (!after || after.kind !== "player") throw new Error("Missing player after high-speed step.");

    expect(after.position.x).toBeCloseTo(1346.6666666667, 8);
    expect(after.position.x - after.radius).toBeGreaterThan(1320);
  });
});
