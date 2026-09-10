import { findNavigationPath } from "../execution/navigation";
import { World } from "../world/world";
import type { Aabb, ActorEntity, Vec2, WorldActionRequest, WorldActionResult, WorldInput, WorldSnapshot } from "../world/types";
import type { ConversationLine, ItemDescription, KnownEntity, ResidentIntent, ResidentModelInput, ResidentProvider, ResidentReply, ResidentViewState } from "./types";
import { parseResidentReply } from "./provider";
import { ResidentPerception } from "./perception";
import { searchViewpoints } from "./search";

const STILL: WorldInput = { moveX: 0, moveY: 0 };
const TRANSCRIPT_LIMIT = 24;
const TEXT_LIMIT = 1200;
const LABELS: Record<string, string> = {
  "npc.001": "Mira", "player.jozz": "Jozz", "item.hammer": "młotek", "item.mug": "czerwony kubek",
  "item.lantern": "latarnia", "item.blue-mug": "niebieski kubek", workshop: "warsztat", cottage: "domek", grove: "zagajnik",
  yard: "podwórze", "north-path": "północna ścieżka", "yard.table.top": "stół na podwórzu"
};
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const label = (id: string, fallback: string) => (LABELS[id] ?? fallback).slice(0, 120);
const centre = (b: Aabb): Vec2 => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const inBounds = (p: Vec2, b: Aabb, radius = 0) => p.x - radius >= b.x && p.x + radius <= b.x + b.width &&
  p.y - radius >= b.y && p.y + radius <= b.y + b.height;

type Task = { kind: "routine" } | { kind: "find" } | { kind: "wait" } | { kind: "drop" } | { kind: "go" | "follow" | "search"; targetId: string } |
  { kind: "fetch"; targetId: string; recipientId: string; phase: "collect" | "deliver" };
type Place = { id: string; label: string; bounds: Aabb; site: boolean };
type Goal = { key: string; position: Vec2; reach: number; sight: boolean; approachRadius?: number; bounds?: Aabb };
type Route = { key: string; target: Vec2; points: Vec2[]; index: number; plannedAt: number };
type PendingRequest = { revision: number; text: string; resolve: () => void };
type ActionDecision = { request: WorldActionRequest; purpose: "collect" | "deliver" | "drop" };
type Decision = { control: WorldInput; action?: ActionDecision };
type Scan = { startedAt: number; angle: number };
type Search = { targetId: string; startedAt: number; cueSequence: number; points: Vec2[]; index: number; scan?: Scan; exhausted: boolean };
type Collection = { description: ItemDescription; quantity: "one" | "all"; delivered: string[]; unavailable: string[];
  places: Place[]; placeIndex: number; scan: Scan | null; reportKey: string | null };

/** Every resident observes the same frame. Adding residents must not multiply World time. */
export function stepLivingResidents(world: World, residents: readonly LivingRuntime[], playerControl: WorldInput, playerActions: readonly WorldActionRequest[]): void {
  const before = world.snapshot();
  const ordered = [...residents].sort((a, b) => a.actorId.localeCompare(b.actorId));
  const frames = ordered.map(resident => ({ resident, decision: resident.prepareFrame(before) }));
  world.stepWithActorControls(playerControl, frames.map(({ resident, decision }) => ({ actorId: resident.actorId, ...decision.control })), 1 / 30);
  const playerId = before.entities.find(e => e.kind === "player")!.id;
  for (const request of playerActions) if (request.actorId === playerId) world.attemptAction(request);
  const results = frames.map(({ decision }) => decision.action ? world.attemptAction(decision.action.request) : undefined);
  const after = world.snapshot();
  frames.forEach(({ resident, decision }, index) => resident.completeFrame(after, decision, results[index]));
}

/** A local resident: World owns every movement and item outcome; AI only chooses an intent. */
export class LivingRuntime {
  private readonly perception: ResidentPerception;
  private readonly known: Map<string, KnownEntity>;
  private readonly visible: Set<string>;
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
  private search: Search | null = null;
  private arrivalScan: Scan | null = null;
  private collection: Collection | null = null;
  private completedCollection: Collection | null = null;
  private readonly deliveredAt = new Map<string, number>();

