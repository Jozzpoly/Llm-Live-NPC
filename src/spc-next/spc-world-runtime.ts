import type { SpatialQueryStats } from "./chunk-spatial-index";
import {
  DEFAULT_RESIDENT_PROFILE,
  distanceSquared,
  normalizedDirection,
  type ActorMotionOutcome,
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
  type WorldAnchor,
  type WorldOccurrence,
  type WorldPublicSnapshot,
  type WorldRegion,
} from "./contracts";
import { ActorWorldState } from "./actor-world-state";
import { ResidentRuntime } from "./resident-runtime";
import { residentExecutionPhase } from "./resident-phase";
import { SightContinuityTracker } from "./sight-continuity";
import { SightGeometry } from "./sight-geometry";
import {
  assertFiniteNonNegative,
  resolveRegionAt,
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
  lastMotionOutcomes: readonly ActorMotionOutcome[];
}

const WORLD_OCCURRENCE_LIMIT = 1_024;
const HEARING_DIRECTION_SECTORS = 8;
const MOTION_EPSILON = 1e-9;

export class SpcWorldRuntime {
  readonly options: SpcWorldOptions;
  private tickValue = 0;
  private occurrenceSequence = 0;
  private perceptSequence = 0;
  private readonly actorState: ActorWorldState;
  private readonly residents = new Map<string, RegisteredResident>();
  private readonly sightGeometry: SightGeometry;
  private pendingOccurrences: PendingOccurrence[] = [];
  private readonly recentOccurrences: WorldOccurrence[] = [];
  private lastMotionOutcomes: ActorMotionOutcome[] = [];
  private readonly activeMotionBlockages = new Map<string, string>();

  constructor(options: SpcWorldOptions) {
    validateWorldOptions(options);
    this.options = structuredClone(options);
    this.actorState = new ActorWorldState(this.options.bounds, this.options.chunkSize);
    this.sightGeometry = new SightGeometry(this.options.sightBlockers ?? []);
  }

  get tick(): number {
    return this.tickValue;
  }

  anchors(): WorldAnchor[] {
    return structuredClone(this.options.anchors ?? []).sort((a, b) => a.id.localeCompare(b.id));
  }

  anchor(id: string): WorldAnchor | null {
    const anchor = (this.options.anchors ?? []).find((candidate) => candidate.id === id);
    return anchor ? structuredClone(anchor) : null;
  }

  addPlayer(id: string, position: Vec2, overrides: Partial<Omit<ActorState, "id" | "kind" | "position">> = {}): void {
    this.actorState.add({
      id,
      kind: "player",
      position: { ...position },
      velocity: { x: 0, y: 0 },
      hearingRadius: 420,
      sightRadius: 520,
      maxSpeed: 140,
      ...overrides,
    });
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
    const actor = this.actorState.add({
      id,
      kind: "resident",
      position: { ...position },
      velocity: { x: 0, y: 0 },
      hearingRadius: profile.hearingRadius,
      sightRadius: profile.sightRadius,
      maxSpeed: profile.maxSpeed,
    });
    const runtime = new ResidentRuntime(profile);
    const brainPhase = residentExecutionPhase(id, profile.brainIntervalTicks);
    this.residents.set(id, {
      runtime,
      brainPhase,
      sight: new SightContinuityTracker(this.options.fixedDeltaSeconds),
    });
    const initialRegion = this.regionAt(actor.position);
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
    validateResidentActivity(activity, this.options.bounds, (id) => this.actorState.has(id));
    resident.runtime.setActivity(activity, this.tickValue);
    this.actorState.setDesiredVelocity(residentId, { x: 0, y: 0 });
    this.activeMotionBlockages.delete(residentId);
  }

  setActorMotionIntent(actorId: string, desiredVelocity: Vec2): void {
    this.actorState.setDesiredVelocity(actorId, desiredVelocity);
  }

