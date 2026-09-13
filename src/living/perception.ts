import type { ActorEntity, SpeechMode, Vec2, WorldActionResult, WorldEntity, WorldOccurrence, WorldSnapshot } from "../world/types";
import { World } from "../world/world";
import type { KnownEntity, ReceivedSpeech, ResidentExperience } from "./types";

// Game parameters, not a claim to model human optics or acoustics.
export const RESIDENT_SIGHT = 420;
export const RESIDENT_SPEECH_RANGE: Record<SpeechMode, { clear: number; occluded: number }> = {
  quiet: { clear: 120, occluded: 40 },
  normal: { clear: 420, occluded: 180 },
  call: { clear: 700, occluded: 460 }
};
const EXPERIENCE_LIMIT = 96;
const HALF_FIELD = Math.PI / 2;
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export interface HeardCall {
  /** Sequence of calls received by this listener, not the world's call counter. */
  seq: number; tick: number; sourceId?: string;
  listenerPosition: Vec2; direction: Vec2; distanceBand: "near" | "far";
}

/** The only living-mind adapter allowed to inspect other actors' physical state. */
export class ResidentPerception {
  readonly known = new Map<string, KnownEntity>();
  readonly visible = new Set<string>();
  private readonly experiences: ResidentExperience[] = [];
  private readonly calls: HeardCall[] = [];
  private readonly speech: ReceivedSpeech[] = [];
  private readonly unsubscribe: () => void;
  private experienceId = 0;
  private callSequence = 0;
  private disposed = false;

  constructor(private readonly world: World, readonly actorId: string, private readonly label: (id: string, fallback: string) => string) {
    this.unsubscribe = world.onOccurrence((occurrence, snapshot) => this.receive(occurrence, snapshot));
  }

