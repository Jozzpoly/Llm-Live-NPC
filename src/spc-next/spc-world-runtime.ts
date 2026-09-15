import { ChunkSpatialIndex, type SpatialQueryStats } from "./chunk-spatial-index";
import {
  DEFAULT_RESIDENT_PROFILE,
  distanceSquared,
  normalizedDirection,
  type ActorState,
  type CognitionBatch,
  type PerceptDistanceBand,
  type PerceptSpatialCue,
  type ResidentActivity,
  type ResidentDiagnostics,
  type ResidentPercept,
  type ResidentProfile,
  type SpcWorldOptions,
  type Vec2,
  type VisibleActor,
  type WorldOccurrence,
  type WorldPublicSnapshot,
  type WorldRegion,
} from "./contracts";
import { ResidentRuntime } from "./resident-runtime";
import { SightContinuityTracker } from "./sight-continuity";
import { SightGeometry } from "./sight-geometry";
import {
  assertFiniteNonNegative,
  clampWorldPosition,
  limitVelocity,
  resolveRegionAt,
  validateActorState,
  validateResidentActivity,
  validateResidentProfile,
  validateWorldOptions,
} from "./world-invariants";

interface RegisteredResident {
  runtime: ResidentRuntime;
  brainPhase: number;
  sight: SightContinuityTracker;
}

interface OccurrenceObserverSnapshot {
  residentId: string;
  position: Vec2;
  hearingRadius: number;
  sightRadius: number;
}

interface PendingOccurrence {
  occurrence: WorldOccurrence;
  observers: readonly OccurrenceObserverSnapshot[];
}

export interface SpcWorldDiagnostics {
  tick: number;
  recentOccurrences: readonly WorldOccurrence[];
}

const WORLD_OCCURRENCE_LIMIT = 1_024;
const HEARING_DIRECTION_SECTORS = 8;

export class SpcWorldRuntime {
  private tickValue = 0;
  private occurrenceSequence = 0;
  private perceptSequence = 0;
  private readonly actors = new Map<string, ActorState>();
  private readonly residents = new Map<string, RegisteredResident>();
  private readonly spatial: ChunkSpatialIndex;
  private readonly sightGeometry: SightGeometry;
  private pendingOccurrences: PendingOccurrence[] = [];
  private readonly recentOccurrences: WorldOccurrence[] = [];

  constructor(readonly options: SpcWorldOptions) {
    validateWorldOptions(options);
    this.spatial = new ChunkSpatialIndex(options.chunkSize);
    this.sightGeometry = new SightGeometry(options.sightBlockers ?? []);
  }

  get tick(): number {
    return this.tickValue;
  }

  addPlayer(id: string, position: Vec2, overrides: Partial<Omit<ActorState, "id" | "kind" | "position">> = {}): void {
    const actor: ActorState = {
      id,
      kind: "player",
      position: this.clampPosition(position),
      velocity: { x: 0, y: 0 },
      hearingRadius: 420,
      sightRadius: 520,
      maxSpeed: 140,
      ...overrides,
    };
    actor.velocity = limitVelocity(actor.velocity, actor.maxSpeed);
    this.addActor(actor);
  }

  addResident(
    id: string,
    name: string,
    position: Vec2,
    profileOverrides: Partial<Omit<ResidentProfile, "id" | "name">> = {},
  ): ResidentRuntime {
    const profile: ResidentProfile = {
      id,
      name,
      ...DEFAULT_RESIDENT_PROFILE,
      ...profileOverrides,
    };
    validateResidentProfile(profile);
    const boundedPosition = this.clampPosition(position);
    this.addActor({
      id,
      kind: "resident",
      position: boundedPosition,
      velocity: { x: 0, y: 0 },
      hearingRadius: profile.hearingRadius,
      sightRadius: profile.sightRadius,
      maxSpeed: profile.maxSpeed,
    });
    const runtime = new ResidentRuntime(profile);
    const brainPhase = this.residents.size % profile.brainIntervalTicks;
    this.residents.set(id, {
      runtime,
      brainPhase,
      sight: new SightContinuityTracker(this.options.fixedDeltaSeconds),
    });
    const initialRegion = this.regionAt(boundedPosition);
    if (initialRegion) runtime.enterRegion(initialRegion, this.tickValue, true);
    return runtime;
  }

