import { findNavigationPath } from "../execution/navigation";
import { World } from "../world/world";
import type { Aabb, ActorEntity, Vec2, WorldActionRequest, WorldActionResult, WorldInput, WorldSnapshot } from "../world/types";
import type { ConversationLine, KnownEntity, ResidentIntent, ResidentModelInput, ResidentProvider, ResidentReply, ResidentViewState } from "./types";

const STILL: WorldInput = { moveX: 0, moveY: 0 };
const SIGHT_DISTANCE = 420;
const TRANSCRIPT_LIMIT = 24;
const TEXT_LIMIT = 1200;
const LABELS: Record<string, string> = {
  "npc.001": "Mira", "player.jozz": "Jozz", "item.hammer": "młotek", "item.mug": "czerwony kubek",
  "item.lantern": "latarnia", workshop: "warsztat", cottage: "domek", grove: "zagajnik",
  yard: "podwórze", "north-path": "północna ścieżka", "yard.table.top": "stół na podwórzu"
};
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const label = (id: string, fallback: string) => (LABELS[id] ?? fallback).slice(0, 120);
const centre = (b: Aabb): Vec2 => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const inBounds = (p: Vec2, b: Aabb, radius = 0) => p.x - radius >= b.x && p.x + radius <= b.x + b.width &&
  p.y - radius >= b.y && p.y + radius <= b.y + b.height;

type Task = { kind: "routine" } | { kind: "wait" } | { kind: "drop" } | { kind: "go" | "follow"; targetId: string } |
  { kind: "fetch"; targetId: string; recipientId: string; phase: "collect" | "deliver" };
type Place = { id: string; label: string; bounds: Aabb; site: boolean };
type Goal = { key: string; position: Vec2; reach: number; sight: boolean; approachRadius?: number; bounds?: Aabb };
type Route = { key: string; target: Vec2; points: Vec2[]; index: number; plannedAt: number };
type PendingRequest = { revision: number; text: string; resolve: () => void };
type ActionDecision = { request: WorldActionRequest; purpose: "collect" | "deliver" | "drop" };
type Decision = { control: WorldInput; action?: ActionDecision };

/** A local resident: World owns every movement and item outcome; AI only chooses an intent. */
export class LivingRuntime {
  private readonly known = new Map<string, KnownEntity>();
  private readonly visible = new Set<string>();
  private readonly places: Place[];
  private readonly conversation: ConversationLine[] = [];
  private lineId = 0;
  private task: Task = { kind: "routine" };
  private activity = "Rozglądam się po podwórzu.";
  private error: string | null = null;
  private lastOutcome: string | null = null;
  private route: Route | null = null;
  private previousMove: Vec2 | null = null;
  private stuckTicks = 0;
  private replanFailures = 0;
  private routineIndex = 0;
  private restUntil = 0;
  private requestRevision = 0;
  private queued: PendingRequest | null = null;
  private inFlight: { revision: number; controller: AbortController } | null = null;
  private latestText = "";

  constructor(private readonly world: World, private readonly provider: ResidentProvider, readonly actorId = "npc.001") {
    const snapshot = world.snapshot();
    this.actor(snapshot);
    this.places = [
      ...snapshot.locations.map(p => ({ id: p.id, label: label(p.id, p.label), bounds: p.bounds, site: false })),
      ...snapshot.placementSites.map(p => ({ id: p.id, label: label(p.id, p.label), bounds: p.bounds, site: true }))
    ].slice(0, 16);
    this.restUntil = world.tick + 60;
    this.observe(snapshot);
    // Authored introduction, not a fabricated model response or past conversation.
    this.addLine("npc", "Cześć, jestem Mira. Miło cię widzieć.");
  }

  state(): ResidentViewState {
    return {
      actorId: this.actorId, name: "Mira", activity: this.activity,
      pending: this.queued !== null || this.inFlight?.revision === this.requestRevision,
      error: this.error, conversation: this.conversation.map(line => ({ ...line })),
      knownEntities: this.remembered(), tick: this.world.tick, lastOutcome: this.lastOutcome
    };
  }

