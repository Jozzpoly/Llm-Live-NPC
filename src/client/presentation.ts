import type { Blocker, LocationId, WorldEntity } from "../world/types";

export const PRESENTATION_DEPTH = {
  ground: 0,
  scenery: 2,
  actors: 6,
  overhead: 7,
  effects: 12,
  debug: 20
} as const;

export interface EntityVisualDescriptor {
  fillColor: number;
  strokeColor: number;
  strokeAlpha: number;
  depth: number;
  labelFontSize: string;
}

export interface BlockerVisualDescriptor {
  fillColor: number;
  fillAlpha: number;
  strokeColor: number;
  strokeAlpha: number;
  depth: number;
}

export interface LocationVisualDescriptor {
  fillColor: number;
  fillAlpha: number;
  depth: number;
}

const entityVisuals: Record<WorldEntity["kind"], EntityVisualDescriptor> = {
  player: {
    fillColor: 0x79d8ff,
    strokeColor: 0x0b0e12,
    strokeAlpha: 0.9,
    depth: PRESENTATION_DEPTH.actors,
    labelFontSize: "12px"
  },
  npc: {
    fillColor: 0xffc46b,
    strokeColor: 0x0b0e12,
    strokeAlpha: 0.9,
    depth: PRESENTATION_DEPTH.actors,
    labelFontSize: "12px"
  },
  item: {
    fillColor: 0xece6cf,
    strokeColor: 0x0b0e12,
    strokeAlpha: 0.9,
    depth: PRESENTATION_DEPTH.actors - 1,
    labelFontSize: "11px"
  }
};

const locationColors: Partial<Record<LocationId, number>> = {
  workshop: 0x5e7080,
  cottage: 0x826956,
  grove: 0x456d50,
  "north-path": 0x70695a
};

export function resolveEntityVisual(entity: WorldEntity): EntityVisualDescriptor {
  return entityVisuals[entity.kind];
}

export function resolveBlockerVisual(blocker: Blocker): BlockerVisualDescriptor {
  return {
    fillColor: blocker.occludesVision ? 0x4d5963 : 0x66523d,
    fillAlpha: 0.95,
    strokeColor: 0xaab5bd,
    strokeAlpha: blocker.occludesVision ? 0.35 : 0.2,
    depth: PRESENTATION_DEPTH.scenery
  };
}

export function resolveLocationVisual(id: LocationId): LocationVisualDescriptor {
  return {
    fillColor: locationColors[id] ?? 0x536c61,
    fillAlpha: 0.16,
    depth: PRESENTATION_DEPTH.ground
  };
}
