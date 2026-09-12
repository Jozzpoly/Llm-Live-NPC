import { LivingRuntime, stepLivingResidents } from "../living/runtime";
import { ResidentPerception } from "../living/perception";
import type { ConversationLine, ResidentIntent, ResidentViewState } from "../living/types";
import { World } from "../world/world";
import type { WorldActionRequest, WorldInput } from "../world/types";
import { parseCognitionProposal } from "./contracts";
import type { Belief, CognitionContext, CognitionProposal, CognitionProvider,
  CognitionResponse, Concern, Experience, Realization, ResidentIdentity } from "./contracts";

interface Resident {
  identity: ResidentIdentity; body: LivingRuntime;
  experiences: Map<string, Experience>; beliefs: Map<string, Belief>; concerns: Map<string, Concern>;
  realization: Realization | null; stepStarted: number; nextReview: number;
  reasons: Set<string>; pending: Ticket | null; revision: number; evidenceSequence: number;
  speechCursor: number; senseCursor: number; error: string | null; lastRequestTick: number;
}
interface Ticket {
  actorId: string; context: CognitionContext; revision: number; realizationKey: string;
  controller: AbortController; timer: ReturnType<typeof setTimeout>; finished: boolean;
}
interface Settlement { ticket: Ticket; response?: CognitionResponse; error?: string }
export interface HearthTrace {
  tick: number; actorId: string; kind: "requested" | "accepted" | "stale" | "plan_stale" | "failed" | "step" | "interrupted";
  detail: string;
}
const STILL = { moveX: 0, moveY: 0 };
const key = (r: Realization | null) => r ? r.id + ":" + r.index + ":" + r.status : "none";

/** One integration host; providers never mutate World or a resident from a promise callback. */
export class HearthHost {
  private readonly residents = new Map<string, Resident>();
  private readonly settled: Settlement[] = [];
  private readonly playerPerception: ResidentPerception;
  private readonly conversation: ConversationLine[] = [];
  private playerSpeechCursor = 0;
  private selected: string;
  private sequence = 0;
  private inFlight = 0;
  private disposed = false;
  readonly trace: HearthTrace[] = [];
  readonly usage: Array<CognitionResponse["usage"]> = [];

  constructor(readonly world: World, private readonly provider: CognitionProvider,
    profiles: Array<{ identity: ResidentIdentity; concerns: Concern[] }>,
    private readonly options: { concurrency?: number; deadlineMs?: number; minimumIntervalTicks?: number; playerId?: string } = {}) {
    if (!profiles.length) throw new Error("A hearth needs a resident.");
    if (options.concurrency !== undefined && (!Number.isInteger(options.concurrency) || options.concurrency < 1)) throw new Error("Invalid concurrency");
    this.selected = profiles[0].identity.id;
    this.playerPerception = new ResidentPerception(world, this.playerId, (id, fallback) => profiles.find(p => p.identity.id === id)?.identity.name ?? fallback);
    this.playerPerception.observe(world.snapshot());
    for (const profile of profiles) this.addResident(profile.identity, profile.concerns);
  }

  private get playerId() { return this.options.playerId ?? "player.jozz"; }

  addResident(identity: ResidentIdentity, concerns: Concern[] = []): void {
    if (this.disposed || this.residents.has(identity.id)) throw new Error("Resident identity already active or host disposed");
    const body = new LivingRuntime(this.world, async () => { throw new Error("Execution donor must not invoke cognition"); },
      identity.id, { managed: true, name: identity.name });
    const r: Resident = { identity: structuredClone(identity), body, experiences: new Map(), beliefs: new Map(),
      concerns: new Map(concerns.map(c => [c.id, structuredClone(c)])), realization: null,
      stepStarted: this.world.tick, nextReview: this.world.tick, reasons: new Set(["Pierwsze rozejrzenie się i własne sprawy"]),
      pending: null, revision: 0, evidenceSequence: 0, speechCursor: 0, senseCursor: 0, error: null, lastRequestTick: -Infinity };
    this.residents.set(identity.id, r);
    this.record(r, "background", identity.background);
    this.receive(r);
  }

  /** Detach the resident mind; its physical body remains in this World until World removes it. */
  removeResident(actorId: string): void {
    const r = this.residents.get(actorId);
    if (!r) return;
    if (r.pending) { r.pending.controller.abort(); this.finish(r.pending, undefined, "Osoba została zawieszona."); }
    r.body.dispose();
    this.residents.delete(actorId);
    if (this.selected === actorId) this.selected = this.residents.keys().next().value ?? "";
  }