  familiarizeResidentWithRegions(residentId: string, regionIds: readonly string[]): void {
    const resident = this.requireResident(residentId).runtime;
    for (const regionId of [...new Set(regionIds)]) {
      const region = this.options.regions.find((candidate) => candidate.id === regionId);
      if (!region) throw new Error(`unknown region: ${regionId}`);
      resident.familiarizeRegion(region, this.tickValue);
    }
  }

  setResidentActivity(residentId: string, activity: ResidentActivity): void {
    const resident = this.requireResident(residentId);
    validateResidentActivity(activity, this.options.bounds, (id) => this.actors.has(id));
    resident.runtime.setActivity(activity, this.tickValue);
    const actor = this.requireActor(residentId);
    actor.velocity = { x: 0, y: 0 };
  }

  setActorVelocity(actorId: string, velocity: Vec2): void {
    const actor = this.requireActor(actorId);
    actor.velocity = limitVelocity(velocity, actor.maxSpeed);
  }

  speak(
    actorId: string,
    text: string,
    radius?: number,
    addressedActorIds: readonly string[] = [],
  ): WorldOccurrence {
    const actor = this.requireActor(actorId);
    assertNonEmptyWorldText(text, "speech text");
    const effectiveRadius = radius ?? actor.hearingRadius;
    assertFiniteNonNegative(effectiveRadius, "speech radius");
    for (const addressedId of addressedActorIds) this.requireActor(addressedId);
    const occurrence: WorldOccurrence = {
      id: `occurrence:${this.tickValue}:${this.occurrenceSequence++}`,
      tick: this.tickValue,
      kind: "speech",
      actorId,
      subjectId: null,
      position: { ...actor.position },
      radius: effectiveRadius,
      summary: "speech",
      text,
      addressedActorIds: [...new Set(addressedActorIds)],
    };
    this.queueOccurrence(occurrence);
    return structuredClone(occurrence);
  }

  emitInteraction(actorId: string, subjectId: string | null, summary: string, radius = 520): WorldOccurrence {
    const actor = this.requireActor(actorId);
    if (subjectId !== null) assertNonEmptyWorldText(subjectId, "interaction subjectId");
    assertNonEmptyWorldText(summary, "interaction summary");
    assertFiniteNonNegative(radius, "interaction radius");
    const occurrence: WorldOccurrence = {
      id: `occurrence:${this.tickValue}:${this.occurrenceSequence++}`,
      tick: this.tickValue,
      kind: "interaction",
      actorId,
      subjectId,
      position: { ...actor.position },
      radius,
      summary,
      text: null,
      addressedActorIds: [],
    };
    this.queueOccurrence(occurrence);
    return structuredClone(occurrence);
  }

  step(steps = 1): void {
    if (!Number.isSafeInteger(steps) || steps < 1) throw new Error("steps must be a positive safe integer");
    for (let i = 0; i < steps; i += 1) this.stepOnce();
  }

  takeCognitionBatch(residentId: string): CognitionBatch | null {
    return this.requireResident(residentId).runtime.takeCognitionBatch(this.tickValue);
  }

  publicSnapshot(): WorldPublicSnapshot {
    return {
      tick: this.tickValue,
      actors: [...this.actors.values()].map((actor) => structuredClone(actor)),
      residents: [...this.residents.values()].map(({ runtime }) => runtime.publicState()),
    };
  }

  diagnostics(): SpcWorldDiagnostics {
    return {
      tick: this.tickValue,
      recentOccurrences: structuredClone(this.recentOccurrences),
    };
  }

  residentDiagnostics(residentId: string): ResidentDiagnostics {
    return this.requireResident(residentId).runtime.diagnostics();
  }

  spatialStats(): SpatialQueryStats {
    return this.spatial.stats();
  }

  regionAt(position: Vec2): WorldRegion | null {
    return resolveRegionAt(this.options, position);
  }