  constructor(private readonly world: World, private readonly provider: ResidentProvider, readonly actorId = "npc.001") {
    this.perception = new ResidentPerception(world, actorId, (id, fallback) => id === actorId ? "Mira" : label(id, fallback));
    this.known = this.perception.known;
    this.visible = this.perception.visible;
    const snapshot = world.snapshot();
    this.actor(snapshot);
    this.places = [
      ...snapshot.locations.map(p => ({ id: p.id, label: label(p.id, p.label), bounds: p.bounds, site: false })),
      ...snapshot.placementSites.map(p => ({ id: p.id, label: label(p.id, p.label), bounds: p.bounds, site: true }))
    ].slice(0, 16);
    this.restUntil = world.tick + 60;
    this.observe(snapshot);
    // Authored introduction, not a fabricated model response or past conversation.
    this.addLine("npc", this.visible.has("player.jozz") ? "Cześć, jestem Mira. Miło cię widzieć." : "Cześć, jestem Mira.");
  }

  state(): ResidentViewState {
    return {
      actorId: this.actorId, name: "Mira", activity: this.activity,
      pending: this.queued !== null || this.inFlight?.revision === this.requestRevision,
      error: this.error, conversation: this.conversation.map(line => ({ ...line })),
      knownEntities: this.remembered(), tick: this.world.tick, lastOutcome: this.lastOutcome,
      contact: this.visible.has("player.jozz") ? "Mira widzi Cię" : this.perception.latestCall("player.jozz") ? "Mira słyszała Twoje wołanie" : "Jesteś poza wzrokiem Miry",
      experiences: this.perception.recentExperiences()
    };
  }

  step(playerControl: WorldInput, playerActions: readonly WorldActionRequest[]): void {
    // Single-resident convenience for existing callers. Multi-resident hosts use stepLivingResidents once.
    stepLivingResidents(this.world, [this], playerControl, playerActions);
  }

  prepareFrame(snapshot: WorldSnapshot): Decision {
    this.observe(snapshot);
    const actor = this.actor(snapshot);
    const decision = this.decide(snapshot, actor);
    const targetId = this.task.kind === "fetch" && this.task.phase === "deliver" ? this.task.recipientId : "targetId" in this.task ? this.task.targetId : null;
    const attended = targetId && this.visible.has(targetId) ? this.known.get(targetId) : null;
    if (!decision.control.lookDirection && attended) {
      decision.control = { ...decision.control, lookDirection: { x: attended.position.x - actor.position.x, y: attended.position.y - actor.position.y } };
    }
    if (!decision.control.lookDirection && !decision.control.moveX && !decision.control.moveY) {
      decision.control = this.attend(snapshot, actor);
    }
    return decision;
  }

  completeFrame(snapshot: WorldSnapshot, decision: Decision, result?: WorldActionResult): void {
    this.observe(snapshot);
    if (decision.action && result) {
      this.perception.action(result);
      this.afterAction(decision.action, result);
    }
  }

