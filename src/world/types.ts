export type EntityId = string;
export type LocationId = string;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Aabb {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseEntity {
  id: EntityId;
  label: string;
  position: Vec2;
  radius: number;
}

export interface PlayerEntity extends BaseEntity {
  kind: "player";
  heldItemId: EntityId | null;
}

export interface NpcSenses {
  sightRange: number;
  sightHalfAngleDegrees: number;
  hearingRange: number;
}

export interface NpcEntity extends BaseEntity {
  kind: "npc";
  facingRadians: number;
  senses: NpcSenses;
}

export interface ItemEntity extends BaseEntity {
  kind: "item";
  heldBy: EntityId | null;
}

export type WorldEntity = PlayerEntity | NpcEntity | ItemEntity;

export interface Blocker {
  id: string;
  label: string;
  bounds: Aabb;
  occludesVision: boolean;
  dampensSound?: boolean;
}

export interface PlacementSurface {
  id: string;
  label: string;
  bounds: Aabb;
}

export interface LocationZone {
  id: LocationId;
  label: string;
  bounds: Aabb;
}

export interface SpeechInput {
  text: string;
  intensity: number;
}

export interface SoundStimulus {
  seq: number;
  tick: number;
  sourceId: EntityId;
  position: Vec2;
  text: string;
  intensity: number;
  audibleRange: number;
}

export interface WorldSpecimen {
  width: number;
  height: number;
  playerSpeed: number;
  entities: WorldEntity[];
  blockers: Blocker[];
  placementSurfaces: PlacementSurface[];
  locations: LocationZone[];
}

export interface WorldInput {
  moveX: number;
  moveY: number;
  interactPressed?: boolean;
  dropPressed?: boolean;
  dropTarget?: Vec2;
  speech?: SpeechInput;
}

export type WorldEventType =
  | "world.started"
  | "location.entered"
  | "location.exited"
  | "item.picked_up"
  | "item.dropped"
  | "item.drop_rejected"
  | "speech.emitted"
  | "npc.interaction_requested"
  | "interaction.failed";

export interface WorldEvent {
  seq: number;
  tick: number;
  type: WorldEventType;
  actorId?: EntityId;
  entityId?: EntityId;
  locationId?: LocationId;
  position?: Vec2;
  message: string;
}

export interface WorldSnapshot {
  tick: number;
  width: number;
  height: number;
  entities: WorldEntity[];
  blockers: Blocker[];
  placementSurfaces: PlacementSurface[];
  locations: LocationZone[];
  sounds: SoundStimulus[];
  playerLocationId: LocationId | null;
}
