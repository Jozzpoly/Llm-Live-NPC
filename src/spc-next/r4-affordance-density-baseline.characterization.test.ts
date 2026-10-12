import { describe, expect, it } from "vitest";
import {
  createFiveResidentRegionWorld,
  FIVE_RESIDENT_ANCHORS,
  FIVE_RESIDENT_MATERIAL_OBJECTS,
  FIVE_RESIDENT_REGIONS,
} from "./five-resident-region";

describe("R4 substrate history against a gradually populated five-resident World", () => {
  it("records that the geographically large five-resident substrate is still sparse, despite meaningful pickupable material additions", () => {
    const world = createFiveResidentRegionWorld();

    expect(world.options.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 8_192,
      maxY: 8_192,
    });
    expect(FIVE_RESIDENT_REGIONS).toHaveLength(8);
    expect(FIVE_RESIDENT_ANCHORS).toHaveLength(7);
    // Historical R4 began with one crate; current playable World has eleven
    // genuinely registered movable identities, four of them uncommitted future
    // opportunities. This remains sparse in an 8,192² World and does NOT prove
    // resident-initiated long-term ecology.
    expect(FIVE_RESIDENT_MATERIAL_OBJECTS).toHaveLength(11);

    expect(world.regions()).toHaveLength(8);
    expect(world.anchors()).toHaveLength(7);
    expect(world.materialObjects().map(object => object.id)).toEqual([
      "basket.hearth.01",
      "bucket.fields.01",
      "bundle.forest.01",
      "crate.workshop.01",
      "crate.workshop.02",
      "fragment.ruins.01",
      "kindling.hearth.02",
      "parcel.crossroads.01",
      "satchel.crossroads.02",
      "tablet.ruins.02",
      "timber.forest.02",
    ]);
    expect(world.materialObject("crate.workshop.01")).toMatchObject({
      location: { kind: "free", position: { x: 1_952, y: 720 } },
    });
  });

  it("shows that authored opening activities terminate without creating a continuing material-life surface", () => {
    const world = createFiveResidentRegionWorld();
    const initialCrate = world.materialObject("crate.workshop.01");

    world.step(900);

    expect(world.tick).toBe(900);
    expect(world.publicSnapshot().residents).toHaveLength(5);
    expect(world.publicSnapshot().residents.map((resident) => resident.activity.kind))
      .toEqual(["idle", "idle", "idle", "idle", "idle"]);

    // This is a characterization of the current baseline, not a claim that stillness
    // is inherently dead. R1 already proved legitimate quiet. The R4 gap is that this
    // composition has no resident-caused material continuation after its authored
    // opening directives finish.
    expect(world.diagnostics().recentMaterialActions).toEqual([]);
    expect(world.materialObject("crate.workshop.01")).toEqual(initialCrate);
  });

  it("does not mistake substrate survival for new affordance-driven consequences", () => {
    const world = createFiveResidentRegionWorld();

    world.step(6_000);

    expect(world.tick).toBe(6_000);
    expect(world.publicSnapshot().residents).toHaveLength(5);
    expect(world.materialObjects()).toHaveLength(11);
    expect(world.diagnostics().recentMaterialActions).toEqual([]);

    // The World remains stable and residents remain present, which is valuable
    // substrate evidence. R4 exists because this alone does not demonstrate that
    // ordinary local possibilities keep generating resident-owned causal life.
    for (const resident of world.publicSnapshot().residents) {
      expect(world.residentDiagnostics(resident.id).recentPercepts.length).toBeLessThanOrEqual(128);
      expect(world.residentDiagnostics(resident.id).trace.length).toBeLessThanOrEqual(256);
    }
  });
});
