import type { Blocker, LocationId, WorldEntity } from "../world/types";

export const PRESENTATION_DEPTH = {
  ground: 0,
  scenery: 2,
  actors: 6,
  overhead: 7,
  effects: 12,
  debug: 20
} as const;

export type EntityGlyph = "player" | "npc" | "mug" | "hammer" | "lantern" | "item";
export type BlockerGlyph = "wall" | "table" | "blocker";
export type LocationTreatment = "yard" | "zone";

export interface EntityVisualDescriptor {
  glyph: EntityGlyph;
  fillColor: number;
  secondaryColor: number;
  strokeColor: number;
  strokeAlpha: number;
  shadowAlpha: number;
  depth: number;
  labelFontSize: string;
}

export interface BlockerVisualDescriptor {
  glyph: BlockerGlyph;
  fillColor: number;
  secondaryColor: number;
  fillAlpha: number;
  strokeColor: number;
  strokeAlpha: number;
  depth: number;
}

export interface LocationVisualDescriptor {
  treatment: LocationTreatment;
  fillColor: number;
  fillAlpha: number;
  strokeColor: number;
  strokeAlpha: number;
  depth: number;
}

const actorVisuals: Record<"player" | "npc", EntityVisualDescriptor> = {
  player: {
    glyph: "player",
    fillColor: 0x78c9ea,
    secondaryColor: 0xc9efff,
    strokeColor: 0x183541,
    strokeAlpha: 0.95,
    shadowAlpha: 0.26,
    depth: PRESENTATION_DEPTH.actors,
    labelFontSize: "12px"
  },
  npc: {
    glyph: "npc",
    fillColor: 0xd99a54,
    secondaryColor: 0xffd292,
    strokeColor: 0x4b321e,
    strokeAlpha: 0.95,
    shadowAlpha: 0.26,
    depth: PRESENTATION_DEPTH.actors,
    labelFontSize: "12px"
  }
};

const itemVisuals: Record<string, Omit<EntityVisualDescriptor, "depth" | "labelFontSize">> = {
  "item.mug": {
    glyph: "mug",
    fillColor: 0xc85b5b,
    secondaryColor: 0xf0a2a2,
    strokeColor: 0x542525,
    strokeAlpha: 0.95,
    shadowAlpha: 0.2
  },
  "item.hammer": {
    glyph: "hammer",
    fillColor: 0x9da6aa,
    secondaryColor: 0x8d603b,
    strokeColor: 0x30383b,
    strokeAlpha: 0.95,
    shadowAlpha: 0.2
  },
  "item.lantern": {
    glyph: "lantern",
    fillColor: 0xe2a84b,
    secondaryColor: 0xffdf72,
    strokeColor: 0x5e4419,
    strokeAlpha: 0.95,
    shadowAlpha: 0.2
  }
};

const fallbackItemVisual: Omit<EntityVisualDescriptor, "depth" | "labelFontSize"> = {
  glyph: "item",
  fillColor: 0xded8c2,
  secondaryColor: 0xf5f0df,
  strokeColor: 0x4a4840,
  strokeAlpha: 0.9,
  shadowAlpha: 0.18
};

const locationColors: Partial<Record<LocationId, number>> = {
  workshop: 0x586c78,
  cottage: 0x745f50,
  grove: 0x3e6548,
  "north-path": 0x6c634f,
  yard: 0x35533a
};

export function resolveEntityVisual(entity: WorldEntity): EntityVisualDescriptor {
  if (entity.kind === "player" || entity.kind === "npc") return actorVisuals[entity.kind];

  const item = itemVisuals[entity.id] ?? fallbackItemVisual;
  return {
    ...item,
    depth: PRESENTATION_DEPTH.actors - 1,
    labelFontSize: "11px"
  };
}

export function resolveBlockerVisual(blocker: Blocker): BlockerVisualDescriptor {
  if (blocker.id === "yard.table") {
    return {
      glyph: "table",
      fillColor: 0x765033,
      secondaryColor: 0xa7764d,
      fillAlpha: 1,
      strokeColor: 0x392618,
      strokeAlpha: 0.75,
      depth: PRESENTATION_DEPTH.scenery
    };
  }

  return {
    glyph: blocker.occludesVision ? "wall" : "blocker",
    fillColor: blocker.occludesVision ? 0x4d5963 : 0x66523d,
    secondaryColor: blocker.occludesVision ? 0x66727b : 0x80694d,
    fillAlpha: 0.95,
    strokeColor: 0xaab5bd,
    strokeAlpha: blocker.occludesVision ? 0.35 : 0.2,
    depth: PRESENTATION_DEPTH.scenery
  };
}

export function resolveLocationVisual(id: LocationId): LocationVisualDescriptor {
  const isYard = id === "yard";
  return {
    treatment: isYard ? "yard" : "zone",
    fillColor: locationColors[id] ?? 0x536c61,
    fillAlpha: isYard ? 0.42 : 0.16,
    strokeColor: isYard ? 0x70906f : 0x8ea096,
    strokeAlpha: isYard ? 0.22 : 0.08,
    depth: PRESENTATION_DEPTH.ground
  };
}
