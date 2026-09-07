import { describe, expect, it } from "vitest";
import { createP1Specimen } from "./specimen";
import { World } from "./world";

describe("recovery R2 empty-ID structural contract", () => {
  it("rejects empty IDs in every current semantic namespace", () => {
    const cases: Array<[string, (specimen: ReturnType<typeof createP1Specimen>) => void, RegExp]> = [
      ["entity", (specimen) => { specimen.entities[2]!.id = ""; }, /Entity id must not be empty/],
      ["blocker", (specimen) => { specimen.blockers[0]!.id = ""; }, /Blocker id must not be empty/],
      ["location", (specimen) => { specimen.locations[0]!.id = ""; }, /Location id must not be empty/],
      ["placement site", (specimen) => { specimen.placementSites[0]!.id = ""; }, /Placement site id must not be empty/]
    ];

    for (const [label, mutate, message] of cases) {
      const specimen = createP1Specimen();
      mutate(specimen);
      expect(() => new World(specimen), label).toThrow(message);
    }
  });

  it("does not treat an empty heldItemId string as the null sentinel", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    if (!player || player.kind !== "player") throw new Error("Missing player fixture.");
    player.heldItemId = "";

    expect(() => new World(specimen)).toThrow(/references missing or non-item held entity/);
  });

  it("does not treat an empty heldBy string as the null sentinel", () => {
    const specimen = createP1Specimen();
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!mug || mug.kind !== "item") throw new Error("Missing mug fixture.");
    mug.heldBy = "";

    expect(() => new World(specimen)).toThrow(/references missing or non-actor holder/);
  });

  it("does not treat an explicitly empty supportBlockerId as an omitted optional reference", () => {
    const specimen = createP1Specimen();
    specimen.placementSites[0]!.supportBlockerId = "";

    expect(() => new World(specimen)).toThrow(/Placement site .* supportBlockerId must not be empty/);
  });
});
