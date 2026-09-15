import { ChunkSpatialIndex, type SpatialQueryStats } from "./chunk-spatial-index";
import {
  clamp,
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

interface RegisteredResident {
  runtime: ResidentRuntime;
  brainPhase: number;
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
  private pendingOccurrences: WorldOccurrence[] = [];
  private readonly recentOccurrences: WorldOccurrence[] = [];
  private readonly visibleByResident = new Map<string, Set<string>>();

  constructor(readonly options: SpcWorldOptions) {
    if (options.fixedDeltaSeconds <= 0) throw new Error("fixedDeltaSeconds must be positive");
    const regionIds = new Set<string>();
    for (const region of options.regions) {
      if (regionIds.has(region.id)) throw new Error(`duplicate region id: ${region.id}`);
      regionIds.add(region.id);
    }
    this.spatial = new ChunkSpatialIndex(options.chunkSize);
  }

  get tick(): number {
    return this.tickValue;
  }

  addPlayer(id: string, position: Vec2, overrides: Partial<Omit<ActorState, "id" | "kind" | "position">> = {}): void {
    this.addActor({
      id,
      kind: "player",
      position: this.clampPosition(position),
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
    if (profile.brainIntervalTicks < 1) throw new Error("brainIntervalTicks must be positive");
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
    this.residents.set(id, { runtime, brainPhase });
    this.visibleByResident.set(id, new Set());
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
    resident.runtime.setActivity(activity, this.tickValue);
    const actor = this.requireActor(residentId);
    actor.velocity = { x: 0, y: 0 };
  }

  setActorVelocity(actorId: string, velocity: Vec2): void {
    const actor = this.requireActor(actorId);
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed > actor.maxSpeed && speed > 0) {
      const scale = actor.maxSpeed / speed;
      actor.velocity = { x: velocity.x * scale, y: velocity.y * scale };
    } else {
      actor.velocity = { ...velocity };
    }
  }

  speak(
    actorId: string,
    text: string,
    radius?: number,
    addressedActorIds: readonly string[] = [],
  ): WorldOccurrence {
    const actor = this.requireActor(actorId);
    for (const addressedId of addressedActorIds) this.requireActor(addressedId);
    const occurrence: WorldOccurrence = {
      id: `occurrence:${this.tickValue}:${this.occurrenceSequence++}`,
      tick: this.tickValue,
      kind: "speech",
      actorId,
      subjectId: null,
      position: { ...actor.position },
      radius: radius ?? actor.hearingRadius,
      summary: "speech",
      text,
      addressedActorIds: [...new Set(addressedActorIds)],
    };
    this.queueOccurrence(occurrence);
    return structuredClone(occurrence);
  }

  emitInteraction(actorId: string, subjectId: string | null, summary: string, radius = 520): WorldOccurrence {
    const actor = this.requireActor(actorId);
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
    if (!Number.isInteger(steps) || steps < 1) throw new Error("steps must be a positive integer");
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
    return this.options.regions.find((region) => (
      position.x >= region.minX
      && position.x <= region.maxX
      && position.y >= region.minY
      && position.y <= region.maxY
    )) ?? null;
  }

  private stepOnce(): void {
    this.tickValue += 1;
    const occurrences = this.pendingOccurrences;
    this.pendingOccurrences = [];

    for (const occurrence of occurrences) this.deliverOccurrence(occurrence);
    this.updateSightEntryPercepts();

    for (const [residentId, registered] of this.residents) {
      if (this.tickValue % registered.runtime.profile.brainIntervalTicks !== registered.brainPhase) continue;
      const actor = this.requireActor(residentId);
      const visibleActors = this.visibleActorsFor(actor);
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

  private deliverOccurrence(occurrence: WorldOccurrence): void {
    const candidates = this.spatial.queryRadius(occurrence.position, occurrence.radius);
    for (const residentId of candidates) {
      if (residentId === occurrence.actorId) continue;
      const registered = this.residents.get(residentId);
      if (!registered) continue;
      const residentActor = this.requireActor(residentId);
      const distanceSq = distanceSquared(residentActor.position, occurrence.position);

      let modality: ResidentPercept["modality"] | null = null;
      let spatial: PerceptSpatialCue = { kind: "none" };
      if (occurrence.kind === "speech") {
        const range = Math.min(occurrence.radius, residentActor.hearingRadius);
        if (distanceSq <= range * range) {
          modality = "hearing";
          spatial = directionalHearingCue(residentActor.position, occurrence.position, range);
        }
      } else {
        const range = Math.min(occurrence.radius, residentActor.sightRadius);
        if (distanceSq <= range * range) {
          modality = "sight";
          spatial = { kind: "exact", position: { ...occurrence.position } };
        }
      }
      if (!modality) continue;

      registered.runtime.ingestPercepts([{
        id: `percept:${residentId}:${this.tickValue}:${this.perceptSequence++}`,
        occurrenceId: occurrence.id,
        tick: this.tickValue,
        modality,
        actorId: occurrence.actorId,
        subjectId: occurrence.subjectId,
        spatial,
        summary: occurrence.summary,
        text: occurrence.text,
        addressed: occurrence.addressedActorIds.includes(residentId),
      }], residentActor.position);
    }
  }

  private updateSightEntryPercepts(): void {
    for (const [residentId, registered] of this.residents) {
      const actor = this.requireActor(residentId);
      const previous = this.visibleByResident.get(residentId) ?? new Set<string>();
      const visible = this.visibleActorsFor(actor);
      const current = new Set(visible.map((candidate) => candidate.id));
      const newPercepts: ResidentPercept[] = [];

      for (const candidate of visible) {
        if (previous.has(candidate.id)) continue;
        newPercepts.push({
          id: `percept:${residentId}:${this.tickValue}:${this.perceptSequence++}`,
          occurrenceId: `sight-entry:${residentId}:${candidate.id}:${this.tickValue}`,
          tick: this.tickValue,
          modality: "sight",
          actorId: candidate.id,
          subjectId: candidate.id,
          spatial: { kind: "exact", position: { ...candidate.position } },
          summary: `actor ${candidate.id} entered sight`,
          text: null,
          addressed: false,
        });
      }

      if (newPercepts.length > 0) registered.runtime.ingestPercepts(newPercepts, actor.position);
      this.visibleByResident.set(residentId, current);
    }
  }

  private visibleActorsFor(observer: ActorState): VisibleActor[] {
    return this.spatial.queryRadius(observer.position, observer.sightRadius)
      .filter((id) => id !== observer.id)
      .map((id) => this.requireActor(id))
      .filter((candidate) => distanceSquared(observer.position, candidate.position) <= observer.sightRadius ** 2)
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
    this.pendingOccurrences.push(stored);
    this.recentOccurrences.push(structuredClone(stored));
    while (this.recentOccurrences.length > WORLD_OCCURRENCE_LIMIT) this.recentOccurrences.shift();
  }

  private addActor(actor: ActorState): void {
    if (this.actors.has(actor.id)) throw new Error(`actor already exists: ${actor.id}`);
    this.actors.set(actor.id, structuredClone(actor));
    this.spatial.upsert(actor.id, actor.position);
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
    return {
      x: clamp(position.x, this.options.bounds.minX, this.options.bounds.maxX),
      y: clamp(position.y, this.options.bounds.minY, this.options.bounds.maxY),
    };
  }
}

function directionalHearingCue(observer: Vec2, source: Vec2, range: number): PerceptSpatialCue {
  const distance = Math.sqrt(distanceSquared(observer, source));
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
