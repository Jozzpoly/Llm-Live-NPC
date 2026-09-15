import {
  clamp,
  type ActorState,
  type ResidentActivity,
  type ResidentProfile,
  type SpcWorldOptions,
  type Vec2,
  type WorldBounds,
  type WorldRegion,
} from "./contracts";

export function validateWorldOptions(options: SpcWorldOptions): void {
  validateBounds(options.bounds);
  if (!Number.isFinite(options.fixedDeltaSeconds) || options.fixedDeltaSeconds <= 0) {
    throw new Error("fixedDeltaSeconds must be positive and finite");
  }
  if (!Number.isFinite(options.chunkSize) || options.chunkSize <= 0) {
    throw new Error("chunkSize must be positive and finite");
  }

  const regionIds = new Set<string>();
  for (const region of options.regions) {
    assertNonEmpty(region.id, "region id");
    assertNonEmpty(region.label, `region ${region.id} label`);
    if (regionIds.has(region.id)) throw new Error(`duplicate region id: ${region.id}`);
    regionIds.add(region.id);
    validateRegion(region, options.bounds);
  }

  for (let i = 0; i < options.regions.length; i += 1) {
    const a = options.regions[i]!;
    for (let j = i + 1; j < options.regions.length; j += 1) {
      const b = options.regions[j]!;
      if (!regionsOverlapWithPositiveArea(a, b)) continue;
      if (regionPriority(a) === regionPriority(b)) {
        throw new Error(`overlapping regions require distinct priority: ${a.id} / ${b.id}`);
      }
    }
  }
}

export function validateResidentProfile(profile: ResidentProfile): void {
  assertNonEmpty(profile.id, "resident id");
  assertNonEmpty(profile.name, `resident ${profile.id} name`);
  assertFiniteNonNegative(profile.hearingRadius, `resident ${profile.id} hearingRadius`);
  assertFiniteNonNegative(profile.sightRadius, `resident ${profile.id} sightRadius`);
  assertFiniteNonNegative(profile.maxSpeed, `resident ${profile.id} maxSpeed`);
  assertPositiveInteger(profile.brainIntervalTicks, `resident ${profile.id} brainIntervalTicks`);
  assertPositiveInteger(profile.memoryLimit, `resident ${profile.id} memoryLimit`);
  assertPositiveInteger(profile.traceLimit, `resident ${profile.id} traceLimit`);
}

export function validateActorState(actor: ActorState): void {
  assertNonEmpty(actor.id, "actor id");
  assertFiniteVec2(actor.position, `actor ${actor.id} position`);
  assertFiniteVec2(actor.velocity, `actor ${actor.id} velocity`);
  assertFiniteNonNegative(actor.hearingRadius, `actor ${actor.id} hearingRadius`);
  assertFiniteNonNegative(actor.sightRadius, `actor ${actor.id} sightRadius`);
  assertFiniteNonNegative(actor.maxSpeed, `actor ${actor.id} maxSpeed`);
}

export function validateResidentActivity(
  activity: ResidentActivity,
  bounds: WorldBounds,
  actorExists: (id: string) => boolean,
): void {
  assertNonEmpty(activity.id, "activity id");
  assertNonEmpty(activity.reason, `activity ${activity.id} reason`);
  if (activity.speed !== null) assertFiniteNonNegative(activity.speed, `activity ${activity.id} speed`);
  if (activity.targetActorId !== null) {
    assertNonEmpty(activity.targetActorId, `activity ${activity.id} targetActorId`);
    if (!actorExists(activity.targetActorId)) throw new Error(`activity target actor does not exist: ${activity.targetActorId}`);
  }
  if (activity.targetPosition !== null) {
    assertFiniteVec2(activity.targetPosition, `activity ${activity.id} targetPosition`);
    if (!positionWithinBounds(activity.targetPosition, bounds)) throw new Error(`activity target position outside world: ${activity.id}`);
  }
  if (activity.text !== null) assertNonEmpty(activity.text, `activity ${activity.id} text`);
  for (const waypoint of activity.routeWaypoints ?? []) {
    assertFiniteVec2(waypoint, `activity ${activity.id} route waypoint`);
    if (!positionWithinBounds(waypoint, bounds)) throw new Error(`activity route waypoint outside world: ${activity.id}`);
  }

  switch (activity.kind) {
    case "idle":
    case "work":
      if (activity.targetActorId !== null || activity.targetPosition !== null || activity.text !== null || (activity.routeWaypoints?.length ?? 0) > 0) {
        throw new Error(`${activity.kind} activity must not carry a target, text or route`);
      }
      break;
    case "travel":
    case "investigate":
      if (activity.targetActorId !== null || activity.targetPosition === null || activity.text !== null) {
        throw new Error(`${activity.kind} activity requires one position target and no actor/text target`);
      }
      break;
    case "follow":
      if (activity.targetActorId === null || activity.text !== null || (activity.routeWaypoints?.length ?? 0) > 0) {
        throw new Error("follow activity requires an actor target and no text/route");
      }
      break;
    case "communicate":
      if (activity.targetActorId === null || activity.text === null || (activity.routeWaypoints?.length ?? 0) > 0) {
        throw new Error("communicate activity requires an actor target and embodied text, with no authored route");
      }
      break;
  }
}