  private stepOnce(): void {
    this.tickValue += 1;
    const occurrences = this.pendingOccurrences;
    this.pendingOccurrences = [];

    for (const occurrence of occurrences) this.deliverOccurrence(occurrence);
    this.updateSightPercepts();

    for (const [residentId, registered] of this.residents) {
      if (this.tickValue % registered.runtime.profile.brainIntervalTicks !== registered.brainPhase) continue;
      const actor = this.requireActor(residentId);
      const visibleActors = this.visibleActorsForResident(actor, registered);
      const command = registered.runtime.fastStep({
        tick: this.tickValue,
        selfPosition: { ...actor.position },
        visibleActors,
      });
      this.applyResidentCommand(actor, command);
    }

    for (const actor of this.actors.values()) {
      actor.position = this.clampPosition({
        x: actor.position.x + actor.velocity.x * this.options.fixedDeltaSeconds,
        y: actor.position.y + actor.velocity.y * this.options.fixedDeltaSeconds,
      });
      this.spatial.upsert(actor.id, actor.position);
      const resident = this.residents.get(actor.id);
      if (resident) {
        const region = this.regionAt(actor.position);
        if (region) resident.runtime.enterRegion(region, this.tickValue);
      }
    }
  }

  private deliverOccurrence(pending: PendingOccurrence): void {
    const { occurrence, observers } = pending;
    for (const observer of observers) {
      const registered = this.residents.get(observer.residentId);
      if (!registered) continue;
      const distanceSq = distanceSquared(observer.position, occurrence.position);

      let modality: ResidentPercept["modality"] | null = null;
      let spatial: PerceptSpatialCue = { kind: "none" };
      if (occurrence.kind === "speech") {
        const range = Math.min(occurrence.radius, observer.hearingRadius);
        if (distanceSq <= range * range) {
          modality = "hearing";
          spatial = directionalHearingCue(observer.position, occurrence.position, range);
        }
      } else {
        const range = Math.min(occurrence.radius, observer.sightRadius);
        if (distanceSq <= range * range
          && this.sightGeometry.hasLineOfSight(observer.position, occurrence.position)) {
          modality = "sight";
          spatial = { kind: "exact", position: { ...occurrence.position } };
        }
      }
      if (!modality) continue;

      registered.runtime.ingestPercepts([{
        id: `percept:${observer.residentId}:${occurrence.tick}:${this.perceptSequence++}`,
        occurrenceId: occurrence.id,
        tick: occurrence.tick,
        phenomenon: occurrence.kind,
        modality,
        actorId: occurrence.actorId,
        subjectId: occurrence.subjectId,
        spatial,
        summary: occurrence.summary,
        text: occurrence.text,
        addressed: occurrence.addressedActorIds.includes(observer.residentId),
      }], observer.position);
    }
  }

  private updateSightPercepts(): void {
    for (const [residentId, registered] of this.residents) {
      const observer = this.requireActor(residentId);
      const visible = this.visibleActorsForResident(observer, registered);
      const drafts = registered.sight.update(this.tickValue, visible);
      if (drafts.length === 0) continue;

      const percepts: ResidentPercept[] = drafts.map((draft) => ({
        id: `percept:${residentId}:${this.tickValue}:${this.perceptSequence++}`,
        occurrenceId: `sight:${draft.phenomenon}:${residentId}:${draft.actorId}:${draft.observedAtTick}`,
        tick: draft.observedAtTick,
        phenomenon: draft.phenomenon,
        modality: "sight",
        actorId: draft.actorId,
        subjectId: draft.actorId,
        spatial: draft.position
          ? { kind: "exact" as const, position: { ...draft.position } }
          : { kind: "none" as const },
        summary: sightSummary(draft.phenomenon, draft.actorId),
        text: null,
        addressed: false,
      }));
      registered.runtime.ingestPercepts(percepts, observer.position);
    }
  }