  step(playerControl: WorldInput, playerActions: readonly WorldActionRequest[]): void {
    const before = this.world.snapshot();
    this.observe(before);
    const decision = this.decide(before, this.actor(before));
    // The host calls this once per fixed frame, including while a provider is pending.
    this.world.stepWithActorControls(playerControl, [{ actorId: this.actorId, ...decision.control }], 1 / 30);
    const playerId = before.entities.find(e => e.kind === "player")!.id;
    for (const request of playerActions) {
      if (request.actorId === playerId) this.world.attemptAction(request);
    }
    if (decision.action) {
      const result = this.world.attemptAction(decision.action.request);
      this.observe(this.world.snapshot());
      this.afterAction(decision.action, result);
    }
    this.observe(this.world.snapshot());
  }

  send(text: string): Promise<void> {
    const utterance = text.trim().slice(0, TEXT_LIMIT);
    if (!utterance) return Promise.resolve();
    this.latestText = utterance;
    this.addLine("player", utterance);
    return this.enqueue(utterance);
  }

  stop(): void {
    this.requestRevision++;
    this.inFlight?.controller.abort();
    this.queued?.resolve();
    this.queued = null;
    this.error = null;
    this.task = { kind: "wait" };
    this.clearRoute();
    this.activity = "Stoję. Czekam na kolejne polecenie.";
    const held = this.actor(this.world.snapshot()).heldItemId;
    this.outcome(`Mira zatrzymała się.${held ? " Nadal trzyma niesiony przedmiot." : ""}`, false);
  }

  retry(): Promise<void> {
    return this.error && this.latestText ? this.enqueue(this.latestText) : Promise.resolve();
  }

