import type { ResidentActivity, WorldRegion } from "./contracts";
import { SpcWorldRuntime } from "./spc-world-runtime";

export const FIVE_RESIDENT_REGIONS: readonly WorldRegion[] = [
  { id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 },
  { id: "workshop", label: "Workshop", minX: 1_400, minY: 0, maxX: 2_700, maxY: 1_500 },
  { id: "crossroads", label: "Crossroads", minX: 2_700, minY: 0, maxX: 4_000, maxY: 1_900 },
  { id: "fields", label: "Fields", minX: 900, minY: 1_500, maxX: 3_500, maxY: 3_500 },
  { id: "forest-edge", label: "Forest Edge", minX: 3_500, minY: 1_900, maxX: 5_300, maxY: 4_400 },
  { id: "old-road", label: "Old Road", minX: 4_000, minY: 0, maxX: 6_300, maxY: 1_900 },
  { id: "ruins", label: "Ruins", minX: 6_300, minY: 0, maxX: 8_192, maxY: 3_200 },
  { id: "deep-wilds", label: "Deep Wilds", minX: 3_500, minY: 4_400, maxX: 8_192, maxY: 8_192 },
];

export interface FiveResidentRolePressure {
  residentId: string;
  name: string;
  pressure: string;
}

export const FIVE_RESIDENT_ROLE_PRESSURES: readonly FiveResidentRolePressure[] = [
  { residentId: "resident.mira", name: "Mira", pressure: "settlement continuity and player contact" },
  { residentId: "resident.janek", name: "Janek", pressure: "future material work interruption and return" },
  { residentId: "resident.ida", name: "Ida", pressure: "social crossing and message delivery" },
  { residentId: "resident.oren", name: "Oren", pressure: "long-distance gathering and travel" },
  { residentId: "resident.nela", name: "Nela", pressure: "remote exploration and divergent history" },
];

export const FIVE_RESIDENT_FAMILIARITY: Readonly<Record<string, readonly string[]>> = {
  "resident.mira": ["hearth", "workshop", "fields", "crossroads"],
  "resident.janek": ["workshop", "hearth", "crossroads", "fields"],
  "resident.ida": ["crossroads", "workshop", "hearth", "fields", "old-road"],
  "resident.oren": ["forest-edge", "fields", "crossroads", "deep-wilds"],
  "resident.nela": ["ruins", "old-road", "crossroads", "deep-wilds"],
};

export function createFiveResidentRegionWorld(): SpcWorldRuntime {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 8_192, maxY: 8_192 },
    regions: FIVE_RESIDENT_REGIONS,
    chunkSize: 256,
    fixedDeltaSeconds: 1 / 60,
  });

  world.addPlayer("player.jozz", { x: 620, y: 620 }, { maxSpeed: 150 });
  world.addResident("resident.mira", "Mira", { x: 760, y: 650 });
  world.addResident("resident.janek", "Janek", { x: 1_900, y: 720 });
  world.addResident("resident.ida", "Ida", { x: 3_050, y: 880 });
  world.addResident("resident.oren", "Oren", { x: 4_650, y: 2_650 });
  world.addResident("resident.nela", "Nela", { x: 6_950, y: 1_100 });

  for (const [residentId, familiarRegions] of Object.entries(FIVE_RESIDENT_FAMILIARITY)) {
    world.familiarizeResidentWithRegions(residentId, familiarRegions);
  }

  world.setResidentActivity("resident.mira", activity("mira", "travel", { x: 1_050, y: 760 }, "walk through the settlement"));
  world.setResidentActivity("resident.janek", activity("janek", "idle", null, "between tasks at the workshop; no fake work mechanic"));
  world.setResidentActivity("resident.ida", activity("ida", "travel", { x: 3_500, y: 1_000 }, "cross the social junction"));
  world.setResidentActivity("resident.oren", activity("oren", "travel", { x: 5_100, y: 3_300 }, "head deeper along the forest edge"));
  world.setResidentActivity("resident.nela", activity("nela", "investigate", { x: 7_650, y: 1_700 }, "inspect the remote ruins"));

  return world;
}

function activity(
  id: string,
  kind: ResidentActivity["kind"],
  targetPosition: ResidentActivity["targetPosition"],
  reason: string,
): ResidentActivity {
  return {
    id: `activity:${id}:initial`,
    kind,
    targetActorId: null,
    targetPosition,
    text: null,
    speed: 95,
    reason,
  };
}
