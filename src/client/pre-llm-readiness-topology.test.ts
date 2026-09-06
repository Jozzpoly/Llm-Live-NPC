import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

describe("pre-LLM specimen semantic topology characterization", () => {
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