  private visibleActorsForResident(observer: ActorState, registered: RegisteredResident): VisibleActor[] {
    const retained = new Set(registered.sight.currentlyVisibleActorIds());
    const releaseRadius = observer.sightRadius + registered.sight.policy.releaseMargin;
    return this.spatial.queryRadius(observer.position, releaseRadius)
      .filter((id) => id !== observer.id)
      .map((id) => this.requireActor(id))
      .filter((candidate) => {
        const radius = retained.has(candidate.id) ? releaseRadius : observer.sightRadius;
        if (distanceSquared(observer.position, candidate.position) > radius ** 2) return false;
        return this.sightGeometry.hasLineOfSight(observer.position, candidate.position);
      })
      .map((candidate) => ({
        id: candidate.id,
        kind: candidate.kind,
        position: { ...candidate.position },
      }));
  }

  private applyResidentCommand(actor: ActorState, command: ReturnType<ResidentRuntime["fastStep"]>): void {
    if (command.kind === "none") return;
    if (command.kind === "move") {
      this.setActorVelocity(actor.id, command.desiredVelocity);
      return;
    }
    actor.velocity = { x: 0, y: 0 };
    this.speak(actor.id, command.text, command.radius, command.addressedActorIds);
  }

  private queueOccurrence(occurrence: WorldOccurrence): void {
    const stored = structuredClone(occurrence);
    const observers: OccurrenceObserverSnapshot[] = [];
    for (const residentId of this.spatial.queryRadius(stored.position, stored.radius)) {
      if (residentId === stored.actorId) continue;
      if (!this.residents.has(residentId)) continue;
      const actor = this.requireActor(residentId);
      observers.push({
        residentId,
        position: { ...actor.position },
        hearingRadius: actor.hearingRadius,
        sightRadius: actor.sightRadius,
      });
    }
    this.pendingOccurrences.push({ occurrence: stored, observers });
    this.recentOccurrences.push(structuredClone(stored));
    while (this.recentOccurrences.length > WORLD_OCCURRENCE_LIMIT) this.recentOccurrences.shift();
  }

  private addActor(actor: ActorState): void {
    validateActorState(actor);
    if (this.actors.has(actor.id)) throw new Error(`actor already exists: ${actor.id}`);
    const stored = structuredClone(actor);
    stored.velocity = limitVelocity(stored.velocity, stored.maxSpeed);
    this.actors.set(actor.id, stored);
    this.spatial.upsert(actor.id, stored.position);
  }

  private requireActor(id: string): ActorState {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`unknown actor: ${id}`);
    return actor;
  }

  private requireResident(id: string): RegisteredResident {
    const resident = this.residents.get(id);
    if (!resident) throw new Error(`unknown resident: ${id}`);
    return resident;
  }

  private clampPosition(position: Vec2): Vec2 {
    return clampWorldPosition(position, this.options.bounds);
  }
}

function directionalHearingCue(observer: Vec2, source: Vec2, range: number): PerceptSpatialCue {
  const distance = Math.sqrt(distanceSquared(observer, source));
  if (distance <= 1e-9) return { kind: "none" };
  const ratio = range <= 0 ? 0 : distance / range;
  const distanceBand: PerceptDistanceBand = ratio <= 0.33 ? "near" : ratio <= 0.66 ? "mid" : "far";
  const exactDirection = normalizedDirection(observer, source);
  const direction = quantizeDirection(exactDirection, HEARING_DIRECTION_SECTORS);
  return { kind: "directional", direction, distanceBand };
}

function quantizeDirection(direction: Vec2, sectors: number): Vec2 {
  if (Math.hypot(direction.x, direction.y) <= 1e-9) return { x: 0, y: 0 };
  const sectorAngle = (Math.PI * 2) / sectors;
  const quantized = Math.round(Math.atan2(direction.y, direction.x) / sectorAngle) * sectorAngle;
  return {
    x: Math.abs(Math.cos(quantized)) < 1e-12 ? 0 : Math.cos(quantized),
    y: Math.abs(Math.sin(quantized)) < 1e-12 ? 0 : Math.sin(quantized),
  };
}

function sightSummary(
  phenomenon: "actor_sight_enter" | "actor_sight_update" | "actor_sight_exit",
  actorId: string,
): string {
  if (phenomenon === "actor_sight_enter") return `actor ${actorId} entered sight`;
  if (phenomenon === "actor_sight_update") return `actor ${actorId} moved while visible`;
  return `actor ${actorId} left sight`;
}

function assertNonEmptyWorldText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be non-empty`);
}