  select(actorId: string): void {
    if (!this.residents.has(actorId)) throw new Error("Unknown resident");
    this.selected = actorId;
  }

  /** Speaking is a physical event for every actual listener, not a direct mind injection. */
  speak(text: string, mode: "normal" | "quiet" | "call" = "normal"): Promise<void> {
    if (this.disposed || !text.trim()) return Promise.resolve();
    const words = text.trim().slice(0, 800);
    this.world.speak(this.playerId, words, mode);
    this.conversation.push({ id: ++this.sequence, speaker: "player", text: words });
    for (const r of this.residents.values()) this.receive(r);
    this.trimConversation();
    return Promise.resolve();
  }

  call(): void {
    const r = this.residents.get(this.selected);
    if (r) void this.speak(r.identity.name + ", jestem tutaj!", "call");
  }

  stop(): void {
    const r = this.residents.get(this.selected);
    if (!r) return;
    // Explicit Owner control, separate from in-world speech and not fabricated as a heard instruction.
    r.revision++;
    if (r.pending) { r.pending.controller.abort(); this.finish(r.pending); }
    if (r.realization?.status === "running") r.realization.status = "interrupted";
    r.body.perform({ kind: "wait" });
    this.record(r, "execution", "Moje wykonanie zostało wstrzymane przez sterowanie sesją; sprawa pozostaje.");
    r.nextReview = this.world.tick + 900;
    r.reasons.clear();
    this.log(r, "interrupted", "session control");
  }

  retry(): Promise<void> {
    const r = this.residents.get(this.selected);
    if (r) { r.error = null; r.reasons.add("Powrót do namysłu po przerwie połączenia"); r.nextReview = this.world.tick; }
    return Promise.resolve();
  }

  step(control: WorldInput = STILL, actions: readonly WorldActionRequest[] = []): void {
    if (this.disposed) return;
    for (const r of this.residents.values()) this.receive(r);
    this.admit();
    stepLivingResidents(this.world, [...this.residents.values()].map(r => r.body), control, actions);
    for (const r of this.residents.values()) {
      this.receive(r);
      this.advance(r);
    }
    this.playerPerception.observe(this.world.snapshot());
    for (const speech of this.playerPerception.recentSpeech()) {
      if (speech.id <= this.playerSpeechCursor) continue;
      this.playerSpeechCursor = speech.id;
      if (speech.sourceId === this.playerId) continue;
      const speaker = speech.sourceId && this.residents.get(speech.sourceId);
      this.conversation.push({ id: ++this.sequence, speaker: "world", text: (speaker ? speaker.identity.name : "Ktoś") + ": " + speech.text });
    }
    this.trimConversation();
    this.schedule();
  }

  private receive(r: Resident): void {
    const sensed = r.body.personalContext();
    for (const e of sensed.experiences) {
      if (e.id <= r.senseCursor) continue;
      r.senseCursor = e.id;
      const id = "sense:" + e.id;
      r.experiences.set(id, { id, tick: e.tick, kind: e.kind, text: e.text, ...(e.sourceId ? { sourceId: e.sourceId } : {}) });
      if (["witnessed_manipulation", "checked_absent", "heard_call"].includes(e.kind)) this.wake(r, "Nowe własne doświadczenie: " + e.kind);
    }
    for (const speech of sensed.speech) {
      if (speech.id <= r.speechCursor) continue;
      r.speechCursor = speech.id;
      if (speech.sourceId === r.identity.id) continue;
      r.revision++; // private received communication only, never a hidden World revision
      r.error = null;
      this.wake(r, "Usłyszana wypowiedź wymaga rozważenia");
    }
    this.trimExperiences(r);
  }

  private wake(r: Resident, reason: string): void {
    r.reasons.add(reason);
    // Relevant private events can interrupt a long review interval, with a configurable burst floor.
    r.nextReview = Math.min(r.nextReview, Math.max(this.world.tick, r.lastRequestTick + (this.options.minimumIntervalTicks ?? 90)));
  }

  private record(r: Resident, kind: string, text: string): void {
    const id = "own:" + ++r.evidenceSequence;
    r.experiences.set(id, { id, tick: this.world.tick, kind, text: text.slice(0, 1600) });
    this.trimExperiences(r);
  }