  callFromPlayer(): void {
    const player = this.world.snapshot().entities.find(e => e.kind === "player")!;
    this.world.callOut(player.id);
    this.observe(this.world.snapshot());
    this.addLine("world", "Wołasz Mirę. Głos daje jej wskazówkę tylko wtedy, gdy do niej dociera.");
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
    this.collection = null;
    this.search = null;
    this.arrivalScan = null;
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
      const deliveryAtRequest = this.task.kind === "fetch" ? this.task.targetId : null;
      const collectionAtRequest = this.collection;
      this.observe(snapshot);
      const input: ResidentModelInput = {
        actorId: this.actorId, actorName: "Mira", latestUtterance: request.text,
        conversation: this.conversation.map(({ speaker, text }) => ({ speaker, text })),
        currentActivity: this.activity, heldItemId: this.actor(snapshot).heldItemId,
        knownEntities: this.remembered(), places: this.places.map(({ id, label }) => ({ id, label })),
        experiences: this.perception.recentExperiences(),
        ...(this.collection ? { currentCommitment: ("Aktywny zamiar. " + this.commitmentDescription(this.collection)).slice(0, 1200) }
          : this.completedCollection ? { currentCommitment: ("Ten zamiar jest już zakończony, nie wykonuj go ponownie. " + this.commitmentDescription(this.completedCollection)).slice(0, 1200) } : {})
      };
      const reply = await this.provider(input, controller.signal);
      if (request.revision !== this.requestRevision) return;
      this.validateReply(reply, input);
      if (reply.intent.kind === "find_item" && collectionAtRequest && this.completedCollection === collectionAtRequest &&
        this.sameCollection(collectionAtRequest, reply.intent)) {
        this.addLine("world", "To zbieranie rzeczy zostało już zakończone podczas rozmowy.");
        return;
      }
      if (reply.intent.kind === "fetch" && reply.intent.targetId === deliveryAtRequest &&
        (this.deliveredAt.get(reply.intent.targetId) ?? -1) > snapshot.tick) {
        this.addLine("world", "Ta dostawa została już wykonana podczas rozmowy.");
        return;
      }
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

  private validateReply(reply: ResidentReply, input: ResidentModelInput): void {
    if (!parseResidentReply(reply, input)) {
      throw new Error("Odpowiedź Miry miała nieprawidłowy format. Spróbuj ponownie.");
    }
  }

  private applyIntent(intent: ResidentIntent): void {
    if (intent.kind === "continue") return;
    if (intent.kind === "find_item" && this.collection && this.sameCollection(this.collection, intent)) return;
    this.collection = null;
    this.search = null;
    this.arrivalScan = null;
    this.clearRoute();
    if (intent.kind === "find_item") {
      const actor = this.actor(this.world.snapshot());
      const places = this.places.filter(p => intent.description.withinPlaceId ? p.id === intent.description.withinPlaceId : !p.site).sort((a, b) =>
        a.id === intent.description.nearPlaceId ? -1 : b.id === intent.description.nearPlaceId ? 1 :
          distance(actor.position, centre(a.bounds)) - distance(actor.position, centre(b.bounds)));
      this.collection = { description: { ...intent.description }, quantity: intent.quantity, delivered: [], unavailable: [], places,
        placeIndex: 0, scan: null, reportKey: null };
      this.task = { kind: "find" };
      this.activity = "Szukam przedmiotów pasujących do prośby. Zacznę od znanych mi rzeczy i miejsc.";
      return;
    }
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
    } else if (intent.kind === "search") {
      this.task = { kind: "search", targetId: intent.targetId };
      this.activity = `Szukam: ${entity!.label}.`;
    } else {
      this.task = { kind: "go", targetId: intent.targetId };
      this.activity = `Idę do: ${entity?.label ?? place!.label}.`;
    }
  }

