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

const CONTEXT_RECENT_PERCEPT_LIMIT = 32;
const CONTEXT_REQUIRED_EVIDENCE_LIMIT = 48;
const CONTEXT_BELIEF_LIMIT = 16;
const CONTEXT_CONCERN_LIMIT = 12;
const CONTEXT_ACTOR_LIMIT = 32;

interface KnownActorRecord {
  id: string;
  label: string;
  lastKnownPosition: Vec2 | null;
  lastObservedTick: number | null;
  currentlyVisible: boolean;
  visibilityChangedTick: number | null;
  lastHeardDirection: Vec2 | null;
  lastHeardDistanceBand: PerceptDistanceBand | null;
  lastHeardTick: number | null;
  touchedAtTick: number;
}

interface KnownRegionRecord {
  id: string;
  label: string;
  familiarizedAtTick: number;
  lastVisitedTick: number | null;
}

export class ResidentMind {
  private readonly beliefs = new Map<string, ResidentBeliefState>();
  private readonly concerns = new Map<string, ResidentConcernState>();
  private readonly knownActors = new Map<string, KnownActorRecord>();
  private readonly knownRegions = new Map<string, KnownRegionRecord>();
  private readonly perceptEvidence = new Map<string, ResidentPercept>();
  private readonly semanticEvidencePins = new Map<string, ResidentPercept>();
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
        if (percept.phenomenon === "actor_sight_exit") {
          this.markActorVisibility(percept.actorId, false, percept.tick);
        } else if (percept.spatial.kind === "exact") {
          this.rememberSeenActor(percept.actorId, percept.spatial.position, percept.tick);
          if (percept.phenomenon === "actor_sight_enter" || percept.phenomenon === "actor_sight_update") {
            this.markActorVisibility(percept.actorId, true, percept.tick);
          }
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
      // subjectId is causal provenance only unless subject-specific spatial evidence exists.
    }
    this.trimKnownActors();
    trimOldest(this.perceptEvidence, this.limits.maxPerceptEvidence, (percept) => percept.tick);
  }

  familiarizeRegion(region: WorldRegion, tick: number): void {
    const existing = this.knownRegions.get(region.id);
    if (existing) {
      existing.label = region.label;
      return;
    }
    this.knownRegions.set(region.id, {
      id: region.id,
      label: region.label,
      familiarizedAtTick: tick,
      lastVisitedTick: null,
    });
    this.trimKnownRegions();
  }

  discoverRegion(region: WorldRegion, tick: number): void {
    this.familiarizeRegion(region, tick);
    const record = this.knownRegions.get(region.id)!;
    record.lastVisitedTick = tick;
  }

  context(
    tick: number,
    currentRegionId: string | null,
    reasons: readonly CognitionReason[],
    currentActivity: ResidentActivity,
    recentPercepts: readonly ResidentPercept[],
  ): ResidentCognitionContext {
    const selectedConcerns = [...this.concerns.values()]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "open" ? -1 : 1;
        return b.priority - a.priority || a.id.localeCompare(b.id);
      })
      .slice(0, CONTEXT_CONCERN_LIMIT);
    const selectedBeliefs = [...this.beliefs.values()]
      .sort((a, b) => b.updatedTick - a.updatedTick || a.id.localeCompare(b.id))
      .slice(0, CONTEXT_BELIEF_LIMIT);

    const requiredEvidenceIds = uniqueLimited([
      ...reasons.flatMap((reason) => reason.evidenceIds),
      ...selectedConcerns.flatMap((concern) => concern.evidenceIds),
      ...selectedBeliefs.flatMap((belief) => belief.evidenceIds),
    ], CONTEXT_REQUIRED_EVIDENCE_LIMIT);
    const selectedPercepts = new Map<string, ResidentPercept>();
    for (const evidenceId of requiredEvidenceIds) {
      const percept = this.perceptEvidence.get(evidenceId) ?? this.semanticEvidencePins.get(evidenceId);
      if (percept) selectedPercepts.set(percept.id, structuredClone(percept));
    }

    let recentAdded = 0;
    for (const percept of [...recentPercepts].sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id))) {
      if (selectedPercepts.has(percept.id)) continue;
      if (recentAdded >= CONTEXT_RECENT_PERCEPT_LIMIT) break;
      selectedPercepts.set(percept.id, structuredClone(percept));
      recentAdded += 1;
    }

    return {
      version: 1,
      resident: { id: this.resident.id, name: this.resident.name },
      tick,
      currentRegionId,
      reasons: structuredClone(reasons),
      currentActivity: structuredClone(currentActivity),
      recentPercepts: [...selectedPercepts.values()]
        .sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id)),
      concerns: selectedConcerns.map((value) => structuredClone(value)),
      beliefs: selectedBeliefs.map((value) => structuredClone(value)),
      knownActors: [...this.knownActors.values()]
        .sort((a, b) => b.touchedAtTick - a.touchedAtTick || a.id.localeCompare(b.id))
        .slice(0, CONTEXT_ACTOR_LIMIT)
        .map((value) => ({
          id: value.id,
          label: value.label,
          lastKnownPosition: value.lastKnownPosition ? { ...value.lastKnownPosition } : null,
          lastObservedTick: value.lastObservedTick,
          currentlyVisible: value.currentlyVisible,
          visibilityChangedTick: value.visibilityChangedTick,
          lastHeardDirection: value.lastHeardDirection ? { ...value.lastHeardDirection } : null,
          lastHeardDistanceBand: value.lastHeardDistanceBand,
          lastHeardTick: value.lastHeardTick,
        })),
      knownRegions: [...this.knownRegions.values()]
        .sort((a, b) => {
          const aVisited = a.lastVisitedTick ?? Number.NEGATIVE_INFINITY;
          const bVisited = b.lastVisitedTick ?? Number.NEGATIVE_INFINITY;
          return bVisited - aVisited || b.familiarizedAtTick - a.familiarizedAtTick || a.id.localeCompare(b.id);
        })
        .map((value) => ({
          id: value.id,
          label: value.label,
          knowledge: value.lastVisitedTick === null ? "familiar" as const : "visited" as const,
          lastVisitedTick: value.lastVisitedTick,
        })),
    };
  }

  applySemanticUpdates(
    proposal: ResidentCognitionProposal,
    tick: number,
    supportingPercepts: readonly ResidentPercept[] = [],
  ): void {
    const availableEvidence = new Map<string, ResidentPercept>();
    for (const [id, percept] of this.semanticEvidencePins) availableEvidence.set(id, structuredClone(percept));
    for (const [id, percept] of this.perceptEvidence) availableEvidence.set(id, structuredClone(percept));
    for (const percept of supportingPercepts) availableEvidence.set(percept.id, structuredClone(percept));

    for (const evidenceId of [
      ...proposal.beliefs.flatMap((belief) => belief.evidenceIds),
      ...proposal.concerns.flatMap((concern) => concern.evidenceIds),
    ]) {
      if (!availableEvidence.has(evidenceId)) {
        throw new Error(`semantic update references unavailable resident percept evidence: ${evidenceId}`);
      }
    }

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

    const retainedEvidenceIds = new Set<string>([
      ...[...this.beliefs.values()].flatMap((belief) => belief.evidenceIds),
      ...[...this.concerns.values()].flatMap((concern) => concern.evidenceIds),
    ]);
    this.semanticEvidencePins.clear();
    for (const evidenceId of retainedEvidenceIds) {
      const percept = availableEvidence.get(evidenceId);
      if (!percept) throw new Error(`retained semantic state lost resident percept evidence: ${evidenceId}`);
      this.semanticEvidencePins.set(evidenceId, structuredClone(percept));
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
    const actor: KnownActorRecord = existing ?? {
      id,
      label: id,
      lastKnownPosition: null,
      lastObservedTick: null,
      currentlyVisible: false,
      visibilityChangedTick: null,
      lastHeardDirection: null,
      lastHeardDistanceBand: null,
      lastHeardTick: null,
      touchedAtTick: tick,
    };
    actor.touchedAtTick = tick;
    this.knownActors.set(id, actor);
    return actor;
  }

  private rememberSeenActor(id: string, position: Vec2, tick: number): void {
    const actor = this.touchActor(id, tick);
    actor.lastKnownPosition = { ...position };
    actor.lastObservedTick = tick;
  }

  private markActorVisibility(id: string, visible: boolean, tick: number): void {
    const actor = this.touchActor(id, tick);
    if (actor.currentlyVisible !== visible || actor.visibilityChangedTick === null) {
      actor.currentlyVisible = visible;
      actor.visibilityChangedTick = tick;
    }
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

  private trimKnownRegions(): void {
    if (this.knownRegions.size <= this.limits.maxKnownRegions) return;
    const removable = [...this.knownRegions.entries()].sort((a, b) => {
      const aVisited = a[1].lastVisitedTick;
      const bVisited = b[1].lastVisitedTick;
      if ((aVisited === null) !== (bVisited === null)) return aVisited === null ? -1 : 1;
      const aTouch = aVisited ?? a[1].familiarizedAtTick;
      const bTouch = bVisited ?? b[1].familiarizedAtTick;
      return aTouch - bTouch || a[0].localeCompare(b[0]);
    });
    while (this.knownRegions.size > this.limits.maxKnownRegions) {
      const candidate = removable.shift();
      if (!candidate) break;
      this.knownRegions.delete(candidate[0]);
    }
  }
}

function uniqueLimited(values: readonly string[], limit: number): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
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