  private trimExperiences(r: Resident): void {
    const pinned = new Set([...r.beliefs.values(), ...r.concerns.values()].flatMap(v => v.evidenceIds));
    for (const [id] of r.experiences) {
      if (r.experiences.size <= 112) break;
      if (!pinned.has(id)) r.experiences.delete(id);
    }
    // Bound provenance retained by live beliefs/concerns; reject updates that would exceed the context below.
  }

  context(actorId: string, reasons: string[] = []): CognitionContext {
    const r = this.residents.get(actorId);
    if (!r) throw new Error("Unknown resident");
    const sensed = r.body.personalContext();
    return structuredClone({ version: 1, resident: r.identity, tick: this.world.tick, reasons,
      observations: sensed.observations, experiences: [...r.experiences.values()], beliefs: [...r.beliefs.values()],
      concerns: [...r.concerns.values()], realization: r.realization, places: sensed.places });
  }

  private schedule(): void {
    const limit = this.options.concurrency ?? 2;
    // Ordered by due time; each started job moves its due time forward, preventing fixed-ID priority.
    const ready = [...this.residents.values()].filter(r => !r.pending && !r.error && this.world.tick >= r.nextReview)
      .sort((a, b) => a.nextReview - b.nextReview);
    for (const r of ready) {
      if (this.inFlight >= limit) break;
      const reasons = r.reasons.size ? [...r.reasons].slice(-16) : ["Otwarty przegląd otoczenia i niedokończonych spraw"];
      const context = this.context(r.identity.id, reasons);
      r.reasons.clear();
      const controller = new AbortController();
      const ticket: Ticket = { actorId: r.identity.id, context, revision: r.revision,
        realizationKey: key(r.realization), controller, finished: false,
        timer: setTimeout(() => { controller.abort(); this.finish(ticket, undefined, "Namysł trwał zbyt długo. Możesz wznowić połączenie."); }, this.options.deadlineMs ?? 45_000) };
      r.pending = ticket;
      r.lastRequestTick = this.world.tick;
      r.nextReview = this.world.tick + (this.options.minimumIntervalTicks ?? 90);
      this.inFlight++;
      this.log(r, "requested", reasons.join("; "));
      // The provider gets its own copy; its adapter cannot alter the admission basis.
      Promise.resolve().then(() => this.provider(structuredClone(context), controller.signal))
        .then(response => this.finish(ticket, response), error =>
          this.finish(ticket, undefined, error instanceof Error ? error.message : "Nie udało się przeprowadzić namysłu."));
    }
  }

  private finish(ticket: Ticket, response?: CognitionResponse, error?: string): void {
    if (ticket.finished) return;
    ticket.finished = true;
    clearTimeout(ticket.timer);
    this.inFlight--;
    if (!this.disposed) this.settled.push({ ticket, response, error });
  }

  private admit(): void {
    for (const done of this.settled.splice(0)) {
      const r = this.residents.get(done.ticket.actorId);
      if (!r || r.pending !== done.ticket) continue;
      r.pending = null;
      if (done.response) {
        this.usage.push(structuredClone(done.response.usage));
        if (this.usage.length > 256) this.usage.shift();
      }
      if (r.revision !== done.ticket.revision) {
        this.log(r, "stale", "Nowsza odebrana wypowiedź albo wstrzymanie wykonania");
        continue;
      }
      const proposal = done.response && parseCognitionProposal(done.response.proposal, done.ticket.context);
      if (done.error || !proposal) {
        r.error = done.error ?? "Nie udało się odczytać namysłu mieszkańca.";
        this.log(r, "failed", r.error);
        continue;
      }
      this.commit(r, proposal, done.ticket);
    }
  }

