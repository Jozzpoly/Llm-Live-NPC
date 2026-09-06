import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

describe("pre-LLM World boundary characterization", () => {
  it("shows that the singular player identity depends on specimen entity order when multiple players are supplied", () => {
    const firstSpecimen = createP1Specimen();
    const canonicalPlayer = firstSpecimen.entities.find((entity) => entity.id === "player.jozz");
    if (!canonicalPlayer || canonicalPlayer.kind !== "player") throw new Error("Missing canonical player fixture.");

    canonicalPlayer.position = { x: 760, y: 390 };
    const alternatePlayer = structuredClone(canonicalPlayer);
    alternatePlayer.id = "player.alt";
    alternatePlayer.label = "Alternate player";
    alternatePlayer.position = { x: 440, y: 560 };
    firstSpecimen.entities.push(alternatePlayer);

    const canonicalFirst = new World(firstSpecimen);
    expect(canonicalFirst.snapshot().entities.filter((entity) => entity.kind === "player")).toHaveLength(2);
    expect(canonicalFirst.playerLocationId).toBe("yard");

    const alternateFirstSpecimen = createP1Specimen();
    const secondCanonical = alternateFirstSpecimen.entities.find((entity) => entity.id === "player.jozz");
    if (!secondCanonical || secondCanonical.kind !== "player") throw new Error("Missing reordered player fixture.");
    secondCanonical.position = { x: 760, y: 390 };
    const secondAlternate = structuredClone(secondCanonical);
    secondAlternate.id = "player.alt";
    secondAlternate.label = "Alternate player";
    secondAlternate.position = { x: 440, y: 560 };
    alternateFirstSpecimen.entities.unshift(secondAlternate);

    const alternateFirst = new World(alternateFirstSpecimen);
    expect(alternateFirst.snapshot().entities.filter((entity) => entity.kind === "player")).toHaveLength(2);
    expect(alternateFirst.playerLocationId).toBe("cottage");
  });

  it("shows that non-entity semantic IDs are not required to be unique at the World boundary", () => {
    const specimen = createP1Specimen();
    const blocker = specimen.blockers[0];
    const location = specimen.locations[0];
    const site = specimen.placementSites[0];
    if (!blocker || !location || !site) throw new Error("Missing semantic-ID fixtures.");

    specimen.blockers.push({ ...structuredClone(blocker), label: "Duplicate blocker id" });
    specimen.locations.push({ ...structuredClone(location), label: "Duplicate location id" });
    specimen.placementSites.push({ ...structuredClone(site), label: "Duplicate placement site id" });

    const world = new World(specimen);
    const snapshot = world.snapshot();
    expect(snapshot.blockers.filter((entry) => entry.id === blocker.id)).toHaveLength(2);
    expect(snapshot.locations.filter((entry) => entry.id === location.id)).toHaveLength(2);
    expect(snapshot.placementSites.filter((entry) => entry.id === site.id)).toHaveLength(2);
  });

  it("shows that logically consistent held-item ownership can begin with physically inconsistent geometry", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing held-item start geometry fixture.");
    }

    player.position = { x: 500, y: 500 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 1200, y: 120 };

    const world = new World(specimen);
    expect(world.snapshot().entities.find((entity) => entity.id === player.id)).toMatchObject({ heldItemId: mug.id });
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      heldBy: player.id,
      position: { x: 1200, y: 120 }
    });

    world.step({ moveX: 0, moveY: 0 });
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      heldBy: player.id,
      position: { x: 500, y: 474 }
    });
  });

  it("proves that World snapshots are isolated read models rather than mutable aliases", () => {
    const world = new World(createP1Specimen());
    const baseline = world.snapshot();
    const external = world.snapshot();

    external.entities[0]!.position.x = -9999;
    external.blockers[0]!.bounds.x = -9999;
    external.locations[0]!.bounds.x = -9999;
    external.placementSites[0]!.bounds.x = -9999;

    expect(world.snapshot()).toEqual(baseline);
  });

  it("proves that returned event and action records cannot mutate the records retained by World", () => {
    const world = new World(createP1Specimen());
    const eventsBefore = world.recentEvents(128);
    const externalEvents = world.recentEvents(128);
    externalEvents[0]!.message = "mutated outside World";
    expect(world.recentEvents(128)).toEqual(eventsBefore);

    const result = world.attemptAction({ action: "drop", actorId: "player.jozz" });
    expect(result.status).toBe("rejected");
    result.message = "mutated outside World";
    expect(world.lastActionResult()?.message).not.toBe("mutated outside World");
  });

  it("shows that recentEvents is a bounded diagnostic ring, not durable semantic history", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing event-history fixture.");
    }

    player.position = { x: 500, y: 500 };
    mug.position = { x: 530, y: 500 };
    const world = new World(specimen);

    for (let iteration = 0; iteration < 70; iteration += 1) {
      const pickup = world.attemptAction({ action: "interact", actorId: player.id, targetId: mug.id });
      expect(pickup).toMatchObject({ status: "succeeded", code: "picked_up_item" });
      const drop = world.attemptAction({ action: "drop", actorId: player.id });
      expect(drop).toMatchObject({ status: "succeeded", code: "dropped_item" });
    }

    const retained = world.recentEvents(1000);
    expect(retained).toHaveLength(128);
    expect(retained[0]!.seq).toBeGreaterThan(1);
    expect(retained.at(-1)!.seq).toBeGreaterThan(retained[0]!.seq);
    expect(retained.some((event) => event.type === "world.started")).toBe(false);
  });
});
