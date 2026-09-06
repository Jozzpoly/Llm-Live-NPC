import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

describe("WorldSpecimen construction integrity", () => {
  it("accepts the current authored specimen", () => {
    expect(() => new World(createP1Specimen())).not.toThrow();
  });

  it("rejects non-finite or non-positive scalar and authored geometry before World starts", () => {
    const invalidCases: Array<[string, (specimen: ReturnType<typeof createP1Specimen>) => void, RegExp]> = [
      ["world width", (specimen) => { specimen.width = Number.NaN; }, /World width must be finite and positive/],
      ["actor speed", (specimen) => { specimen.actorSpeed = 0; }, /World actorSpeed must be finite and positive/],
      ["entity position", (specimen) => { specimen.entities[0]!.position.x = Number.POSITIVE_INFINITY; }, /position must be finite/],
      ["entity radius", (specimen) => { specimen.entities[0]!.radius = 0; }, /radius must be finite and positive/],
      ["blocker bounds", (specimen) => { specimen.blockers[0]!.bounds.width = 0; }, /Blocker .* width must be finite and positive/],
      ["location bounds", (specimen) => { specimen.locations[0]!.bounds.x = Number.NaN; }, /Location .* origin must be finite/],
      ["site bounds", (specimen) => { specimen.placementSites[0]!.bounds.height = Number.NaN; }, /Placement site .* height must be finite and positive/]
    ];

    for (const [label, mutate, message] of invalidCases) {
      const specimen = createP1Specimen();
      mutate(specimen);
      expect(() => new World(specimen), label).toThrow(message);
    }
  });

  it("requires exactly one player and unique IDs inside each semantic namespace", () => {
    const twoPlayers = createP1Specimen();
    const player = twoPlayers.entities.find((entity) => entity.id === "player.jozz");
    if (!player || player.kind !== "player") throw new Error("Missing player fixture.");
    const alternate = structuredClone(player);
    alternate.id = "player.alt";
    twoPlayers.entities.push(alternate);
    expect(() => new World(twoPlayers)).toThrow(/exactly one player entity; received 2/);

    const duplicateBlocker = createP1Specimen();
    duplicateBlocker.blockers.push(structuredClone(duplicateBlocker.blockers[0]!));
    expect(() => new World(duplicateBlocker)).toThrow(/Duplicate blocker id/);

    const duplicateLocation = createP1Specimen();
    duplicateLocation.locations.push(structuredClone(duplicateLocation.locations[0]!));
    expect(() => new World(duplicateLocation)).toThrow(/Duplicate location id/);

    const duplicateSite = createP1Specimen();
    duplicateSite.placementSites.push(structuredClone(duplicateSite.placementSites[0]!));
    expect(() => new World(duplicateSite)).toThrow(/Duplicate placement site id/);
  });

  it("rejects non-reciprocal or invalid held-item references during construction", () => {
    const missingItem = createP1Specimen();
    const missingPlayer = missingItem.entities.find((entity) => entity.id === "player.jozz");
    if (!missingPlayer || missingPlayer.kind !== "player") throw new Error("Missing player fixture.");
    missingPlayer.heldItemId = "missing.item";
    expect(() => new World(missingItem)).toThrow(/references missing or non-item held entity/);

    const oneWayActor = createP1Specimen();
    const actor = oneWayActor.entities.find((entity) => entity.id === "player.jozz");
    const mug = oneWayActor.entities.find((entity) => entity.id === "item.mug");
    if (!actor || actor.kind !== "player" || !mug || mug.kind !== "item") throw new Error("Missing ownership fixtures.");
    actor.heldItemId = mug.id;
    mug.heldBy = null;
    expect(() => new World(oneWayActor)).toThrow(/Held ownership mismatch/);

    const oneWayItem = createP1Specimen();
    const holder = oneWayItem.entities.find((entity) => entity.id === "player.jozz");
    const heldMug = oneWayItem.entities.find((entity) => entity.id === "item.mug");
    if (!holder || holder.kind !== "player" || !heldMug || heldMug.kind !== "item") throw new Error("Missing ownership fixtures.");
    heldMug.heldBy = holder.id;
    expect(() => new World(oneWayItem)).toThrow(/Held ownership mismatch/);
  });

  it("canonicalizes logically valid held-item start locality to the holder before the first snapshot", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") throw new Error("Missing held fixtures.");

    player.position = { x: 500, y: 500 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 1200, y: 120 };

    const world = new World(specimen);
    expect(world.tick).toBe(0);
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: player.id,
      position: { x: 500, y: 500 }
    });
  });

  it("rejects actors and free items whose authored footprints start outside bounds or inside blockers", () => {
    const actorOutside = createP1Specimen();
    const outsidePlayer = actorOutside.entities.find((entity) => entity.id === "player.jozz");
    if (!outsidePlayer || outsidePlayer.kind !== "player") throw new Error("Missing player fixture.");
    outsidePlayer.position = { x: -100, y: -100 };
    expect(() => new World(actorOutside)).toThrow(/Actor player\.jozz footprint must start inside world bounds/);

    const actorBlocked = createP1Specimen();
    const blockedPlayer = actorBlocked.entities.find((entity) => entity.id === "player.jozz");
    if (!blockedPlayer || blockedPlayer.kind !== "player") throw new Error("Missing player fixture.");
    blockedPlayer.position = { x: 970, y: 200 };
    expect(() => new World(actorBlocked)).toThrow(/Actor player\.jozz must not start inside blocker/);

    const itemOutside = createP1Specimen();
    const mug = itemOutside.entities.find((entity) => entity.id === "item.mug");
    if (!mug || mug.kind !== "item") throw new Error("Missing mug fixture.");
    mug.position = { x: -20, y: 650 };
    expect(() => new World(itemOutside)).toThrow(/Free item item\.mug footprint must start inside world bounds/);
  });

  it("allows a held item at a legal holder locality even when the old visual carry offset would leave world bounds", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") throw new Error("Missing held fixtures.");

    player.position = { x: 500, y: player.radius };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 500, y: 500 };

    const world = new World(specimen);
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: player.id,
      position: { x: 500, y: player.radius }
    });
  });

  it("requires a placement site's declared support blocker to spatially contain the site", () => {
    const specimen = createP1Specimen();
    const site = specimen.placementSites[0];
    if (!site) throw new Error("Missing placement site fixture.");
    site.supportBlockerId = "workshop.top";

    expect(() => new World(specimen)).toThrow(/Placement site yard\.table\.top must fit within support blocker: workshop\.top/);
  });
});