export function assertFiniteVec2(value: Vec2, label: string): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error(`${label} must be finite`);
}

export function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative`);
}

export function clampWorldPosition(position: Vec2, bounds: WorldBounds): Vec2 {
  assertFiniteVec2(position, "world position");
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY),
  };
}

export function limitVelocity(velocity: Vec2, maxSpeed: number): Vec2 {
  assertFiniteVec2(velocity, "velocity");
  assertFiniteNonNegative(maxSpeed, "maxSpeed");
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= maxSpeed || speed <= 0) return { ...velocity };
  const scale = maxSpeed / speed;
  return { x: velocity.x * scale, y: velocity.y * scale };
}

export function resolveRegionAt(options: Pick<SpcWorldOptions, "bounds" | "regions">, position: Vec2): WorldRegion | null {
  assertFiniteVec2(position, "region query position");
  if (!positionWithinBounds(position, options.bounds)) return null;
  const matches = options.regions
    .filter((region) => regionContainsPoint(region, options.bounds, position))
    .sort((a, b) => regionPriority(b) - regionPriority(a) || a.id.localeCompare(b.id));
  return matches[0] ?? null;
}

export function positionWithinBounds(position: Vec2, bounds: WorldBounds): boolean {
  return position.x >= bounds.minX
    && position.x <= bounds.maxX
    && position.y >= bounds.minY
    && position.y <= bounds.maxY;
}

function validateBounds(bounds: WorldBounds): void {
  for (const [name, value] of Object.entries(bounds)) {
    if (!Number.isFinite(value)) throw new Error(`world bounds ${name} must be finite`);
  }
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) throw new Error("world bounds must have positive area");
}

function validateRegion(region: WorldRegion, bounds: WorldBounds): void {
  const coordinates = [region.minX, region.minY, region.maxX, region.maxY];
  if (!coordinates.every(Number.isFinite)) throw new Error(`region coordinates must be finite: ${region.id}`);
  if (region.minX >= region.maxX || region.minY >= region.maxY) throw new Error(`region must have positive area: ${region.id}`);
  if (region.minX < bounds.minX || region.maxX > bounds.maxX || region.minY < bounds.minY || region.maxY > bounds.maxY) {
    throw new Error(`region outside world bounds: ${region.id}`);
  }
  if (region.priority !== undefined && (!Number.isSafeInteger(region.priority) || !Number.isFinite(region.priority))) {
    throw new Error(`region priority must be a finite safe integer: ${region.id}`);
  }
}

function regionPriority(region: WorldRegion): number {
  return region.priority ?? 0;
}

function regionsOverlapWithPositiveArea(a: WorldRegion, b: WorldRegion): boolean {
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return overlapX > 0 && overlapY > 0;
}

function regionContainsPoint(region: WorldRegion, bounds: WorldBounds, position: Vec2): boolean {
  const insideX = position.x >= region.minX
    && (position.x < region.maxX || (region.maxX === bounds.maxX && position.x === bounds.maxX));
  const insideY = position.y >= region.minY
    && (position.y < region.maxY || (region.maxY === bounds.maxY && position.y === bounds.maxY));
  return insideX && insideY;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be non-empty`);
}