  /** Stops future occurrence reception while leaving acquired memory readable. */
  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
  }

  observe(snapshot: WorldSnapshot): void {
    const actor = snapshot.entities.find(e => e.id === this.actorId) as ActorEntity;
    const previouslyVisible = new Set(this.visible);
    this.visible.clear();
    for (const entity of snapshot.entities) {
      const body = entity.id === actor.id || (entity.kind === "item" && entity.heldBy === actor.id);
      if (!body && !this.canSeeEntity(actor, entity)) continue;
      const previous = this.known.get(entity.id);
      this.visible.add(entity.id);
      const elapsed = previous ? snapshot.tick - previous.seenAtTick : 0;
      const observedMotion = previous && elapsed > 0 && elapsed <= 30 && previouslyVisible.has(entity.id)
        ? { x: (entity.position.x - previous.position.x) / elapsed, y: (entity.position.y - previous.position.y) / elapsed }
        : elapsed === 0 ? previous?.observedMotion : undefined;
      const name = this.label(entity.id, entity.label);
      this.known.set(entity.id, {
        id: entity.id, label: name, kind: entity.kind, position: { ...entity.position },
        seenAtTick: snapshot.tick, visible: !body, source: body ? "body" : "sight",
        ...(observedMotion ? { observedMotion } : {}),
        ...(entity.kind === "item" ? { heldBy: entity.heldBy, ...(entity.appearance ? { appearance: { ...entity.appearance } } : {}) } : {})
      });
      if (!body && !previouslyVisible.has(entity.id)) {
        this.record(snapshot.tick, "noticed", `${previous ? "Znowu widzę" : "Zauważam"}: ${name}.`, { subjectId: entity.id });
      }
      if (!body && entity.kind === "item" && previous && previous.heldBy !== entity.heldBy) {
        // Seeing the changed state does not prove that an unseen transfer was witnessed.
        const holder = entity.heldBy ? this.known.get(entity.heldBy)?.label : null;
        this.record(snapshot.tick, "noticed", `Widzę teraz: ${name}, ${entity.heldBy ? `trzymany przez ${holder ?? "kogoś"}` : "odłożony"}.`, { subjectId: entity.id });
      }
    }
    for (const entity of this.known.values()) {
      if (this.visible.has(entity.id)) continue;
      entity.visible = false;
      if (previouslyVisible.has(entity.id)) this.record(snapshot.tick, "lost_sight", `Tracę z oczu: ${entity.label}. To nie znaczy, że zniknął ze świata.`, { subjectId: entity.id });
      if (this.canSeePoint(actor, entity.position) && (entity.lastCheckedAbsentAtTick ?? -1) < entity.seenAtTick) {
        entity.lastCheckedAbsentAtTick = snapshot.tick;
        this.record(snapshot.tick, "checked_absent", `Widzę ostatnio zapamiętane miejsce: ${entity.label}, ale teraz go tam nie widzę. Nie znam jego nowej pozycji.`, { subjectId: entity.id });
      }
    }
    if (this.known.size > 64) {
      const oldest = [...this.known.values()].filter(e => !this.visible.has(e.id)).sort((a, b) => a.seenAtTick - b.seenAtTick);
      for (const entity of oldest.slice(0, this.known.size - 64)) this.known.delete(entity.id);
    }
  }

  canSeePoint(actor: ActorEntity, point: Vec2): boolean {
    const dx = point.x - actor.position.x, dy = point.y - actor.position.y;
    const length = Math.hypot(dx, dy);
    if (length > RESIDENT_SIGHT) return false;
    if (length > 1e-6 && (dx * actor.facing.x + dy * actor.facing.y) / length < Math.cos(HALF_FIELD) - 1e-6) return false;
    return this.world.hasLineOfSight(actor.position, point);
  }

  private canSeeEntity(actor: ActorEntity, entity: WorldEntity): boolean {
    // An exposed edge can be visible even when a centre ray grazes a corner.
    return [entity.position, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => ({
      x: entity.position.x + x * entity.radius * 0.75, y: entity.position.y + y * entity.radius * 0.75
    }))].some(point => this.canSeePoint(actor, point));
  }

  private receive(occurrence: WorldOccurrence, snapshot: WorldSnapshot): void {
    // Also covers disposal by an earlier listener during the current dispatch.
    if (this.disposed) return;
    const actor = snapshot.entities.find((entity): entity is ActorEntity =>
      entity.id === this.actorId && (entity.kind === "npc" || entity.kind === "player"));
    if (!actor) return;
    if (occurrence.type === "speech.spoken") {
      const self = occurrence.actorId === actor.id;
      if (!self && !this.canHear(actor, occurrence.position, occurrence.mode)) return;
      // The game's voice-recognition rule uses an already acquired identity.
      // Hearing alone never acquires that identity or updates visual memory.
      const sourceId = self || this.known.has(occurrence.actorId) ? occurrence.actorId : undefined;
      const refs = sourceId ? { sourceId } : {};
      const id = this.record(occurrence.tick, self ? "action" : "heard_speech", self
        ? `Mówię: „${occurrence.text}”.`
        : `Słyszę ${sourceId ? this.known.get(sourceId)!.label : "czyjś głos"}: „${occurrence.text}”.`, refs);
      this.speech.push({ id, tick: occurrence.tick, ...refs, text: occurrence.text });
      if (occurrence.mode === "call") this.hearCall(occurrence, actor);
      return;
    }
    if (occurrence.type === "call.emitted") {
      this.hearCall(occurrence, actor);
      return;
    }
    const performer = snapshot.entities.find((entity): entity is ActorEntity =>
      entity.id === occurrence.actorId && (entity.kind === "npc" || entity.kind === "player"));
    const self = occurrence.actorId === actor.id;
    // Seeing only the final item state is insufficient to claim a witnessed transfer.
    if (!self && (!performer || !this.canSeeEntity(actor, performer) ||
      !this.canSeeEntity(actor, occurrence.before) || !this.canSeeEntity(actor, occurrence.after))) return;
    const sourceId = self || this.known.has(occurrence.actorId) ? occurrence.actorId : undefined;
    const item = this.known.get(occurrence.entityId);
    const who = self ? "Ja" : sourceId ? this.known.get(sourceId)!.label : "Ktoś";
    this.record(occurrence.tick, "witnessed_manipulation",
      `Widzę czynność: ${who} ${occurrence.type === "item.picked_up" ? "podnosi" : "odkłada"} ${item?.label ?? "przedmiot"}.`,
      { ...(sourceId ? { sourceId } : {}), ...(item ? { subjectId: item.id } : {}) });
  }

  private canHear(actor: ActorEntity, position: Vec2, mode: SpeechMode): boolean {
    const ranges = RESIDENT_SPEECH_RANGE[mode];
    const range = this.world.hasLineOfSight(actor.position, position) ? ranges.clear : ranges.occluded;
    return distance(actor.position, position) <= range;
  }

  private hearCall(call: { actorId: string; position: Vec2; tick: number }, actor: ActorEntity): void {
    if (call.actorId === actor.id || !this.canHear(actor, call.position, "call")) return;
    const length = distance(actor.position, call.position);
    const angle = Math.round(Math.atan2(call.position.y - actor.position.y, call.position.x - actor.position.x) / (Math.PI / 4)) * Math.PI / 4;
    const sourceId = this.known.has(call.actorId) ? call.actorId : undefined;
    const cue: HeardCall = {
      seq: ++this.callSequence, tick: call.tick, ...(sourceId ? { sourceId } : {}), listenerPosition: { ...actor.position },
      direction: { x: Math.cos(angle), y: Math.sin(angle) }, distanceBand: length <= 180 ? "near" : "far"
    };
    this.calls.push(cue);
    if (this.calls.length > 8) this.calls.shift();
    const directions = ["wschodu", "południowego wschodu", "południa", "południowego zachodu", "zachodu", "północnego zachodu", "północy", "północnego wschodu"];
    const direction = directions[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
    this.record(call.tick, "heard_call", `Słyszę ${sourceId ? `wołanie: ${this.known.get(sourceId)!.label}` : "czyjeś wołanie"}, ${cue.distanceBand === "near" ? "blisko" : "z dalsza"}, z okolic ${direction}. To przybliżony kierunek, nie widziana pozycja.`,
      sourceId ? { sourceId } : {});
  }

  latestCall(targetId?: string): HeardCall | undefined {
    const cue = [...this.calls].reverse().find(c => (!targetId || c.sourceId === targetId) && this.world.tick - c.tick <= 300);
    return cue ? structuredClone(cue) : undefined;
  }

  action(result: WorldActionResult): void {
    if (result.actorId !== this.actorId) return;
    this.record(result.tick, "action", result.status === "succeeded"
      ? `Moja czynność fizyczna powiodła się: ${result.code}.`
      : `Moja czynność fizyczna nie powiodła się: ${result.code}. To wynik próby, nie dowód o całym świecie.`,
      { sourceId: this.actorId, ...(result.targetId && this.known.has(result.targetId) ? { subjectId: result.targetId } : {}) });
  }

  record(tick: number, kind: ResidentExperience["kind"], text: string,
    refs: Pick<ResidentExperience, "sourceId" | "subjectId"> = {}): number {
    const id = ++this.experienceId;
    this.experiences.push({ id, tick, kind, text, ...refs });
    if (this.experiences.length > EXPERIENCE_LIMIT) this.experiences.shift();
    // Retained word receipts always resolve to one of this listener's retained experiences.
    while (this.speech.length && this.speech[0].id < this.experiences[0].id) this.speech.shift();
    return id;
  }

  remembered(): KnownEntity[] { return structuredClone([...this.known.values()]); }
  recentExperiences(): ResidentExperience[] { return structuredClone(this.experiences); }
  recentSpeech(): ReceivedSpeech[] { return structuredClone(this.speech); }
}
