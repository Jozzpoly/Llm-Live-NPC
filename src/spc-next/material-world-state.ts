import type { Vec2, WorldBounds } from "./contracts";

export type MaterialObjectLocation =
  | { kind: "free"; position: Vec2; actorId?: never }
  | { kind: "held"; actorId: string; position?: never };

/** Authoritative origin of a transformed output, not automatically resident knowledge. */
export interface MaterialWorkDerivation {
  kind:"worksite_transformation";
  sourceObjectId:string;
  siteId:string;
  actorId:string;
  tick:number;
}
export interface MaterialObjectState {
  id: string;
  label: string;
  radius: number;
  location: MaterialObjectLocation;
  /** Only World-owned conversion may assign this to a produced material. */
  derivation?: MaterialWorkDerivation;
}

export type MaterialActionRequest =
  | { kind: "pickup"; actorId: string; objectId: string; actorPosition: Vec2; lineOfSight: boolean }
  | { kind: "place"; actorId: string; objectId: string; actorPosition: Vec2; position: Vec2; lineOfSight: boolean };

export type MaterialActionResultCode =
  | "picked_up"
  | "placed"
  | "object_not_found"
  | "object_unavailable"
  | "actor_already_holding"
  | "actor_not_holder"
  | "out_of_range"
  | "occluded"
  | "invalid_position"
  | "outside_world";

export interface MaterialActionResult {
  actionSeq: number;
  tick: number;
  actorId: string;
  objectId: string;
  kind: MaterialActionRequest["kind"];
  status: "succeeded" | "rejected";
  code: MaterialActionResultCode;
  before: MaterialObjectState | null;
  after: MaterialObjectState | null;
}

export interface MaterialWorldStateOptions {
  bounds: WorldBounds;
  interactionRange: number;
}

/**
 * World-owned material identity and possession truth for the first SPC life slice.
 *
 * Deliberately narrow:
 * - not inventory/economy/ownership;
 * - not resident knowledge;
 * - not rendering or collision geometry;
 * - not a generic affordance framework.
 *
 * `held` is a persistent World relation, not a continuously re-issued resident
 * command. A successful action commits material truth before any later sensory or
 * research observer is allowed to interpret that fact.
 */
export class MaterialWorldState {
  private readonly objectsById = new Map<string, MaterialObjectState>();
  private actionSequence = 0;
  private readonly bounds: WorldBounds;
  private readonly interactionRange: number;

  constructor(options: MaterialWorldStateOptions) {
    validateBounds(options.bounds);
    if (!Number.isFinite(options.interactionRange) || options.interactionRange <= 0) {
      throw new Error("material interactionRange must be positive and finite");
    }
    this.bounds = structuredClone(options.bounds);
    this.interactionRange = options.interactionRange;
  }

  addObject(object: MaterialObjectState): MaterialObjectState {
    validateObject(object, this.bounds);
    if (this.objectsById.has(object.id)) throw new Error(`material object already exists: ${object.id}`);
    if (object.location.kind === "held" && this.heldObjectId(object.location.actorId) !== null) {
      throw new Error(`actor already holds a material object: ${object.location.actorId}`);
    }
    const stored = structuredClone(object);
    this.objectsById.set(stored.id, stored);
    return structuredClone(stored);
  }

  object(id: string): MaterialObjectState | null {
    const object = this.objectsById.get(id);
    return object ? structuredClone(object) : null;
  }

