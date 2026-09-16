import type { ResidentActivity, Vec2, WorldAnchor, WorldRegion } from "./contracts";
import type { MaterialObjectState } from "./material-world-state";
import type { ResidentRuntime } from "./resident-runtime";
import { SpcWorldRuntime } from "./spc-world-runtime";

export const FIVE_RESIDENT_REGIONS: readonly WorldRegion[] = [
  { id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 },
  { id: "workshop", label: "Workshop", minX: 1_400, minY: 0, maxX: 2_700, maxY: 1_500 },
  { id: "crossroads", label: "Crossroads", minX: 2_700, minY: 0, maxX: 4_000, maxY: 1_900, priority: 10 },
  { id: "fields", label: "Fields", minX: 900, minY: 1_500, maxX: 3_500, maxY: 3_500, priority: 0 },
  { id: "forest-edge", label: "Forest Edge", minX: 3_500, minY: 1_900, maxX: 5_300, maxY: 4_400 },
  { id: "old-road", label: "Old Road", minX: 4_000, minY: 0, maxX: 6_300, maxY: 1_900 },
  { id: "ruins", label: "Ruins", minX: 6_300, minY: 0, maxX: 8_192, maxY: 3_200 },
  { id: "deep-wilds", label: "Deep Wilds", minX: 3_500, minY: 4_400, maxX: 8_192, maxY: 8_192 },
];

export const FIVE_RESIDENT_ANCHORS: readonly WorldAnchor[] = [
  { id: "anchor.hearth.fire", label: "Common Fire", kind: "social", position: { x: 820, y: 760 }, radius: 52 },
  { id: "anchor.workshop.bench", label: "Workshop Bench", kind: "work", position: { x: 1_900, y: 760 }, radius: 58 },
  { id: "anchor.crossroads.board", label: "Crossroads Board", kind: "service", position: { x: 3_180, y: 980 }, radius: 42 },
  { id: "anchor.fields.well", label: "Field Well", kind: "resource", position: { x: 2_200, y: 2_350 }, radius: 54 },
  { id: "anchor.forest.cache", label: "Forest Cache", kind: "resource", position: { x: 4_760, y: 2_760 }, radius: 44 },
  { id: "anchor.ruins.threshold", label: "Ruins Threshold", kind: "exploration", position: { x: 7_150, y: 1_360 }, radius: 72 },
  { id: "anchor.wilds.lookout", label: "Wilds Lookout", kind: "exploration", position: { x: 5_250, y: 5_250 }, radius: 68 },
];

/** First factual material specimen for Janek pressure. It is World truth, not an anchor or activity label. */
export const FIVE_RESIDENT_MATERIAL_OBJECTS: readonly MaterialObjectState[] = [
  {
    id: "crate.workshop.01",
    label: "Workshop Crate",
    radius: 18,
    location: { kind: "free", position: { x: 1_952, y: 720 } },
  },
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

export type FiveResidentId =
  | "resident.mira"
  | "resident.janek"
  | "resident.ida"
  | "resident.oren"
  | "resident.nela";

export type FiveResidentRuntimes = Readonly<Record<FiveResidentId, ResidentRuntime>>;

export interface FiveResidentRegionWorldOptions {
  /** Authored participant start for bounded research specimens. Default preserves the baseline hearth start. */
  playerStart?: Vec2;
}

export interface FiveResidentRegionComposition {
  world: SpcWorldRuntime;
  /**
   * Private resident runtimes retained by the composition owner for cognition hosts
   * and bounded research slices. They are intentionally not exposed through World.
   */
  runtimes: FiveResidentRuntimes;
}

export function createFiveResidentRegionComposition(
  options: FiveResidentRegionWorldOptions = {},
): FiveResidentRegionComposition {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 8_192, maxY: 8_192 },
    regions: FIVE_RESIDENT_REGIONS,
    anchors: FIVE_RESIDENT_ANCHORS,
    chunkSize: 256,
    fixedDeltaSeconds: 1 / 60,
  });

  world.addPlayer("player.jozz", options.playerStart ?? { x: 620, y: 620 }, { maxSpeed: 150 });
  const runtimes: FiveResidentRuntimes = {
    "resident.mira": world.addResident("resident.mira", "Mira", { x: 760, y: 650 }),
    "resident.janek": world.addResident("resident.janek", "Janek", { x: 1_900, y: 720 }),
    "resident.ida": world.addResident("resident.ida", "Ida", { x: 3_050, y: 880 }),
    "resident.oren": world.addResident("resident.oren", "Oren", { x: 4_650, y: 2_650 }),
    "resident.nela": world.addResident("resident.nela", "Nela", { x: 6_950, y: 1_100 }),
  };
  for (const object of FIVE_RESIDENT_MATERIAL_OBJECTS) world.addMaterialObject(object);

  for (const [residentId, familiarRegions] of Object.entries(FIVE_RESIDENT_FAMILIARITY)) {
    world.familiarizeResidentWithRegions(residentId, familiarRegions);
  }

  world.setResidentActivity("resident.mira", activity("mira", "travel", { x: 1_050, y: 760 }, "walk through the settlement"));
  world.setResidentActivity("resident.janek", activity("janek", "idle", null, "between tasks at the workshop; no fake work mechanic"));
  world.setResidentActivity("resident.ida", activity("ida", "travel", { x: 3_500, y: 1_000 }, "cross the social junction"));
  world.setResidentActivity("resident.oren", activity("oren", "travel", { x: 5_100, y: 3_300 }, "head deeper along the forest edge"));
  world.setResidentActivity("resident.nela", activity("nela", "investigate", { x: 7_650, y: 1_700 }, "inspect the remote ruins"));

  return { world, runtimes };
}

export function createFiveResidentRegionWorld(options: FiveResidentRegionWorldOptions = {}): SpcWorldRuntime {
  return createFiveResidentRegionComposition(options).world;
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
    speed: kind === "idle" || kind === "work" ? null : 95,
    reason,
  };
}