  private commit(r: Resident, p: CognitionProposal, ticket: Ticket): void {
    // Apply a bounded whole memory update. No comparison with hidden factual truth.
    const beliefs = new Map(r.beliefs), concerns = new Map(r.concerns);
    for (const belief of p.beliefs) beliefs.set(belief.id, structuredClone(belief));
    for (const concern of p.concerns) concerns.set(concern.id, structuredClone(concern));
    const references = new Set([...beliefs.values(), ...concerns.values()].flatMap(v => v.evidenceIds));
    if (beliefs.size > 32 || concerns.size > 24 || references.size > 80) {
      r.error = "Pamięć wymaga uporządkowania przed kolejnym namysłem.";
      this.log(r, "failed", "memory capacity"); return;
    }
    r.beliefs = beliefs; r.concerns = concerns;
    if (p.plan) {
      if (key(r.realization) !== ticket.realizationKey) this.log(r, "plan_stale", "Wykonanie posunęło się podczas namysłu");
      else if (!(r.realization?.status === "running" && r.realization.concernId === p.plan.concernId &&
        JSON.stringify(r.realization.steps) === JSON.stringify(p.plan.steps))) {
        if (r.realization?.status === "running") {
          this.record(r, "execution", "Zmieniam metodę wykonania; wcześniejsza sprawa nadal ma swój stan.");
        }
        r.realization = { id: "realization:" + ++this.sequence, concernId: p.plan.concernId,
          steps: structuredClone(p.plan.steps), index: 0, status: "running", outcome: null };
        this.startStep(r);
      }
    }
    if (p.speech) {
      // An ordinary utterance is allowed to be fallible; it never sets a physical completion flag.
      this.world.speak(r.identity.id, p.speech.text, p.speech.mode);
      this.record(r, "said", "Powiedziałem: " + p.speech.text);
    }
    r.nextReview = r.reasons.size ? Math.max(this.world.tick, r.lastRequestTick + (this.options.minimumIntervalTicks ?? 90))
      : this.world.tick + Math.max(this.options.minimumIntervalTicks ?? 90, Math.round(p.reviewAfterSeconds * 30));
    this.log(r, "accepted", "Własne przekonania i sprawy; wykonanie rozstrzyga świat");
  }

  private startStep(r: Resident): void {
    const plan = r.realization!;
    const step = plan.steps[plan.index];
    r.stepStarted = this.world.tick;
    let intent: ResidentIntent;
    switch (step.skill) {
      case "travel": intent = { kind: "go", targetId: step.targetId }; break;
      case "accompany": intent = { kind: "follow", targetId: step.targetId }; break;
      case "deliver": intent = { kind: "fetch", targetId: step.targetId }; break;
      case "gather": intent = { kind: "find_item", description: step.description, quantity: step.quantity }; break;
      case "put_down": intent = { kind: "drop" }; break;
      case "pause": intent = { kind: "wait" }; break;
    }
    r.body.perform(intent, "recipientId" in step ? step.recipientId : undefined);
    this.log(r, "step", step.skill + " (" + (plan.index + 1) + "/" + plan.steps.length + ")");
  }

  private advance(r: Resident): void {
    const plan = r.realization;
    if (!plan || plan.status !== "running") return;
    const step = plan.steps[plan.index], state = r.body.executionState();
    const duration = step.skill === "pause" || step.skill === "accompany" ? step.durationSeconds : null;
    const finishedDuration = duration !== null && this.world.tick - r.stepStarted >= duration * 30;
    if (state.status === "blocked") {
      plan.status = "blocked"; plan.outcome = state.outcome;
      this.record(r, "execution", state.outcome ?? "Ta metoda utknęła; sprawa pozostaje otwarta.");
      this.wake(r, "Realizacja wymaga innego sposobu");
    } else if (finishedDuration || state.status === "completed") {
      this.record(r, "execution", state.outcome ?? "Upłynął wybrany czas " + step.skill + ".");
      plan.index++;
      if (plan.index >= plan.steps.length) {
        plan.status = "completed"; plan.outcome = state.outcome ?? "Zakończono wybrane kroki.";
        r.body.perform({ kind: "wait" });
        this.wake(r, "Wynik wykonania; oceń znaczenie dla własnej sprawy");
      } else this.startStep(r);
    }
  }

  state(): ResidentViewState & { residents: Array<{ id: string; name: string }> } {
    const r = this.residents.get(this.selected);
    if (!r) throw new Error("No selected resident");
    const body = r.body.state();
    return { ...body, name: r.identity.name, pending: !!r.pending, error: r.error,
      conversation: structuredClone(this.conversation), contact: "Mowa dociera do osób znajdujących się w pobliżu.",
      residents: [...this.residents.values()].map(v => ({ id: v.identity.id, name: v.identity.name })) };
  }

  private trimConversation(): void { if (this.conversation.length > 64) this.conversation.splice(0, this.conversation.length - 64); }
  private log(r: Resident, kind: HearthTrace["kind"], detail: string): void {
    this.trace.push({ tick: this.world.tick, actorId: r.identity.id, kind, detail });
    if (this.trace.length > 256) this.trace.shift();
  }
  dispose(): void {
    this.disposed = true;
    for (const r of this.residents.values()) {
      if (r.pending) { r.pending.controller.abort(); this.finish(r.pending); }
      r.body.dispose();
    }
    this.playerPerception.dispose();
    this.settled.length = 0;
  }
}