  objects(): MaterialObjectState[] {
    return [...this.objectsById.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((object) => structuredClone(object));
  }

  /** Atomic conversion only after World's actor + site + elapsed-time checks. */
  consumeHeldAndProduce(
    actorId: string, sourceId: string, output: MaterialObjectState,
    siteId:string, tick:number,
  ): { source: MaterialObjectState; output: MaterialObjectState } | null {
    const held = this.objectsById.get(sourceId);
    if (!held || held.location.kind !== "held" || held.location.actorId !== actorId) return null;
    if (sourceId === output.id || this.objectsById.has(output.id)
      || output.location.kind !== "free") return null;
    validateObject(output, this.bounds);
    const source = structuredClone(held);
    if(!siteId.trim() || !Number.isSafeInteger(tick) || tick < 0) {
      throw new Error("worksite derivation must have factual origin and tick");
    }
    const produced:MaterialObjectState = {
      ...structuredClone(output),
      derivation:{kind:"worksite_transformation",sourceObjectId:sourceId,siteId,actorId,tick},
    };
    this.objectsById.delete(sourceId);
    this.objectsById.set(produced.id, produced);
    return {source, output:structuredClone(produced)};
  }
  heldObjectId(actorId: string): string | null {
    for (const object of this.objectsById.values()) {
      if (object.location.kind === "held" && object.location.actorId === actorId) return object.id;
    }
    return null;
  }

  attempt(request: MaterialActionRequest, tick: number): MaterialActionResult {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("material action tick must be a non-negative safe integer");
    validateActorId(request.actorId);
    validateActorPosition(request.actorPosition);
    const actionSeq = ++this.actionSequence;
    const object = this.objectsById.get(request.objectId);
    if (!object) {
      return rejected(actionSeq, tick, request, "object_not_found", null);
    }
    const before = structuredClone(object);

    if (request.kind === "pickup") {
      if (object.location.kind !== "free") {
        return rejected(actionSeq, tick, request, "object_unavailable", before);
      }
      if (this.heldObjectId(request.actorId) !== null) {
        return rejected(actionSeq, tick, request, "actor_already_holding", before);
      }
      if (!withinRange(request.actorPosition, object.location.position, this.interactionRange)) {
        return rejected(actionSeq, tick, request, "out_of_range", before);
      }
      if (!request.lineOfSight) {
        return rejected(actionSeq, tick, request, "occluded", before);
      }

      object.location = { kind: "held", actorId: request.actorId };
      return succeeded(actionSeq, tick, request, "picked_up", before, object);
    }

    if (object.location.kind !== "held" || object.location.actorId !== request.actorId) {
      return rejected(actionSeq, tick, request, "actor_not_holder", before);
    }
    if (!finitePoint(request.position)) {
      return rejected(actionSeq, tick, request, "invalid_position", before);
    }
    if (!pointFitsBounds(request.position, object.radius, this.bounds)) {
      return rejected(actionSeq, tick, request, "outside_world", before);
    }
    if (!withinRange(request.actorPosition, request.position, this.interactionRange)) {
      return rejected(actionSeq, tick, request, "out_of_range", before);
    }
    if (!request.lineOfSight) {
      return rejected(actionSeq, tick, request, "occluded", before);
    }

    object.location = { kind: "free", position: { ...request.position } };
    return succeeded(actionSeq, tick, request, "placed", before, object);
  }
}

function succeeded(
  actionSeq: number,
  tick: number,
  request: MaterialActionRequest,
  code: Extract<MaterialActionResultCode, "picked_up" | "placed">,
  before: MaterialObjectState,
  after: MaterialObjectState,
): MaterialActionResult {
  return {
    actionSeq,
    tick,
    actorId: request.actorId,
    objectId: request.objectId,
    kind: request.kind,
    status: "succeeded",
    code,
    before: structuredClone(before),
    after: structuredClone(after),
  };
}

function rejected(
  actionSeq: number,
  tick: number,
  request: MaterialActionRequest,
  code: Exclude<MaterialActionResultCode, "picked_up" | "placed">,
  before: MaterialObjectState | null,
): MaterialActionResult {
  return {
    actionSeq,
    tick,
    actorId: request.actorId,
    objectId: request.objectId,
    kind: request.kind,
    status: "rejected",
    code,
    before: before ? structuredClone(before) : null,
    after: before ? structuredClone(before) : null,
  };
}

function withinRange(a: Vec2, b: Vec2, range: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= range * range;
}

function finitePoint(value: Vec2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function pointFitsBounds(point: Vec2, radius: number, bounds: WorldBounds): boolean {
  return point.x - radius >= bounds.minX
    && point.x + radius <= bounds.maxX
    && point.y - radius >= bounds.minY
    && point.y + radius <= bounds.maxY;
}

function validateObject(object: MaterialObjectState, bounds: WorldBounds): void {
  if (!object.id.trim()) throw new Error("material object id must be non-empty");
  if (!object.label.trim()) throw new Error("material object label must be non-empty");
  if (!Number.isFinite(object.radius) || object.radius <= 0) throw new Error("material object radius must be positive and finite");
  if(object.derivation){
    const d=object.derivation;
    if(d.kind!=="worksite_transformation" || !d.sourceObjectId.trim()
      || !d.siteId.trim() || !d.actorId.trim() || !Number.isSafeInteger(d.tick) || d.tick<0){
      throw new Error("invalid material origin");
    }
  }
  if (object.location.kind === "free") {
    if (!finitePoint(object.location.position)) throw new Error("free material object position must be finite");
    if (!pointFitsBounds(object.location.position, object.radius, bounds)) throw new Error("free material object must fit World bounds");
  } else {
    validateActorId(object.location.actorId);
  }
}

function validateActorId(actorId: string): void {
  if (typeof actorId !== "string" || actorId.trim().length === 0) throw new Error("material actor id must be non-empty");
}

function validateActorPosition(position: Vec2): void {
  if (!finitePoint(position)) throw new Error("material actor position must be finite");
}

function validateBounds(bounds: WorldBounds): void {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)
    || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    throw new Error("material World bounds must be finite and non-empty");
  }
}
