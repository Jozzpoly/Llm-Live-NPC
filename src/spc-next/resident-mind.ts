import type {
  ResidentBeliefState,
  ResidentCognitionContext,
  ResidentCognitionProposal,
  ResidentConcernState,
} from "./cognition-contract";
import type {
  CognitionReason,
  ResidentActivity,
  ResidentPercept,
  ResidentProfile,
  WorldRegion,
} from "./contracts";

export interface ResidentMindLimits {
  maxBeliefs: number;
  maxConcerns: number;
  maxKnownActors: number;
  maxKnownRegions: number;
}

export const DEFAULT_MIND_LIMITS: ResidentMindLimits = {
  maxBeliefs: 64,
  maxConcerns: 32,
  maxKnownActors: 64,
  maxKnownRegions: 64,
};

interface KnownActorRecord {
  id: string;
  label: string;
  lastKnownPosition: { x: number; y: number } | null;
  lastObservedTick: number | null;
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

  constructor(
    private readonly resident: Pick<ResidentProfile, "id" | "name">,
    private readonly limits: ResidentMindLimits = DEFAULT_MIND_LIMITS,
  ) {
    validateLimits(limits);
  }

  observe(percepts: readonly ResidentPercept[]): void {
    for (const percept of percepts) {
      if (percept.actorId && percept.actorId !== this.resident.id) {
        this.rememberActor(percept.actorId, percept.position, percept.tick);
      }
      if (percept.subjectId && percept.subjectId !== this.resident.id) {
        this.rememberActor(percept.subjectId, percept.position, percept.tick);
      }
    }
    this.trimKnownActors();
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
    return {
      version: 1,
      resident: { id: this.resident.id, name: this.resident.name },
      tick,
      reasons: structuredClone(reasons),
      currentActivity: structuredClone(currentActivity),
      recentPercepts: structuredClone(recentPercepts),
      concerns: [...this.concerns.values()]
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
        .map((value) => structuredClone(value)),
      beliefs: [...this.beliefs.values()]
        .sort((a, b) => b.updatedTick - a.updatedTick || a.id.localeCompare(b.id))
        .map((value) => structuredClone(value)),
      knownActors: [...this.knownActors.values()]
        .sort((a, b) => b.touchedAtTick - a.touchedAtTick || a.id.localeCompare(b.id))
        .map((value) => ({
          id: value.id,
          label: value.label,
          lastKnownPosition: value.lastKnownPosition ? { ...value.lastKnownPosition } : null,
          lastObservedTick: value.lastObservedTick,
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

  snapshot(): { beliefs: readonly ResidentBeliefState[]; concerns: readonly ResidentConcernState[]; knownRegionIds: readonly string[] } {
    return {
      beliefs: [...this.beliefs.values()].map((value) => structuredClone(value)),
      concerns: [...this.concerns.values()].map((value) => structuredClone(value)),
      knownRegionIds: [...this.knownRegions.keys()].sort(),
    };
  }

  private rememberActor(id: string, position: { x: number; y: number }, tick: number): void {
    const existing = this.knownActors.get(id);
    this.knownActors.set(id, {
      id,
      label: existing?.label ?? id,
      lastKnownPosition: { ...position },
      lastObservedTick: tick,
      touchedAtTick: tick,
    });
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

function validateLimits(limits: ResidentMindLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  }
}
