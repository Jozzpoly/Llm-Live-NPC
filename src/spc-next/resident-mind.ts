import type {
  ResidentBeliefState,
  ResidentCognitionContext,
  ResidentCognitionProposal,
  ResidentConcernState,
} from "./cognition-contract";
import type {
  CognitionReason,
  PerceptDistanceBand,
  ResidentActivity,
  ResidentPercept,
  ResidentProfile,
  Vec2,
  WorldRegion,
} from "./contracts";

export interface ResidentMindLimits {
  maxBeliefs: number;
  maxConcerns: number;
  maxKnownActors: number;
  maxKnownRegions: number;
  maxPerceptEvidence?: number;
}

export const DEFAULT_MIND_LIMITS: Required<ResidentMindLimits> = {
  maxBeliefs: 64,
  maxConcerns: 32,
  maxKnownActors: 64,
  maxKnownRegions: 64,
  maxPerceptEvidence: 512,
};

const CONTEXT_PERCEPT_LIMIT = 32;
const CONTEXT_BELIEF_LIMIT = 24;
const CONTEXT_CONCERN_LIMIT = 16;
const CONTEXT_ACTOR_LIMIT = 32;

interface KnownActorRecord {
  id: string;
  label: string;
  lastKnownPosition: Vec2 | null;
  lastObservedTick: number | null;
  lastHeardDirection: Vec2 | null;
  lastHeardDistanceBand: PerceptDistanceBand | null;
  lastHeardTick: number | null;
  touchedAtTick: number;
}

interface KnownRegionRecord {
  id: string;
  label: string;
  discoveredAtTick: number;
  lastVisitedTick: number;
}

export class ResidentMind {
  private readonly beliefs = new Map<string, ResidentBeliefState>();
  private readonly concerns = new Map<string, ResidentConcernState>();
  private readonly knownActors = new Map<string, KnownActorRecord>();
  private readonly knownRegions = new Map<string, KnownRegionRecord>();
  private readonly perceptEvidence = new Map<string, ResidentPercept>();
  private readonly limits: Required<ResidentMindLimits>;

  constructor(
    private readonly resident: Pick<ResidentProfile, "id" | "name">,
    limits: ResidentMindLimits = DEFAULT_MIND_LIMITS,
  ) {
    this.limits = { ...DEFAULT_MIND_LIMITS, ...limits };
    validateLimits(this.limits);
  }

  observe(percepts: readonly ResidentPercept[]): void {
    for (const percept of percepts) {
      this.perceptEvidence.delete(percept.id);
      this.perceptEvidence.set(percept.id, structuredClone(percept));
      if (percept.actorId && percept.actorId !== this.resident.id) {
        if (percept.spatial.kind === "exact") {
          this.rememberSeenActor(percept.actorId, percept.spatial.position, percept.tick);
        } else if (percept.spatial.kind === "directional") {
          this.rememberHeardActor(
            percept.actorId,
            percept.spatial.direction,
            percept.spatial.distanceBand,
            percept.tick,
          );
        } else {
          this.touchActor(percept.actorId, percept.tick);
        }
      }
      // subjectId is provenance only unless subject-specific spatial evidence exists.
      // Never assign the event source position to a different subject.
    }
    this.trimKnownActors();
    trimOldest(this.perceptEvidence, this.limits.maxPerceptEvidence, (percept) => percept.tick);
  }

  discoverRegion(region: WorldRegion, tick: number): void {
    const existing = this.knownRegions.get(region.id);
    this.knownRegions.set(region.id, {
      id: region.id,
      label: region.label,
      discoveredAtTick: existing?.discoveredAtTick ?? tick,
      lastVisitedTick: tick,
    });
    trimOldest(this.knownRegions, this.limits.maxKnownRegions, (record) => record.lastVisitedTick);
  }

