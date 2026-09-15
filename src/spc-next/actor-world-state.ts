import { ChunkSpatialIndex, type SpatialQueryStats } from "./chunk-spatial-index";
import type { ActorState, Vec2, WorldBounds } from "./contracts";
import { clampWorldPosition, limitVelocity, validateActorState } from "./world-invariants";

export interface ActorMotionSample {
  id: string;
  before: Vec2;
  after: Vec2;
}

/**
 * Owns mutable physical actor state and its spatial index.
 * Callers receive snapshots only; resident logic and perception never mutate actor truth directly.
 * Future collision/motion resolution belongs behind this authority boundary.
 */
export class ActorWorldState {
  private readonly actors = new Map<string, ActorState>();
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

  add(actor: ActorState): ActorState {
    if (this.actors.has(actor.id)) throw new Error(`actor already exists: ${actor.id}`);
    const stored = structuredClone(actor);
    stored.position = clampWorldPosition(stored.position, this.bounds);
    stored.velocity = limitVelocity(stored.velocity, stored.maxSpeed);
    validateActorState(stored);
    this.actors.set(stored.id, stored);
    this.spatial.upsert(stored.id, stored.position);
    return structuredClone(stored);
  }

  require(id: string): ActorState {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`unknown actor: ${id}`);
    return structuredClone(actor);
  }

  snapshots(): ActorState[] {
    return [...this.actors.values()].map((actor) => structuredClone(actor));
  }

  ids(): string[] {
    return [...this.actors.keys()];
  }

  queryRadiusIds(position: Vec2, radius: number): string[] {
    return this.spatial.queryRadius(position, radius);
  }

  setVelocity(id: string, velocity: Vec2): void {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`unknown actor: ${id}`);
    actor.velocity = limitVelocity(velocity, actor.maxSpeed);
  }

  integrate(fixedDeltaSeconds: number): ActorMotionSample[] {
    if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0) {
      throw new Error("fixedDeltaSeconds must be positive and finite");
    }

    const samples: ActorMotionSample[] = [];
    for (const actor of this.actors.values()) {
      const before = { ...actor.position };
      actor.position = clampWorldPosition({
        x: actor.position.x + actor.velocity.x * fixedDeltaSeconds,
        y: actor.position.y + actor.velocity.y * fixedDeltaSeconds,
      }, this.bounds);
      this.spatial.upsert(actor.id, actor.position);
      samples.push({ id: actor.id, before, after: { ...actor.position } });
    }
    return samples;
  }

  spatialStats(): SpatialQueryStats {
    return this.spatial.stats();
  }
}