  /** @deprecated Use setActorMotionIntent(); this method sets controller desire, not physical velocity. */
  setActorVelocity(actorId: string, desiredVelocity: Vec2): void {
    this.setActorMotionIntent(actorId, desiredVelocity);
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
      actors: this.actorState.snapshots(),
      residents: this.residentEntries().map(([, { runtime }]) => runtime.publicState()),
    };
  }

  diagnostics(): SpcWorldDiagnostics {
    return {
      tick: this.tickValue,
      recentOccurrences: structuredClone(this.recentOccurrences),
      lastMotionOutcomes: structuredClone(this.lastMotionOutcomes),
    };
  }

  residentDiagnostics(residentId: string): ResidentDiagnostics {
    return this.requireResident(residentId).runtime.diagnostics();
  }

  spatialStats(): SpatialQueryStats {
    return this.actorState.spatialStats();
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

    for (const [residentId, registered] of this.residentEntries()) {
      if (this.tickValue % registered.runtime.profile.brainIntervalTicks !== registered.brainPhase) continue;
      const actor = this.requireActor(residentId);
      const visibleActors = this.visibleActorsForResident(actor, registered);
      const command = registered.runtime.fastStep({
        tick: this.tickValue,
        selfPosition: { ...actor.position },
        visibleActors,
      });
      this.applyResidentCommand(residentId, command);
    }

    const motion = this.actorState.integrate(this.options.fixedDeltaSeconds);
    this.lastMotionOutcomes = structuredClone(motion);
    for (const outcome of motion) {
      const resident = this.residents.get(outcome.actorId);
      if (!resident) continue;
      this.updateResidentMotionBlockage(resident.runtime, outcome);
      const region = this.regionAt(outcome.after);
      if (region) resident.runtime.enterRegion(region, this.tickValue);
    }
  }

  private updateResidentMotionBlockage(runtime: ResidentRuntime, outcome: ActorMotionOutcome): void {
    const desiredSpeed = Math.hypot(outcome.desiredVelocity.x, outcome.desiredVelocity.y);
    if (outcome.resolution !== "blocked" || desiredSpeed <= MOTION_EPSILON) {
      this.activeMotionBlockages.delete(outcome.actorId);
      return;
    }

    const constraintKey = [...outcome.constraints].sort((a, b) => a.localeCompare(b)).join("+") || "unknown_constraint";
    const activityId = runtime.publicState().activity.id;
    const episodeSignature = `${activityId}:${constraintKey}`;
    if (this.activeMotionBlockages.get(outcome.actorId) === episodeSignature) return;

    this.activeMotionBlockages.set(outcome.actorId, episodeSignature);
    runtime.noteActivityBlocked(
      this.tickValue,
      `physical motion blocked by ${constraintKey}; episode t${this.tickValue}`,
    );
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
    for (const [residentId, registered] of this.residentEntries()) {
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
    return this.actorState.queryRadiusIds(observer.position, releaseRadius)
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

  private applyResidentCommand(actorId: string, command: ReturnType<ResidentRuntime["fastStep"]>): void {
    if (command.kind === "none") return;
    if (command.kind === "move") {
      this.actorState.setDesiredVelocity(actorId, command.desiredVelocity);
      return;
    }
    this.actorState.setDesiredVelocity(actorId, { x: 0, y: 0 });
    this.speak(actorId, command.text, command.radius, command.addressedActorIds);
  }

  private queueOccurrence(occurrence: WorldOccurrence): void {
    const stored = structuredClone(occurrence);
    const observers: OccurrenceObserverSnapshot[] = [];
    for (const residentId of this.actorState.queryRadiusIds(stored.position, stored.radius)) {
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

  private requireActor(id: string): ActorState {
    return this.actorState.require(id);
  }

  private requireResident(id: string): RegisteredResident {
    const resident = this.residents.get(id);
    if (!resident) throw new Error(`unknown resident: ${id}`);
    return resident;
  }

  private residentEntries(): Array<[string, RegisteredResident]> {
    return [...this.residents.entries()].sort((a, b) => a[0].localeCompare(b[0]));
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