  private decide(snapshot: WorldSnapshot, actor: ActorEntity): Decision {
    if (this.task.kind === "wait") return { control: STILL };
    if (this.task.kind === "drop") return { control: STILL, action: { request: { action: "drop", actorId: this.actorId }, purpose: "drop" } };
    if (this.task.kind === "routine") return this.routine(snapshot, actor);
    if (this.task.kind === "find") return this.findItems(snapshot, actor);
    const task = this.task;
    if (task.kind === "fetch" && task.phase === "deliver") return this.deliver(snapshot, actor, task);
    const entity = this.known.get(task.targetId);
    const place = this.places.find(p => p.id === task.targetId);
    if (!entity && !place) { this.fail("Mira nie pamięta miejsca tego celu."); return { control: STILL }; }
    const position = entity?.position ?? centre(place!.bounds);
    const currentlyVisible = !!entity && this.visible.has(entity.id);
    const targetLabel = entity?.label ?? place!.label;
    if (entity && !currentlyVisible) return this.searchFor(snapshot, actor, entity);
    if (this.search) {
      this.perception.record(snapshot.tick, "search", `Odnalazłam: ${targetLabel}. Wracam do rozpoczętego działania.`);
      this.search = null;
      this.clearRoute();
    }
    if (task.kind === "fetch" && currentlyVisible && entity?.heldBy) {
      this.fail(`Mira widzi, że ${targetLabel} jest już przez kogoś trzymany.`);
      return { control: STILL };
    }
    this.activity = task.kind === "fetch" ? (currentlyVisible ? `Idę po: ${targetLabel}.` : `Szukam: ${targetLabel}, w ostatnio widzianym miejscu.`) :
      task.kind === "follow" ? (currentlyVisible ? `Podążam za: ${targetLabel}.` : `Idę do ostatnio widzianego miejsca: ${targetLabel}.`) :
      `Idę do: ${targetLabel}.`;
    const goal: Goal = { key: `${task.kind}:${task.targetId}`, position, reach: entity ? (task.kind === "follow" || task.kind === "search" ? 64 : 46) : 18, sight: !!entity };
    if (place && !entity) {
      goal.approachRadius = place.site ? 64 : 100;
      if (!place.site) goal.bounds = place.bounds;
    }
    const motion = this.moveToward(snapshot, actor, goal);
    if (motion === "failed") { this.fail(`Mira nie znalazła przejścia do: ${targetLabel}. Czeka na kolejne polecenie.`); return { control: STILL }; }
    if (motion !== "arrived") return { control: motion };
    if (place && !entity) {
      this.arrivalScan ??= { startedAt: snapshot.tick, angle: Math.atan2(actor.facing.y, actor.facing.x) };
      if (snapshot.tick - this.arrivalScan.startedAt < 45) {
        this.activity = `Rozglądam się: ${place.label}.`;
        return { control: this.scanControl(snapshot.tick, this.arrivalScan) };
      }
      this.arrivalScan = null;
    }
    if (task.kind === "fetch") return {
      control: STILL, action: { request: { action: "interact", actorId: this.actorId, targetId: task.targetId }, purpose: "collect" }
    };
    if (task.kind === "follow") {
      this.activity = `Jestem blisko: ${targetLabel}. Podążę, kiedy ruszy.`;
    } else {
      this.outcome(task.kind === "search" ? `Mira odnalazła: ${targetLabel}.` : `Mira dotarła do: ${targetLabel}.`);
    }
    return { control: STILL };
  }

