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

export type PlacementRelation = "on";

export interface PlacementSite {
  id: string;
  label: string;
  relation: PlacementRelation;
  bounds: Aabb;
  supportBlockerId?: string;
}

export type PlacementSupport =
  | {
      kind: "ground";
      relation: "on";
    }
  | {
      kind: "site";
      siteId: string;
      relation: PlacementRelation;
    };

export type PlacementTargetRejectionCode =
  | "invalid_position"
  | "item_not_found"
  | "outside_world"
  | "ambiguous_site"
  | "item_does_not_fit_site"
  | "blocked";

export type PlacementTargetValidation =
  | {
      status: "accepted";
      itemId: EntityId;
      position: Vec2;
      support: PlacementSupport;
    }
  | {
      status: "rejected";
      itemId: EntityId;
      position: Vec2;
      code: PlacementTargetRejectionCode;
      candidateSiteIds?: string[];
      blockingBlockerIds?: string[];
    };

export interface WorldSpecimen {
  width: number;
  height: number;
  playerSpeed: number;
  entities: WorldEntity[];
  blockers: Blocker[];
  locations: LocationZone[];
  placementSites: PlacementSite[];
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
  | "item.dropped";

export interface WorldEvent {
  seq: number;
  tick: number;
  type: WorldEventType;
  actorId?: EntityId;
  entityId?: EntityId;
  locationId?: LocationId;
  message: string;
}

export type WorldActionKind = "interact" | "drop";

export type WorldActionResultCode =
  | "picked_up_item"
  | "npc_interaction_requested"
  | "no_interactable"
  | "dropped_item"
  | "not_holding_item";

export interface WorldActionResult {
  seq: number;
  tick: number;
  actorId: EntityId;
  action: WorldActionKind;
  status: "succeeded" | "rejected";
  code: WorldActionResultCode;
  targetId?: EntityId;
  message: string;
}

export interface WorldSnapshot {
  tick: number;
  width: number;
  height: number;
  entities: WorldEntity[];
  blockers: Blocker[];
  locations: LocationZone[];
  placementSites: PlacementSite[];
  playerLocationId: LocationId | null;
}
