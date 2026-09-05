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

export interface NpcEntity extends BaseEntity {
  kind: "npc";
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
}

export interface LocationZone {
  id: LocationId;
  label: string;
  bounds: Aabb;
}

export interface WorldSpecimen {
  width: number;
  height: number;
  playerSpeed: number;
  entities: WorldEntity[];
  blockers: Blocker[];
  locations: LocationZone[];
}

export interface WorldInput {
  moveX: number;
  moveY: number;
  interactPressed?: boolean;
  dropPressed?: boolean;
}

export type WorldEventType =
  | "world.started"
  | "location.entered"
  | "location.exited"
  | "item.picked_up"
  | "item.dropped"
  | "npc.interaction_requested"
  | "interaction.failed";

export interface WorldEvent {
  seq: number;
  tick: number;
  type: WorldEventType;
  actorId?: EntityId;
  entityId?: EntityId;
  locationId?: LocationId;
  message: string;
}

export interface WorldSnapshot {
  tick: number;
  width: number;
  height: number;
  entities: WorldEntity[];
  blockers: Blocker[];
  locations: LocationZone[];
  playerLocationId: LocationId | null;
}