  private deliver(snapshot: WorldSnapshot, actor: ActorEntity, task: Extract<Task, { kind: "fetch" }>): Decision {
    if (actor.heldItemId !== task.targetId) { this.fail("Mira nie trzyma już przedmiotu, który miała dostarczyć."); return { control: STILL }; }
    const recipient = this.known.get(task.recipientId);
    const item = this.known.get(task.targetId)!;
    if (!recipient) { this.fail("Mira nie wie, gdzie cię szukać. Nadal trzyma przedmiot."); return { control: STILL }; }
    if (!this.visible.has(recipient.id)) return this.searchFor(snapshot, actor, recipient);
    if (this.search) {
      this.perception.record(snapshot.tick, "search", "Znowu widzę odbiorcę. Kontynuuję rozpoczętą dostawę.");
      this.search = null;
      this.clearRoute();
    }
    this.activity = `Niosę do ciebie: ${item.label}.`;
    // World drops to the first legal side. Approaching from the left normally leaves
    // the item at the recipient's feet; the actual result is checked after dropping.
    const held = snapshot.entities.find(e => e.id === task.targetId)!;
    const dropDistance = actor.radius + held.radius + 14;
    const spread = this.collection?.quantity === "all" ? [[-18, -18], [18, -18], [-18, 18], [18, 18]][this.collection.delivered.length % 4] : [0, 0];
    const preferred = { x: recipient.position.x + spread[0] - dropDistance, y: recipient.position.y + spread[1] };
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
        this.deliveredAt.set(item.id, snapshot.tick);
        this.outcome(`Mira dostarczyła i odłożyła obok ciebie: ${itemLabel}. Możesz go podnieść.`);
      } else {
        this.fail(`Mira odłożyła: ${itemLabel}, ale przedmiot nie jest w twoim zasięgu.`);
      }
    } else {
      this.outcome(`Mira odłożyła: ${itemLabel}.`);
    }
  }

  private taskRecipient(): string | null { return this.task.kind === "fetch" ? this.task.recipientId : null; }

  private scanControl(tick: number, scan: Scan): WorldInput {
    const angle = scan.angle + (tick - scan.startedAt + 1) / 45 * 2 * Math.PI;
    return { ...STILL, lookDirection: { x: Math.cos(angle), y: Math.sin(angle) } };
  }

  private attend(snapshot: WorldSnapshot, actor: ActorEntity): WorldInput {
    const cue = this.perception.latestCall();
    if (cue && snapshot.tick - cue.tick < 60) return { ...STILL, lookDirection: cue.direction };
    const player = this.known.get("player.jozz");
    if (player && this.visible.has(player.id) && distance(actor.position, player.position) <= 220) {
      return { ...STILL, lookDirection: { x: player.position.x - actor.position.x, y: player.position.y - actor.position.y } };
    }
    // A quiet resident can look around while remaining where asked to wait.
    const phase = snapshot.tick % 240;
    if (phase < 45) {
      const angle = Math.atan2(actor.facing.y, actor.facing.x) + 2 * Math.PI / 45;
      return { ...STILL, lookDirection: { x: Math.cos(angle), y: Math.sin(angle) } };
    }
    return STILL;
  }

  private searchFor(snapshot: WorldSnapshot, actor: ActorEntity, memory: KnownEntity): Decision {
    const cue = this.perception.latestCall(memory.id);
    if (!this.search || this.search.targetId !== memory.id || (cue && cue.seq > this.search.cueSequence)) {
      this.search = { targetId: memory.id, startedAt: snapshot.tick, cueSequence: cue?.seq ?? 0,
        points: searchViewpoints(snapshot, memory, actor.radius, cue), index: 0, exhausted: false };
      this.clearRoute();
      this.perception.record(snapshot.tick, "search", cue ? `Korzystam z usłyszanego kierunku, szukając: ${memory.label}.` : `Szukam: ${memory.label}, zaczynając od zapamiętanego miejsca i pobliskich przejść.`);
    }
    const search = this.search;
    if (search.index >= search.points.length || snapshot.tick - search.startedAt >= 1800) {
      if (this.collection?.quantity === "all" && this.task.kind === "fetch" && this.task.phase === "collect") {
        this.fail(`Mira nie odnalazła: ${memory.label}. Przejdzie do pozostałych przedmiotów i uwzględni brak w wyniku.`);
        return { control: STILL };
      }
      if (!search.exhausted) {
        search.exhausted = true;
        this.outcome(`Mira sprawdziła kilka miejsc, ale nie odnalazła: ${memory.label}. Zachowuje rozpoczęte zadanie; nowe spotkanie lub wołanie pozwoli jej wrócić do działania.`, false);
      }
      this.activity = `Nie odnalazłam: ${memory.label}. Nasłuchuję i czekam na wskazówkę.`;
      return { control: STILL };
    }
    this.activity = `${this.task.kind === "fetch" && this.task.phase === "deliver" ? "Nadal niosę przedmiot. " : ""}Szukam: ${memory.label}. ${search.scan ? "Rozglądam się." : "Sprawdzam okolicę."}`;
    if (search.scan) {
      if (snapshot.tick - search.scan.startedAt < 45) return { control: this.scanControl(snapshot.tick, search.scan) };
      search.index++;
      search.scan = undefined;
      this.clearRoute();
      return { control: STILL };
    }
    const motion = this.moveToward(snapshot, actor, { key: `search:${memory.id}:${search.cueSequence}:${search.index}`, position: search.points[search.index], reach: 10, sight: false });
    if (motion === "failed") { search.index++; this.clearRoute(); return { control: STILL }; }
    if (motion === "arrived") {
      search.scan = { startedAt: snapshot.tick, angle: Math.atan2(actor.facing.y, actor.facing.x) };
      return { control: this.scanControl(snapshot.tick, search.scan) };
    }
    return { control: motion };
  }

  private commitmentDescription(goal: Collection): string {
    const shape = { mug: "kubek", hammer: "młotek", lantern: "latarnia", any: "przedmiot" }[goal.description.itemType];
    const color = goal.description.color === "red" ? "czerwony" : goal.description.color === "blue" ? "niebieski" : "dowolny kolor";
    return `Znaleźć i przynieść ${goal.quantity === "all" ? "wszystkie pasujące przedmioty w sprawdzanych znanych miejscach" : "jeden pasujący przedmiot"}: ${shape}, ${color}. ` +
      `Wskazówka gracza: ${this.places.find(p => p.id === goal.description.nearPlaceId)?.label ?? "brak miejsca"}. ` +
      `Ograniczenie miejsca: ${this.places.find(p => p.id === goal.description.withinPlaceId)?.label ?? "brak"}. ` +
      `Dostarczone: ${goal.delivered.map(id => this.known.get(id)?.label ?? id).join(", ") || "jeszcze żaden"}. ` +
      `Niedostępne: ${goal.unavailable.map(id => this.known.get(id)?.label ?? id).join(", ") || "brak"}. ` +
      `Sprawdzone miejsca: ${goal.placeIndex}/${goal.places.length}.`;
  }

  private sameCollection(goal: Collection, intent: Extract<ResidentIntent, { kind: "find_item" }>): boolean {
    return goal.quantity === intent.quantity && goal.description.itemType === intent.description.itemType && goal.description.color === intent.description.color &&
      goal.description.nearPlaceId === intent.description.nearPlaceId && goal.description.withinPlaceId === intent.description.withinPlaceId;
  }

  private findItems(snapshot: WorldSnapshot, actor: ActorEntity): Decision {
    const goal = this.collection;
    if (!goal) { this.resumeRoutine(); return { control: STILL }; }
    const restrictedPlace = this.places.find(p => p.id === goal.description.withinPlaceId);
    const matches = [...this.known.values()].filter(e => e.kind === "item" && !goal.delivered.includes(e.id) && !goal.unavailable.includes(e.id) &&
      (goal.description.itemType === "any" || e.appearance?.itemType === goal.description.itemType) &&
      (!goal.description.color || e.appearance?.color === goal.description.color) &&
      (!restrictedPlace || inBounds(e.position, restrictedPlace.bounds)));
    if (goal.quantity === "one" && matches.length > 1) {
      const key = matches.map(e => e.id).sort().join(",");
      if (goal.reportKey !== key) {
        goal.reportKey = key;
        this.outcome(`Mira zna kilka pasujących przedmiotów: ${matches.map(e => e.label).join(", ")}. Potrzebuje doprecyzowania, który przynieść.`, false);
      }
      this.activity = "Pamiętam prośbę, ale pasuje kilka przedmiotów. Potrzebuję doprecyzowania.";
      return { control: STILL };
    }
    const available = matches.filter(e => !e.heldBy || e.heldBy === this.actorId);
    if (available.length) {
      if (actor.heldItemId && !available.some(e => e.id === actor.heldItemId)) {
        this.activity = "Pamiętam prośbę, ale mam zajęte ręce. Potrzebuję ustalić, co zrobić z niesioną rzeczą.";
        if (goal.reportKey !== "hands") { goal.reportKey = "hands"; this.outcome(this.activity, false); }
        return { control: STILL };
      }
      const target = available.find(e => e.id === actor.heldItemId) ?? available.sort((a, b) => distance(actor.position, a.position) - distance(actor.position, b.position))[0];
      this.task = { kind: "fetch", targetId: target.id, recipientId: snapshot.entities.find(e => e.kind === "player")!.id,
        phase: actor.heldItemId === target.id ? "deliver" : "collect" };
      this.search = null;
      this.clearRoute();
      goal.reportKey = null;
      goal.scan = null;
      return { control: STILL };
    }
    const place = goal.places[goal.placeIndex];
    if (place) {
      this.activity = `Szukam pasujących rzeczy: ${place.label}. Dostarczone: ${goal.delivered.length}.`;
      const motion = this.moveToward(snapshot, actor, { key: `discover:${place.id}`, position: centre(place.bounds), reach: 18, sight: false,
        approachRadius: place.site ? 64 : 100, ...(place.site ? {} : { bounds: place.bounds }) });
      if (motion === "failed") { goal.placeIndex++; goal.scan = null; this.clearRoute(); return { control: STILL }; }
      if (motion !== "arrived") return { control: motion };
      goal.scan ??= { startedAt: snapshot.tick, angle: Math.atan2(actor.facing.y, actor.facing.x) };
      if (snapshot.tick - goal.scan.startedAt < 45) return { control: this.scanControl(snapshot.tick, goal.scan) };
      goal.placeIndex++;
      goal.scan = null;
      this.clearRoute();
      return { control: STILL };
    }
    if (goal.reportKey !== "checked") {
      goal.reportKey = "checked";
      const missing = [...new Set([...goal.unavailable, ...matches.map(e => e.id)])];
      this.outcome(`Mira dostarczyła ${goal.delivered.length} pasujących przedmiotów i zakończyła sprawdzanie znanych miejsc. ` +
        (missing.length ? `Nie dostarczyła: ${missing.map(id => this.known.get(id)?.label ?? id).join(", ")}. ` : "") +
        "To wynik jej poszukiwań; nie ma pewności, że nigdzie poza sprawdzonymi miejscami nie zostało coś jeszcze.", false);
      if (goal.delivered.length > 0 && missing.length === 0) {
        this.completedCollection = goal;
        this.resumeRoutine();
        return { control: STILL };
      }
    }
    this.activity = goal.delivered.length ? `Zakończyłam szukanie. Dostarczone: ${goal.delivered.length}.` : matches.length ? "Pasująca rzecz jest przez kogoś trzymana. Pamiętam prośbę." : "Nie znalazłam pasującej rzeczy. Pamiętam prośbę i czekam na nową wskazówkę.";
    // Keep the description: a later genuine discovery can still resolve the request.
    return { control: STILL };
  }

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
    this.perception.observe(snapshot);
  }

  private actor(snapshot: WorldSnapshot): ActorEntity {
    const actor = snapshot.entities.find(e => e.id === this.actorId);
    if (!actor || actor.kind !== "npc") throw new Error(`LivingRuntime requires an NPC actor: ${this.actorId}`);
    return actor;
  }
  private remembered(): KnownEntity[] { return this.perception.remembered(); }
  private addLine(speaker: ConversationLine["speaker"], text: string): void {
    this.conversation.push({ id: ++this.lineId, speaker, text: text.slice(0, TEXT_LIMIT) });
    if (this.conversation.length > TRANSCRIPT_LIMIT) this.conversation.splice(0, this.conversation.length - TRANSCRIPT_LIMIT);
  }
  private clearRoute(): void { this.route = null; this.previousMove = null; this.stuckTicks = 0; this.replanFailures = 0; }
  private resumeRoutine(): void {
    this.collection = null;
    this.task = { kind: "routine" };
    this.search = null;
    this.arrivalScan = null;
    this.clearRoute();
    this.restUntil = this.world.tick + 120;
    this.activity = "Chwilę odpoczywam, potem wrócę do spaceru.";
  }
  private outcome(text: string, completed = true): void {
    this.lastOutcome = text;
    this.addLine("world", text);
    if (completed && this.collection && this.task.kind === "fetch") {
      this.collection.delivered.push(this.task.targetId);
      if (this.collection.quantity === "all") {
        this.task = { kind: "find" };
        this.search = null;
        this.clearRoute();
        this.activity = `Dostarczone: ${this.collection.delivered.length}. Wracam po pozostałe pasujące rzeczy.`;
        return;
      }
      this.completedCollection = this.collection;
    }
    if (completed) this.resumeRoutine();
  }
  private fail(text: string): void {
    this.outcome(text, false);
    if (this.collection?.quantity === "all" && this.task.kind === "fetch" && this.task.phase === "collect") {
      this.collection.unavailable.push(this.task.targetId);
      this.task = { kind: "find" };
      this.search = null;
      this.clearRoute();
      return;
    }
    this.task = { kind: "wait" };
    this.clearRoute();
    this.activity = "Nie mogę dokończyć zadania. Czekam na kolejne polecenie.";
  }
}
