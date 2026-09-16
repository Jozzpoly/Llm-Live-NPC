import { ChunkSpatialIndex, type SpatialQueryStats } from "./chunk-spatial-index";
import type {
  ActorMotionConstraint,
  ActorMotionOutcome,
  ActorState,
  Vec2,
  WorldBounds,
} from "./contracts";
import { clampWorldPosition, limitVelocity, validateActorState } from "./world-invariants";

const MOTION_EPSILON = 1e-9;

type ActorStateInput = Omit<ActorState, "facing"> & { facing?: Vec2 };

/**
 * Owns mutable physical actor state and its spatial index.
 * Callers receive snapshots only; resident logic and perception never mutate actor truth directly.
 * Desired motion is retained separately from resolved physical velocity so future collision
 * can constrain bodies without rewriting controller intent. Facing is persistent physical
 * orientation: movement may update it from resolved motion, but stopping never erases it.
 */
export class ActorWorldState {
  private readonly actors = new Map<string, ActorState>();
  private readonly desiredVelocities = new Map<string, Vec2>();
  private readonly spatial: ChunkSpatialIndex;

  constructor(
    private readonly bounds: WorldBounds,
    chunkSize: number,
  ) {
    this.spatial = new ChunkSpatialIndex(chunkSize);
  }

  has(id: string): boolean {
    return this.actors.has(id);
  }

  add(actor: ActorStateInput): ActorState {
    if (this.actors.has(actor.id)) throw new Error(`actor already exists: ${actor.id}`);
    const stored: ActorState = {
      ...structuredClone(actor),
      facing: initialFacing(actor),
    };
    stored.position = clampWorldPosition(stored.position, this.bounds);
    stored.velocity = limitVelocity(stored.velocity, stored.maxSpeed);
    validateActorState(stored);
    this.actors.set(stored.id, stored);
    this.desiredVelocities.set(stored.id, { ...stored.velocity });
    this.spatial.upsert(stored.id, stored.position);
    return structuredClone(stored);
  }

  require(id: string): ActorState {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`unknown actor: ${id}`);
    return structuredClone(actor);
  }

  snapshots(): ActorState[] {
    return this.ids().map((id) => structuredClone(this.actors.get(id)!));
  }

  ids(): string[] {
    return [...this.actors.keys()].sort((a, b) => a.localeCompare(b));
  }

  queryRadiusIds(position: Vec2, radius: number): string[] {
    return this.spatial.queryRadius(position, radius);
  }

  setDesiredVelocity(id: string, desiredVelocity: Vec2): void {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`unknown actor: ${id}`);
    const limited = limitVelocity(desiredVelocity, actor.maxSpeed);
    this.desiredVelocities.set(id, limited);

    // SPC Next actors are currently kinematic, not inertial bodies. A controller-level stop is
    // therefore an immediate physical stop. Non-zero intent still requires World integration
    // before it may become public physical velocity.
    if (Math.hypot(limited.x, limited.y) <= MOTION_EPSILON) {
      actor.velocity = { x: 0, y: 0 };
    }
  }

  setFacing(id: string, direction: Vec2): void {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`unknown actor: ${id}`);
    actor.facing = normalizedFacing(direction);
  }

  desiredVelocity(id: string): Vec2 {
    if (!this.actors.has(id)) throw new Error(`unknown actor: ${id}`);
    const desired = this.desiredVelocities.get(id) ?? { x: 0, y: 0 };
    return { ...desired };
  }

  integrate(fixedDeltaSeconds: number): ActorMotionOutcome[] {
    if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0) {
      throw new Error("fixedDeltaSeconds must be positive and finite");
    }

    const outcomes: ActorMotionOutcome[] = [];
    for (const actorId of this.ids()) {
      const actor = this.actors.get(actorId)!;
      const before = { ...actor.position };
      const desiredVelocity = this.desiredVelocity(actorId);
      const intendedAfter = {
        x: before.x + desiredVelocity.x * fixedDeltaSeconds,
        y: before.y + desiredVelocity.y * fixedDeltaSeconds,
      };
      const after = clampWorldPosition(intendedAfter, this.bounds);
      const resolvedVelocity = cleanVelocity({
        x: (after.x - before.x) / fixedDeltaSeconds,
        y: (after.y - before.y) / fixedDeltaSeconds,
      });
      const constraints: ActorMotionConstraint[] = positionsEqual(after, intendedAfter)
        ? []
        : ["world_bounds"];
      const desiredDistance = Math.hypot(desiredVelocity.x, desiredVelocity.y) * fixedDeltaSeconds;
      const resolvedDistance = Math.hypot(after.x - before.x, after.y - before.y);
      const resolution = constraints.length === 0
        ? "full"
        : desiredDistance > MOTION_EPSILON && resolvedDistance <= MOTION_EPSILON
          ? "blocked"
          : "constrained";

      actor.position = { ...after };
      actor.velocity = { ...resolvedVelocity };
      if (Math.hypot(resolvedVelocity.x, resolvedVelocity.y) > MOTION_EPSILON) {
        actor.facing = normalizedFacing(resolvedVelocity);
      }
      this.spatial.upsert(actor.id, actor.position);
      outcomes.push({
        actorId,
        before,
        desiredVelocity,
        intendedAfter,
        after: { ...after },
        resolvedVelocity,
        resolution,
        constraints,
      });
    }
    return outcomes;
  }

  spatialStats(): SpatialQueryStats {
    return this.spatial.stats();
  }
}

function initialFacing(actor: ActorStateInput): Vec2 {
  if (actor.facing) return normalizedFacing(actor.facing);
  if (Math.hypot(actor.velocity.x, actor.velocity.y) > MOTION_EPSILON) {
    return normalizedFacing(actor.velocity);
  }
  return { x: 1, y: 0 };
}

function normalizedFacing(value: Vec2): Vec2 {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new Error("actor facing must be finite");
  }
  const length = Math.hypot(value.x, value.y);
  if (length <= MOTION_EPSILON) throw new Error("actor facing must be non-zero");
  const x = value.x / length;
  const y = value.y / length;
  return {
    x: Math.abs(x) <= MOTION_EPSILON ? 0 : x,
    y: Math.abs(y) <= MOTION_EPSILON ? 0 : y,
  };
}

function positionsEqual(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) <= MOTION_EPSILON && Math.abs(a.y - b.y) <= MOTION_EPSILON;
}

function cleanVelocity(value: Vec2): Vec2 {
  return {
    x: Math.abs(value.x) <= MOTION_EPSILON ? 0 : value.x,
    y: Math.abs(value.y) <= MOTION_EPSILON ? 0 : value.y,
  };
}
