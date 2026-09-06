import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

function aabbOverlapArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

describe("pre-LLM specimen semantic topology characterization", () => {
  it("shows that the current authored support site is spatially coherent with its referenced blocker", () => {
    const specimen = createP1Specimen();
    const supportedSites = specimen.placementSites.filter((site) => site.supportBlockerId);

    expect(supportedSites.length).toBeGreaterThan(0);
    for (const site of supportedSites) {
      const blocker = specimen.blockers.find((candidate) => candidate.id === site.supportBlockerId);
      expect(blocker).toBeDefined();
      expect(aabbOverlapArea(site.bounds, blocker!.bounds)).toBeGreaterThan(0);
    }
  });

  it("shows that current authored actors start with their full body footprints inside world bounds", () => {
    const specimen = createP1Specimen();
    const actors = specimen.entities.filter((entity) => entity.kind === "player" || entity.kind === "npc");

    expect(actors.length).toBeGreaterThan(0);
    for (const actor of actors) {
      expect(actor.position.x - actor.radius).toBeGreaterThanOrEqual(0);
      expect(actor.position.y - actor.radius).toBeGreaterThanOrEqual(0);
      expect(actor.position.x + actor.radius).toBeLessThanOrEqual(specimen.width);
      expect(actor.position.y + actor.radius).toBeLessThanOrEqual(specimen.height);
    }
  });

  it("shows that a placement site can claim support from an existing but spatially unrelated blocker", () => {
    const specimen = createP1Specimen();
    const distantSupport = specimen.blockers.find((blocker) => blocker.id === "workshop.top");
    if (!distantSupport) throw new Error("Missing distant support blocker fixture.");

    specimen.placementSites = [
      {
        id: "probe.remote-support-site",
        label: "Remote support site",
        relation: "on",
        bounds: { x: 520, y: 360, width: 120, height: 80 },
        supportBlockerId: distantSupport.id
      }
    ];

    const world = new World(specimen);
    const validation = world.validatePlacementTarget("item.mug", { x: 580, y: 400 });

    expect(validation).toEqual({
      status: "accepted",
      itemId: "item.mug",
      position: { x: 580, y: 400 },
      support: {
        kind: "site",
        siteId: "probe.remote-support-site",
        relation: "on"
      }
    });

    expect(distantSupport.bounds.y + distantSupport.bounds.height).toBeLessThan(360);
  });

  it("shows that an actor can start outside world bounds and remain there across an idle canonical step", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    if (!player || player.kind !== "player") throw new Error("Missing player topology fixture.");

    player.position = { x: -100, y: -100 };
    const world = new World(specimen);

    expect(world.snapshot().entities.find((entity) => entity.id === player.id)).toMatchObject({
      position: { x: -100, y: -100 }
    });

    world.step({ moveX: 0, moveY: 0 });

    expect(world.snapshot().entities.find((entity) => entity.id === player.id)).toMatchObject({
      position: { x: -100, y: -100 }
    });
  });
});
