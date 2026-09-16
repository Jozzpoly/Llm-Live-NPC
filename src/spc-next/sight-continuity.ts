import { distanceSquared, type PerceptPhenomenon, type Vec2, type VisibleActor } from "./contracts";

export interface SightContinuityPolicy {
  reportDistance: number;
  maxUnreportedSeconds: number;
  releaseMargin?: number;
}

export const DEFAULT_SIGHT_CONTINUITY_POLICY: Required<SightContinuityPolicy> = {
  reportDistance: 24,
  maxUnreportedSeconds: 1,
  releaseMargin: 12,
};

export interface SightPerceptDraft {
  actorId: string;
  phenomenon: Extract<PerceptPhenomenon, "actor_sight_enter" | "actor_sight_update" | "actor_sight_exit">;
  observedAtTick: number;
  position: Vec2 | null;
}

interface SightTrack {
  lastSeenPosition: Vec2;
  lastSeenTick: number;
  lastReportedPosition: Vec2;
  lastReportedTick: number;
}

const POSITION_EPSILON_SQ = 1e-12;

export class SightContinuityTracker {
  private readonly tracks = new Map<string, SightTrack>();
  readonly policy: Required<SightContinuityPolicy>;

  constructor(
    private readonly fixedDeltaSeconds: number,
    policy: SightContinuityPolicy = DEFAULT_SIGHT_CONTINUITY_POLICY,
  ) {
    this.policy = { ...DEFAULT_SIGHT_CONTINUITY_POLICY, ...policy };
    if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0) {
      throw new Error("fixedDeltaSeconds must be positive and finite");
    }
    if (!Number.isFinite(this.policy.reportDistance) || this.policy.reportDistance <= 0) {
      throw new Error("sight reportDistance must be positive and finite");
    }
    if (!Number.isFinite(this.policy.maxUnreportedSeconds) || this.policy.maxUnreportedSeconds <= 0) {
      throw new Error("sight maxUnreportedSeconds must be positive and finite");
    }
    if (!Number.isFinite(this.policy.releaseMargin) || this.policy.releaseMargin < 0) {
      throw new Error("sight releaseMargin must be finite and non-negative");
    }
  }

  update(tick: number, visibleActors: readonly VisibleActor[]): SightPerceptDraft[] {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("sight tick must be a non-negative safe integer");
    const visibleById = new Map<string, VisibleActor>();
    for (const actor of visibleActors) {
      if (!actor.id.trim()) throw new Error("visible actor id must be non-empty");
      if (!Number.isFinite(actor.position.x) || !Number.isFinite(actor.position.y)) {
        throw new Error("visible actor position must be finite");
      }
      if (visibleById.has(actor.id)) throw new Error(`duplicate visible actor: ${actor.id}`);
      visibleById.set(actor.id, actor);
    }

    const drafts: SightPerceptDraft[] = [];
    for (const actor of [...visibleById.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const track = this.tracks.get(actor.id);
      if (!track) {
        const position = { ...actor.position };
        this.tracks.set(actor.id, {
          lastSeenPosition: position,
          lastSeenTick: tick,
          lastReportedPosition: { ...position },
          lastReportedTick: tick,
        });
        drafts.push({ actorId: actor.id, phenomenon: "actor_sight_enter", observedAtTick: tick, position });
        continue;
      }

      track.lastSeenPosition = { ...actor.position };
      track.lastSeenTick = tick;
      const displacementSq = distanceSquared(track.lastReportedPosition, actor.position);
      const secondsSinceReport = (tick - track.lastReportedTick) * this.fixedDeltaSeconds;
      const movedEnough = displacementSq >= this.policy.reportDistance ** 2;
      const staleMovingSample = displacementSq > POSITION_EPSILON_SQ
        && secondsSinceReport >= this.policy.maxUnreportedSeconds;
      if (!movedEnough && !staleMovingSample) continue;

      track.lastReportedPosition = { ...actor.position };
      track.lastReportedTick = tick;
      drafts.push({
        actorId: actor.id,
        phenomenon: "actor_sight_update",
        observedAtTick: tick,
        position: { ...actor.position },
      });
    }

    for (const actorId of [...this.tracks.keys()].sort((a, b) => a.localeCompare(b))) {
      if (visibleById.has(actorId)) continue;
      const track = this.tracks.get(actorId)!;
      if (distanceSquared(track.lastReportedPosition, track.lastSeenPosition) > POSITION_EPSILON_SQ) {
        drafts.push({
          actorId,
          phenomenon: "actor_sight_update",
          observedAtTick: track.lastSeenTick,
          position: { ...track.lastSeenPosition },
        });
      }
      drafts.push({
        actorId,
        phenomenon: "actor_sight_exit",
        observedAtTick: tick,
        position: null,
      });
      this.tracks.delete(actorId);
    }

    return drafts.sort((a, b) => a.observedAtTick - b.observedAtTick
      || a.actorId.localeCompare(b.actorId)
      || phenomenonOrder(a.phenomenon) - phenomenonOrder(b.phenomenon));
  }

  currentlyVisibleActorIds(): readonly string[] {
    return [...this.tracks.keys()].sort((a, b) => a.localeCompare(b));
  }
}

function phenomenonOrder(phenomenon: SightPerceptDraft["phenomenon"]): number {
  if (phenomenon === "actor_sight_enter") return 0;
  if (phenomenon === "actor_sight_update") return 1;
  return 2;
}
