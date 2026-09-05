import type { Blocker, LocationZone, PlacementSite, WorldEntity, WorldSpecimen } from "./types";

const entities: WorldEntity[] = [
  {
    id: "player.jozz",
    kind: "player",
    label: "Jozz",
    position: { x: 610, y: 420 },
    radius: 16,
    heldItemId: null,
    facing: { x: 1, y: 0 }
  },
  {
    id: "npc.001",
    kind: "npc",
    label: "NPC-001",
    position: { x: 760, y: 390 },
    radius: 16,
    heldItemId: null,
    facing: { x: -1, y: 0 }
  },
  {
    id: "item.hammer",
    kind: "item",
    label: "Hammer",
    position: { x: 1120, y: 300 },
    radius: 10,
    heldBy: null
  },
  {
    id: "item.mug",
    kind: "item",
    label: "Red mug",
    position: { x: 290, y: 650 },
    radius: 9,
    heldBy: null
  },
  {
    id: "item.lantern",
    kind: "item",
    label: "Lantern",
    position: { x: 1060, y: 670 },
    radius: 10,
    heldBy: null
  }
];

const blockers: Blocker[] = [
  { id: "workshop.top", label: "Workshop north wall", bounds: { x: 960, y: 140, width: 360, height: 20 }, occludesVision: true },
  { id: "workshop.bottom", label: "Workshop south wall", bounds: { x: 960, y: 440, width: 360, height: 20 }, occludesVision: true },
  { id: "workshop.right", label: "Workshop east wall", bounds: { x: 1300, y: 140, width: 20, height: 320 }, occludesVision: true },
  { id: "workshop.left.north", label: "Workshop west wall", bounds: { x: 960, y: 140, width: 20, height: 120 }, occludesVision: true },
  { id: "workshop.left.south", label: "Workshop west wall", bounds: { x: 960, y: 340, width: 20, height: 120 }, occludesVision: true },

  { id: "cottage.top", label: "Cottage north wall", bounds: { x: 120, y: 520, width: 360, height: 20 }, occludesVision: true },
  { id: "cottage.bottom", label: "Cottage south wall", bounds: { x: 120, y: 770, width: 360, height: 20 }, occludesVision: true },
  { id: "cottage.left", label: "Cottage west wall", bounds: { x: 120, y: 520, width: 20, height: 270 }, occludesVision: true },
  { id: "cottage.right.north", label: "Cottage east wall", bounds: { x: 460, y: 520, width: 20, height: 90 }, occludesVision: true },
  { id: "cottage.right.south", label: "Cottage east wall", bounds: { x: 460, y: 690, width: 20, height: 100 }, occludesVision: true },

  { id: "yard.table", label: "Yard work table", bounds: { x: 690, y: 510, width: 120, height: 44 }, occludesVision: false },
  { id: "grove.tree.1", label: "Old tree", bounds: { x: 1010, y: 590, width: 54, height: 54 }, occludesVision: true },
  { id: "grove.tree.2", label: "Old tree", bounds: { x: 1170, y: 690, width: 60, height: 60 }, occludesVision: true },
  { id: "grove.tree.3", label: "Old tree", bounds: { x: 1260, y: 570, width: 48, height: 48 }, occludesVision: true }
];

const locations: LocationZone[] = [
  { id: "workshop", label: "Workshop", bounds: { x: 980, y: 160, width: 320, height: 280 } },
  { id: "cottage", label: "Cottage", bounds: { x: 140, y: 540, width: 320, height: 230 } },
  { id: "grove", label: "Grove", bounds: { x: 930, y: 530, width: 400, height: 290 } },
  { id: "yard", label: "Common Yard", bounds: { x: 420, y: 190, width: 510, height: 440 } },
  { id: "north-path", label: "North Path", bounds: { x: 490, y: 40, width: 380, height: 140 } }
];

const placementSites: PlacementSite[] = [
  {
    id: "yard.table.top",
    label: "Yard work table top",
    relation: "on",
    bounds: { x: 690, y: 510, width: 120, height: 44 },
    supportBlockerId: "yard.table"
  }
];

export function createP1Specimen(): WorldSpecimen {
  return {
    width: 1440,
    height: 900,
    actorSpeed: 190,
    entities: structuredClone(entities),
    blockers: structuredClone(blockers),
    locations: structuredClone(locations),
    placementSites: structuredClone(placementSites)
  };
}