  context(
    tick: number,
    reasons: readonly CognitionReason[],
    currentActivity: ResidentActivity,
    recentPercepts: readonly ResidentPercept[],
  ): ResidentCognitionContext {
    const requiredEvidenceIds = new Set(reasons.flatMap((reason) => reason.evidenceIds));
    const selectedPercepts = new Map<string, ResidentPercept>();

    for (const evidenceId of requiredEvidenceIds) {
      const percept = this.perceptEvidence.get(evidenceId);
      if (percept) selectedPercepts.set(percept.id, structuredClone(percept));
    }
    for (const percept of [...recentPercepts].sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id))) {
      if (selectedPercepts.size >= CONTEXT_PERCEPT_LIMIT && !requiredEvidenceIds.has(percept.id)) continue;
      if (!selectedPercepts.has(percept.id)) selectedPercepts.set(percept.id, structuredClone(percept));
    }

    return {
      version: 1,
      resident: { id: this.resident.id, name: this.resident.name },
      tick,
      reasons: structuredClone(reasons),
      currentActivity: structuredClone(currentActivity),
      recentPercepts: [...selectedPercepts.values()]
        .sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id)),
      concerns: [...this.concerns.values()]
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "open" ? -1 : 1;
          return b.priority - a.priority || a.id.localeCompare(b.id);
        })
        .slice(0, CONTEXT_CONCERN_LIMIT)
        .map((value) => structuredClone(value)),
      beliefs: [...this.beliefs.values()]
        .sort((a, b) => b.updatedTick - a.updatedTick || a.id.localeCompare(b.id))
        .slice(0, CONTEXT_BELIEF_LIMIT)
        .map((value) => structuredClone(value)),
      knownActors: [...this.knownActors.values()]
        .sort((a, b) => b.touchedAtTick - a.touchedAtTick || a.id.localeCompare(b.id))
        .slice(0, CONTEXT_ACTOR_LIMIT)
        .map((value) => ({
          id: value.id,
          label: value.label,
          lastKnownPosition: value.lastKnownPosition ? { ...value.lastKnownPosition } : null,
          lastObservedTick: value.lastObservedTick,
          lastHeardDirection: value.lastHeardDirection ? { ...value.lastHeardDirection } : null,
          lastHeardDistanceBand: value.lastHeardDistanceBand,
          lastHeardTick: value.lastHeardTick,
        })),
      knownRegions: [...this.knownRegions.values()]
        .sort((a, b) => b.lastVisitedTick - a.lastVisitedTick || a.id.localeCompare(b.id))
        .map((value) => ({ id: value.id, label: value.label })),
    };
  }

  applySemanticUpdates(proposal: ResidentCognitionProposal, tick: number): void {
    for (const update of proposal.beliefs) {
      this.beliefs.set(update.id, {
        id: update.id,
        statement: update.statement,
        confidence: update.confidence,
        evidenceIds: [...update.evidenceIds],
        updatedTick: tick,
      });
    }

    for (const update of proposal.concerns) {
      if (update.status === "resolved") {
        const existing = this.concerns.get(update.id);
        if (existing) {
          this.concerns.set(update.id, {
            id: update.id,
            summary: update.summary,
            priority: update.priority,
            status: "resolved",
            evidenceIds: [...update.evidenceIds],
          });
        }
        continue;
      }
      this.concerns.set(update.id, {
        id: update.id,
        summary: update.summary,
        priority: update.priority,
        status: "open",
        evidenceIds: [...update.evidenceIds],
      });
    }

    trimOldest(this.beliefs, this.limits.maxBeliefs, (belief) => belief.updatedTick);
    if (this.concerns.size > this.limits.maxConcerns) {
      const removable = [...this.concerns.values()]
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "resolved" ? -1 : 1;
          return a.priority - b.priority || a.id.localeCompare(b.id);
        });
      while (this.concerns.size > this.limits.maxConcerns) {
        const candidate = removable.shift();
        if (!candidate) break;
        this.concerns.delete(candidate.id);
      }
    }
  }

  snapshot(): {
    beliefs: readonly ResidentBeliefState[];
    concerns: readonly ResidentConcernState[];
    knownRegionIds: readonly string[];
  } {
    return {
      beliefs: [...this.beliefs.values()].map((value) => structuredClone(value)),
      concerns: [...this.concerns.values()].map((value) => structuredClone(value)),
      knownRegionIds: [...this.knownRegions.keys()].sort(),
    };
  }

  private touchActor(id: string, tick: number): KnownActorRecord {
    const existing = this.knownActors.get(id);
    const record: KnownActorRecord = existing ?? {
      id,
      label: id,
      lastKnownPosition: null,
      lastObservedTick: null,
      lastHeardDirection: null,
      lastHeardDistanceBand: null,
      lastHeardTick: null,
      touchedAtTick: tick,
    };
    record.touchedAtTick = tick;
    this.knownActors.set(id, record);
    return record;
  }

  private rememberSeenActor(id: string, position: Vec2, tick: number): void {
    const actor = this.touchActor(id, tick);
    actor.lastKnownPosition = { ...position };
    actor.lastObservedTick = tick;
  }

  private rememberHeardActor(id: string, direction: Vec2, distanceBand: PerceptDistanceBand, tick: number): void {
    const actor = this.touchActor(id, tick);
    actor.lastHeardDirection = { ...direction };
    actor.lastHeardDistanceBand = distanceBand;
    actor.lastHeardTick = tick;
  }

  private trimKnownActors(): void {
    trimOldest(this.knownActors, this.limits.maxKnownActors, (record) => record.touchedAtTick);
  }
}

function trimOldest<T>(
  map: Map<string, T>,
  limit: number,
  age: (value: T) => number,
): void {
  if (map.size <= limit) return;
  const oldest = [...map.entries()].sort((a, b) => age(a[1]) - age(b[1]) || a[0].localeCompare(b[0]));
  while (map.size > limit) {
    const candidate = oldest.shift();
    if (!candidate) break;
    map.delete(candidate[0]);
  }
}

function validateLimits(limits: Required<ResidentMindLimits>): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  }
}