  private enqueue(text: string): Promise<void> {
    this.requestRevision++;
    this.error = null;
    this.queued?.resolve();
    this.inFlight?.controller.abort();
    return new Promise(resolve => {
      this.queued = { revision: this.requestRevision, text, resolve };
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.inFlight || !this.queued) return;
    const request = this.queued;
    this.queued = null;
    const controller = new AbortController();
    this.inFlight = { revision: request.revision, controller };
    try {
      const snapshot = this.world.snapshot();
      this.observe(snapshot);
      const input: ResidentModelInput = {
        actorId: this.actorId, actorName: "Mira", latestUtterance: request.text,
        conversation: this.conversation.map(({ speaker, text }) => ({ speaker, text })),
        currentActivity: this.activity, heldItemId: this.actor(snapshot).heldItemId,
        knownEntities: this.remembered(), places: this.places.map(({ id, label }) => ({ id, label }))
      };
      const reply = await this.provider(input, controller.signal);
      if (request.revision !== this.requestRevision) return;
      this.validateReply(reply);
      if (reply.reply.trim()) this.addLine("npc", reply.reply.trim().slice(0, TEXT_LIMIT));
      this.applyIntent(reply.intent);
    } catch (error) {
      if (request.revision === this.requestRevision) {
        this.error = error instanceof Error ? error.message : "Nie udało się otrzymać odpowiedzi. Spróbuj ponownie.";
      }
    } finally {
      // Keep this slot until the actual promise settles, even if it ignores abort.
      this.inFlight = null;
      request.resolve();
      void this.pump();
    }
  }

  private validateReply(reply: ResidentReply): void {
    const kind = reply?.intent?.kind;
    if (typeof reply?.reply !== "string" || !["continue", "idle", "wait", "drop", "go", "follow", "fetch"].includes(kind) ||
      (["go", "follow", "fetch"].includes(kind) && !("targetId" in reply.intent && typeof reply.intent.targetId === "string"))) {
      throw new Error("Odpowiedź Miry miała nieprawidłowy format. Spróbuj ponownie.");
    }
  }

  private applyIntent(intent: ResidentIntent): void {
    if (intent.kind === "continue") return;
    this.clearRoute();
    if (intent.kind === "idle") { this.resumeRoutine(); return; }
    if (intent.kind === "wait") {
      this.task = { kind: "wait" };
      this.activity = "Czekam tutaj na kolejne polecenie.";
      return;
    }
    if (intent.kind === "drop") {
      this.task = { kind: "drop" };
      this.activity = "Odkładam trzymany przedmiot.";
      return;
    }
    if (!("targetId" in intent)) return;
    const entity = this.known.get(intent.targetId);
    const place = this.places.find(p => p.id === intent.targetId);
    if ((!entity && !(intent.kind === "go" && place)) || intent.targetId === this.actorId) {
      this.fail("Mira nie zna miejsca tego celu. Może dojść do znanego miejsca i rozejrzeć się tam.");
      return;
    }
    if (intent.kind === "fetch") {
      if (entity?.kind !== "item") { this.fail("Ten cel nie jest przedmiotem, który Mira może przynieść."); return; }
      const snapshot = this.world.snapshot();
      const actor = this.actor(snapshot);
      if (actor.heldItemId && actor.heldItemId !== entity.id) {
        this.fail("Mira ma już zajęte ręce. Najpierw musi odłożyć trzymany przedmiot.");
        return;
      }
      this.task = {
        kind: "fetch", targetId: entity.id, recipientId: snapshot.entities.find(e => e.kind === "player")!.id,
        phase: actor.heldItemId === entity.id ? "deliver" : "collect"
      };
      this.activity = `Idę po: ${entity.label}.`;
    } else if (intent.kind === "follow") {
      if (!entity || entity.kind === "item") { this.fail("Mira może podążać za osobą."); return; }
      this.task = { kind: "follow", targetId: entity.id };
      this.activity = `Podążam za: ${entity.label}.`;
    } else {
      this.task = { kind: "go", targetId: intent.targetId };
      this.activity = `Idę do: ${entity?.label ?? place!.label}.`;
    }
  }

  private decide(snapshot: WorldSnapshot, actor: ActorEntity): Decision {
    if (this.task.kind === "wait") return { control: STILL };
    if (this.task.kind === "drop") return { control: STILL, action: { request: { action: "drop", actorId: this.actorId }, purpose: "drop" } };
    if (this.task.kind === "routine") return this.routine(snapshot, actor);
    const task = this.task;
    if (task.kind === "fetch" && task.phase === "deliver") return this.deliver(snapshot, actor, task);
    const entity = this.known.get(task.targetId);
    const place = this.places.find(p => p.id === task.targetId);
    if (!entity && !place) { this.fail("Mira nie pamięta miejsca tego celu."); return { control: STILL }; }
    const position = entity?.position ?? centre(place!.bounds);
    const currentlyVisible = !!entity && this.visible.has(entity.id);
    const targetLabel = entity?.label ?? place!.label;
    if (task.kind === "fetch" && currentlyVisible && entity?.heldBy) {
      this.fail(`Mira widzi, że ${targetLabel} jest już przez kogoś trzymany.`);
      return { control: STILL };
    }
    this.activity = task.kind === "fetch" ? (currentlyVisible ? `Idę po: ${targetLabel}.` : `Szukam: ${targetLabel}, w ostatnio widzianym miejscu.`) :
      task.kind === "follow" ? (currentlyVisible ? `Podążam za: ${targetLabel}.` : `Idę do ostatnio widzianego miejsca: ${targetLabel}.`) :
      `Idę do: ${targetLabel}.`;
    const goal: Goal = { key: `${task.kind}:${task.targetId}`, position, reach: entity ? (task.kind === "follow" ? 64 : 46) : 18, sight: !!entity };
    if (place && !entity) {
      goal.approachRadius = place.site ? 64 : 100;
      if (!place.site) goal.bounds = place.bounds;
    }
    const motion = this.moveToward(snapshot, actor, goal);
    if (motion === "failed") { this.fail(`Mira nie znalazła przejścia do: ${targetLabel}. Czeka na kolejne polecenie.`); return { control: STILL }; }
    if (motion !== "arrived") return { control: motion };
    if (entity && !currentlyVisible) {
      this.fail(`Mira sprawdziła ostatnio widziane miejsce, ale nie widzi tam: ${targetLabel}.`);
      return { control: STILL };
    }
    if (task.kind === "fetch") return {
      control: STILL, action: { request: { action: "interact", actorId: this.actorId, targetId: task.targetId }, purpose: "collect" }
    };
    if (task.kind === "follow") {
      this.activity = `Jestem blisko: ${targetLabel}. Podążę, kiedy ruszy.`;
    } else {
      this.outcome(`Mira dotarła do: ${targetLabel}.`);
    }
    return { control: STILL };
  }

  private deliver(snapshot: WorldSnapshot, actor: ActorEntity, task: Extract<Task, { kind: "fetch" }>): Decision {
    if (actor.heldItemId !== task.targetId) { this.fail("Mira nie trzyma już przedmiotu, który miała dostarczyć."); return { control: STILL }; }
    const recipient = this.known.get(task.recipientId);
    const item = this.known.get(task.targetId)!;
    if (!recipient) { this.fail("Mira nie wie, gdzie cię szukać. Nadal trzyma przedmiot."); return { control: STILL }; }
    this.activity = `Niosę do ciebie: ${item.label}.`;
    // World drops to the first legal side. Approaching from the left normally leaves
    // the item at the recipient's feet; the actual result is checked after dropping.
    const held = snapshot.entities.find(e => e.id === task.targetId)!;
    const dropDistance = actor.radius + held.radius + 14;
    const preferred = { x: recipient.position.x - dropDistance, y: recipient.position.y };
    const destination = this.legal(snapshot, preferred, actor.radius) ? preferred : recipient.position;
    const motion = this.moveToward(snapshot, actor, { key: `deliver:${task.recipientId}`, position: destination, reach: 5, sight: false });
    if (motion === "failed") { this.fail("Mira nie może do ciebie dotrzeć. Nadal trzyma przedmiot."); return { control: STILL }; }
    if (motion !== "arrived") return { control: motion };
    if (!this.visible.has(recipient.id)) {
      this.fail("Mira doszła do miejsca, gdzie ostatnio cię widziała, ale teraz cię nie widzi. Nadal trzyma przedmiot.");
      return { control: STILL };
    }
    return { control: STILL, action: { request: { action: "drop", actorId: this.actorId }, purpose: "deliver" } };
  }

  private afterAction(decision: ActionDecision, result: WorldActionResult): void {
    if (result.status !== "succeeded") {
      const reasons: Partial<Record<WorldActionResult["code"], string>> = {
        not_holding_item: "Mira nie trzyma żadnego przedmiotu.", target_unavailable: "Przedmiot jest już przez kogoś trzymany.",
        target_occluded: "Przeszkoda zasłania przedmiot.", target_out_of_range: "Przedmiot znalazł się poza zasięgiem Miry.",
        already_holding_item: "Mira ma już zajęte ręce.", target_not_found: "Przedmiotu nie ma w świecie."
      };
      this.fail(reasons[result.code] ?? "Mira nie mogła wykonać tej czynności.");
      return;
    }
    const itemLabel = this.known.get(result.targetId ?? "")?.label ?? "przedmiot";
    if (decision.purpose === "collect" && this.task.kind === "fetch") {
      this.task.phase = "deliver";
      this.clearRoute();
      this.outcome(`Mira podniosła: ${itemLabel}.`, false);
      this.activity = `Niosę do ciebie: ${itemLabel}.`;
    } else if (decision.purpose === "deliver" && this.task.kind === "fetch") {
      const snapshot = this.world.snapshot();
      const item = snapshot.entities.find(e => e.id === result.targetId);
      const player = snapshot.entities.find(e => e.id === this.taskRecipient());
      if (item?.kind === "item" && item.heldBy === null && player && distance(item.position, player.position) <= 54 &&
        this.world.hasLineOfSight(player.position, item.position)) {
        this.outcome(`Mira dostarczyła i odłożyła obok ciebie: ${itemLabel}. Możesz go podnieść.`);
      } else {
        this.fail(`Mira odłożyła: ${itemLabel}, ale przedmiot nie jest w twoim zasięgu.`);
      }
    } else {
      this.outcome(`Mira odłożyła: ${itemLabel}.`);
    }
  }

  private taskRecipient(): string | null { return this.task.kind === "fetch" ? this.task.recipientId : null; }

  private routine(snapshot: WorldSnapshot, actor: ActorEntity): Decision {
    if (snapshot.tick < this.restUntil) return { control: STILL };
    const stops = this.places.filter(p => p.id === "yard" || p.id === "grove").sort((a, b) => a.id === "yard" ? -1 : b.id === "yard" ? 1 : 0);
    const place = stops[this.routineIndex % stops.length];
    if (!place) { this.activity = "Rozglądam się spokojnie."; return { control: STILL }; }
    this.activity = `Spaceruję do: ${place.label}.`;
    const motion = this.moveToward(snapshot, actor, { key: `routine:${place.id}`, position: centre(place.bounds), reach: 18, sight: false, approachRadius: 100, bounds: place.bounds });
    if (motion === "failed") { this.fail("Mira nie znalazła przejścia na spacerze. Zatrzymała się."); return { control: STILL }; }
    if (motion === "arrived") {
      this.routineIndex++;
      this.restUntil = snapshot.tick + 150;
      this.activity = `Odpoczywam: ${place.label}.`;
      this.clearRoute();
      return { control: STILL };
    }
    return { control: motion };
  }

  private moveToward(snapshot: WorldSnapshot, actor: ActorEntity, goal: Goal): WorldInput | "arrived" | "failed" {
    if (distance(actor.position, goal.position) <= goal.reach && (!goal.sight || this.world.hasLineOfSight(actor.position, goal.position))) {
      this.clearRoute();
      return "arrived";
    }
    if (this.previousMove) {
      this.stuckTicks = distance(actor.position, this.previousMove) < 0.05 ? this.stuckTicks + 1 : 0;
      if (this.stuckTicks >= 30) {
        this.route = null;
        this.stuckTicks = 0;
        if (++this.replanFailures > 1) return "failed";
      }
    }
    if (!this.route || this.route.key !== goal.key || distance(this.route.target, goal.position) > 24 || snapshot.tick - this.route.plannedAt > 240) {
      const points = this.plan(snapshot, actor, goal);
      if (!points) return "failed";
      this.route = { key: goal.key, target: { ...goal.position }, points, index: 0, plannedAt: snapshot.tick };
    }
    while (this.route.index < this.route.points.length && distance(actor.position, this.route.points[this.route.index]) < 0.05) this.route.index++;
    if (this.route.index >= this.route.points.length) {
      if (goal.approachRadius !== undefined) { this.clearRoute(); return "arrived"; }
      // A moving target can drift less than the normal replan threshold.
      this.route = null;
      this.previousMove = null;
      return STILL;
    }
    const next = this.route.points[this.route.index];
    const length = distance(actor.position, next);
    const scale = Math.min(1, length / (this.world.actorSpeed / 30));
    this.previousMove = { ...actor.position };
    return { moveX: (next.x - actor.position.x) / length * scale, moveY: (next.y - actor.position.y) / length * scale };
  }

  private plan(snapshot: WorldSnapshot, actor: ActorEntity, goal: Goal): Vec2[] | null {
    const candidates: Vec2[] = [{ ...goal.position }];
    const reach = goal.approachRadius ?? goal.reach;
    for (const radius of [reach * 0.55, reach * 0.95]) {
      for (let i = 0; i < 12; i++) candidates.push({ x: goal.position.x + Math.cos(i * Math.PI / 6) * radius, y: goal.position.y + Math.sin(i * Math.PI / 6) * radius });
    }
    const fallbacks = candidates.slice(1).sort((a, b) => distance(actor.position, a) - distance(actor.position, b));
    for (const candidate of [candidates[0], ...fallbacks]) {
      if (!this.legal(snapshot, candidate, actor.radius) || (goal.bounds && !inBounds(candidate, goal.bounds, actor.radius))) continue;
      if (goal.sight && !this.world.hasLineOfSight(candidate, goal.position)) continue;
      const route = findNavigationPath(snapshot, actor.position, candidate, actor.radius);
      if (route) return route;
    }
    return null;
  }

  private legal(snapshot: WorldSnapshot, p: Vec2, radius: number): boolean {
    return inBounds(p, { x: 0, y: 0, width: snapshot.width, height: snapshot.height }, radius) && !snapshot.blockers.some(({ bounds: b }) =>
      p.x >= b.x - radius && p.x <= b.x + b.width + radius && p.y >= b.y - radius && p.y <= b.y + b.height + radius);
  }

  private observe(snapshot: WorldSnapshot): void {
    const actor = this.actor(snapshot);
    this.visible.clear();
    for (const entity of snapshot.entities) {
      if (entity.id !== actor.id && (distance(actor.position, entity.position) > SIGHT_DISTANCE || !this.world.hasLineOfSight(actor.position, entity.position))) continue;
      this.visible.add(entity.id);
      this.known.set(entity.id, {
        id: entity.id, label: entity.id === actor.id ? "Mira" : label(entity.id, entity.label), kind: entity.kind,
        position: { ...entity.position }, seenAtTick: snapshot.tick,
        ...(entity.kind === "item" ? { heldBy: entity.heldBy } : {})
      });
    }
    if (this.known.size > 64) {
      const oldest = [...this.known.values()].filter(e => e.id !== actor.id).sort((a, b) => a.seenAtTick - b.seenAtTick);
      for (const entity of oldest.slice(0, this.known.size - 64)) this.known.delete(entity.id);
    }
  }

  private actor(snapshot: WorldSnapshot): ActorEntity {
    const actor = snapshot.entities.find(e => e.id === this.actorId);
    if (!actor || actor.kind !== "npc") throw new Error(`LivingRuntime requires an NPC actor: ${this.actorId}`);
    return actor;
  }
  private remembered(): KnownEntity[] { return [...this.known.values()].map(entity => ({ ...entity, position: { ...entity.position } })); }
  private addLine(speaker: ConversationLine["speaker"], text: string): void {
    this.conversation.push({ id: ++this.lineId, speaker, text: text.slice(0, TEXT_LIMIT) });
    if (this.conversation.length > TRANSCRIPT_LIMIT) this.conversation.splice(0, this.conversation.length - TRANSCRIPT_LIMIT);
  }
  private clearRoute(): void { this.route = null; this.previousMove = null; this.stuckTicks = 0; this.replanFailures = 0; }
  private resumeRoutine(): void {
    this.task = { kind: "routine" };
    this.clearRoute();
    this.restUntil = this.world.tick + 120;
    this.activity = "Chwilę odpoczywam, potem wrócę do spaceru.";
  }
  private outcome(text: string, completed = true): void {
    this.lastOutcome = text;
    this.addLine("world", text);
    if (completed) this.resumeRoutine();
  }
  private fail(text: string): void {
    this.outcome(text, false);
    this.task = { kind: "wait" };
    this.clearRoute();
    this.activity = "Nie mogę dokończyć zadania. Czekam na kolejne polecenie.";
  }
}
