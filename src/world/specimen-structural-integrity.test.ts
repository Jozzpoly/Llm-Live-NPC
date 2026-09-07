import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { validateWorldSpecimenStructure } from "./specimen-structural-validation";
import { World } from "./world";

describe("recovery R2 structural integrity", () => {
  it("rejects non-finite or invalid-negative structural scalars and authored geometry primitives", () => {
    const invalidCases: Array<[string, (specimen: ReturnType<typeof createP1Specimen>) => void, RegExp]> = [
      ["world width", (specimen) => { specimen.width = Number.NaN; }, /World width must be finite and positive/],
      ["world height", (specimen) => { specimen.height = 0; }, /World height must be finite and positive/],
      ["actor speed finite", (specimen) => { specimen.actorSpeed = Number.POSITIVE_INFINITY; }, /World actorSpeed must be finite and non-negative/],
      ["actor speed negative", (specimen) => { specimen.actorSpeed = -1; }, /World actorSpeed must be finite and non-negative/],
      ["entity position", (specimen) => { specimen.entities[0]!.position.x = Number.NaN; }, /position must be finite/],
      ["entity radius", (specimen) => { specimen.entities[0]!.radius = -1; }, /radius must be finite and non-negative/],
      ["blocker bounds", (specimen) => { specimen.blockers[0]!.bounds.width = -1; }, /Blocker .* width must be finite and non-negative/],
      ["location bounds", (specimen) => { specimen.locations[0]!.bounds.x = Number.NaN; }, /Location .* origin must be finite/],
      ["site bounds", (specimen) => { specimen.placementSites[0]!.bounds.height = -1; }, /Placement site .* height must be finite and non-negative/]
    ];

    for (const [label, mutate, message] of invalidCases) {
      const specimen = createP1Specimen();
      mutate(specimen);
      expect(() => new World(specimen), label).toThrow(message);
    }
  });

  it("admits coherent zero-valued speed, radii and AABB extents", () => {
    const specimen = createP1Specimen();
    specimen.actorSpeed = 0;

    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing zero-valued fixtures.");
    }
    player.radius = 0;
    mug.radius = 0;
    specimen.blockers[0]!.bounds.width = 0;
    specimen.locations[0]!.bounds.width = 0;
    specimen.placementSites[0]!.bounds.width = 0;

    expect(() => new World(specimen)).not.toThrow();
  });

  it("requires unique IDs within every current semantic namespace", () => {
    const duplicateEntity = createP1Specimen();
    duplicateEntity.entities.push(structuredClone(duplicateEntity.entities[0]!));
    expect(() => new World(duplicateEntity)).toThrow(/Duplicate entity id/);

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

  it("scopes the current v0 runtime to one canonical player because its control path is singular", () => {
    const noPlayer = createP1Specimen();
    noPlayer.entities = noPlayer.entities.filter((entity) => entity.kind !== "player");
    expect(() => new World(noPlayer)).toThrow(/Current v0 World runtime requires exactly one player entity; received 0/);

    const twoPlayers = createP1Specimen();
    const player = twoPlayers.entities.find((entity) => entity.id === "player.jozz");
    if (!player || player.kind !== "player") throw new Error("Missing player fixture.");
    const alternate = structuredClone(player);
    alternate.id = "player.alt";
    twoPlayers.entities.push(alternate);
    expect(() => new World(twoPlayers)).toThrow(/Current v0 World runtime requires exactly one player entity; received 2/);
  });

  it("requires reciprocal one-to-one held-item ownership with valid referent kinds", () => {
    const actorOnly = createP1Specimen();
    const actorOnlyPlayer = actorOnly.entities.find((entity) => entity.id === "player.jozz");
    const actorOnlyMug = actorOnly.entities.find((entity) => entity.id === "item.mug");
    if (!actorOnlyPlayer || actorOnlyPlayer.kind !== "player" || !actorOnlyMug || actorOnlyMug.kind !== "item") {
      throw new Error("Missing actor-only fixtures.");
    }
    actorOnlyPlayer.heldItemId = actorOnlyMug.id;
    actorOnlyMug.heldBy = null;
    expect(() => new World(actorOnly)).toThrow(/Held ownership mismatch/);

    const itemOnly = createP1Specimen();
    const itemOnlyPlayer = itemOnly.entities.find((entity) => entity.id === "player.jozz");
    const itemOnlyMug = itemOnly.entities.find((entity) => entity.id === "item.mug");
    if (!itemOnlyPlayer || itemOnlyPlayer.kind !== "player" || !itemOnlyMug || itemOnlyMug.kind !== "item") {
      throw new Error("Missing item-only fixtures.");
    }
    itemOnlyMug.heldBy = itemOnlyPlayer.id;
    expect(() => new World(itemOnly)).toThrow(/Held ownership mismatch/);

    const missingItem = createP1Specimen();
    const missingPlayer = missingItem.entities.find((entity) => entity.id === "player.jozz");
    if (!missingPlayer || missingPlayer.kind !== "player") throw new Error("Missing player fixture.");
    missingPlayer.heldItemId = "missing.item";
    expect(() => new World(missingItem)).toThrow(/references missing or non-item held entity/);

    const twoActors = createP1Specimen();
    const first = twoActors.entities.find((entity) => entity.id === "player.jozz");
    const second = twoActors.entities.find((entity) => entity.id === "npc.001");
    const shared = twoActors.entities.find((entity) => entity.id === "item.mug");
    if (!first || first.kind !== "player" || !second || second.kind !== "npc" || !shared || shared.kind !== "item") {
      throw new Error("Missing shared ownership fixtures.");
    }
    first.heldItemId = shared.id;
    second.heldItemId = shared.id;
    shared.heldBy = first.id;
    expect(() => new World(twoActors)).toThrow(/Held item is referenced by more than one actor/);
  });

  it("keeps support reference existence structural without imposing spatial containment policy", () => {
    const missingSupport = createP1Specimen();
    missingSupport.placementSites[0]!.supportBlockerId = "missing.blocker";
    expect(() => new World(missingSupport)).toThrow(/references missing support blocker/);

    const spatiallyElsewhere = createP1Specimen();
    spatiallyElsewhere.placementSites[0]!.supportBlockerId = "workshop.top";
    expect(() => new World(spatiallyElsewhere)).not.toThrow();
  });

  it("does not smuggle actor/free-item spawn topology policy into structural integrity", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing topology fixtures.");
    }

    player.position = { x: 970, y: 200 };
    mug.position = { x: -20, y: 650 };

    expect(() => new World(specimen)).not.toThrow();
  });

  it("does not canonicalize or reject held-item attachment geometry as part of structural validation", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing held-item fixtures.");
    }

    player.position = { x: 500, y: player.radius };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 500, y: -10 };

    expect(() => validateWorldSpecimenStructure(specimen)).not.toThrow();
    expect(mug).toMatchObject({
      heldBy: player.id,
      position: { x: 500, y: -10 }
    });
  });
});
