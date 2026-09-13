import { LivingRuntime, stepLivingResidents, type LivingExecutionCheckpoint } from "../living/runtime";
import { ResidentPerception, RESIDENT_HALF_FIELD, RESIDENT_SIGHT } from "../living/perception";
import type { ConversationLine, ReceivedSpeech, ResidentIntent, ResidentViewState } from "../living/types";
import { World } from "../world/world";
import type { WorldActionRequest, WorldInput } from "../world/types";
import { isCognitionContext, parseCognitionProposal } from "./contracts";
import type { Belief, CognitionContext, CognitionProposal, CognitionProvider,
  CognitionResponse, Concern, Experience, Realization, ResidentIdentity } from "./contracts";

interface Resident {
  identity: ResidentIdentity; body: LivingRuntime;
  experiences: Map<string, Experience>; beliefs: Map<string, Belief>; concerns: Map<string, Concern>;
  realization: Realization | null; stepStarted: number; nextReview: number;
  suspended: { realization: Realization; elapsedTicks: number; body: LivingExecutionCheckpoint } | null; failures: number;
  realizationSequence: number; attemptSequence: number;
  reasons: Set<string>; pending: Ticket | null; revision: number; evidenceSequence: number;
  speechCursor: number; senseCursor: number; error: string | null; lastRequestTick: number;
}
interface Ticket {
  actorId: string; context: CognitionContext; revision: number; realizationKey: string;
  attemptId: string; monotonicMs: number;
  controller: AbortController; timer: ReturnType<typeof setTimeout>; finished: boolean;
}
interface Settlement { ticket: Ticket; response?: CognitionResponse; error?: unknown }
export interface ResearchEvent { sequence: number; tick: number; actorId?: string; stage: string; data: unknown }
export interface SpeechBubble { id: number; tick: number; sourceId: string; text: string; position: { x: number; y: number } }
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
  private readonly research: ResearchEvent[] = [];
  private researchSequence = 0;
  private readonly unsubscribeWorld: () => void;
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
    this.unsubscribeWorld = world.onOccurrence(occurrence => this.observeResearch("world.occurrence", occurrence, occurrence.actorId));
  }

  private get playerId() { return this.options.playerId ?? "player.jozz"; }

  addResident(identity: ResidentIdentity, concerns: Concern[] = []): void {
    if (this.disposed || this.residents.has(identity.id)) throw new Error("Resident identity already active or host disposed");
    const body = new LivingRuntime(this.world, async () => { throw new Error("Execution donor must not invoke cognition"); },
      identity.id, { managed: true, name: identity.name });
    const r: Resident = { identity: structuredClone(identity), body, experiences: new Map(), beliefs: new Map(),
      concerns: new Map(concerns.map(c => [c.id, structuredClone(c)])), realization: null,
      suspended: null, failures: 0, realizationSequence: 0, attemptSequence: 0,
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
    if (r) { r.error = null; r.failures = 0; r.reasons.add("Powrót do namysłu po przerwie połączenia"); r.nextReview = this.world.tick; }
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
      const experience = { id, tick: e.tick, kind: e.kind, text: e.text,
        ...(e.sourceId ? { sourceId: e.sourceId } : {}), ...(e.subjectId ? { subjectId: e.subjectId } : {}) };
      r.experiences.set(id, experience);
      this.observeResearch("resident.acquired", experience, r.identity.id);
      if (["witnessed_manipulation", "checked_absent", "heard_call"].includes(e.kind)) this.wake(r, "Nowe własne doświadczenie: " + e.kind);
    }
    for (const speech of sensed.speech) {
      if (speech.id <= r.speechCursor) continue;
      r.speechCursor = speech.id;
      if (speech.sourceId === r.identity.id) continue;
      const addressed = this.addressCue(r, speech);
      this.observeResearch("attention.heard", { speech, addressedCue: addressed,
        note: "Wskazówka uwagi, nie dowód adresowania, przyjęcia sprawy ani zrozumienia." }, r.identity.id);
      if (addressed) {
        r.revision++;
        if (r.pending) { r.pending.controller.abort(); this.finish(r.pending); }
        this.wake(r, "Usłyszane zwrócenie się do mnie; rozważ znaczenie, nie przyjmuj automatycznie cudzej sprawy");
      } else {
        // Pool background speech for a later judgement. It neither cancels an in-flight
        // thought nor changes the body; imperative meaning belongs to deliberation.
        this.wake(r, "Usłyszana rozmowa; mogę pozostać przy własnych sprawach i milczeć");
      }
    }
    this.trimExperiences(r);
  }

  /** Replaceable attention heuristic over private language, not a World addressee oracle. */
  private addressCue(r: Resident, speech: ReceivedSpeech): boolean {
    const name = r.identity.name.toLocaleLowerCase("pl");
    const variants = name === "mira" ? ["mira", "miro", "mirę"] : name === "janek" ? ["janek", "janku", "janka"] : [name];
    const clauses = speech.text.toLocaleLowerCase("pl").split(/[.!?;\n]/u);
    return clauses.some(clause => variants.some(v => clause.trimStart().startsWith(v + ",") ||
      clause.trimStart().startsWith(v + " ") || clause.trim() === v));
  }

  private wake(r: Resident, reason: string): void {
    r.reasons.add(reason.slice(0, 240));
    // Relevant private events can interrupt a long review interval, with a configurable burst floor.
    r.nextReview = Math.min(r.nextReview, Math.max(this.world.tick, r.lastRequestTick + (this.options.minimumIntervalTicks ?? 90)));
  }

  private record(r: Resident, kind: string, text: string): void {
    const id = "own:" + ++r.evidenceSequence;
    r.experiences.set(id, { id, tick: this.world.tick, kind, text: text.slice(0, 1600) });
    this.observeResearch("resident.recorded", r.experiences.get(id), r.identity.id);
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
      concerns: [...r.concerns.values()], realization: r.realization,
      suspendedRealization: r.suspended?.realization ?? null, places: sensed.places });
  }

  private schedule(): void {
    const limit = this.options.concurrency ?? 2;
    // Ordered by due time; each started job moves its due time forward, preventing fixed-ID priority.
    const ready = [...this.residents.values()].filter(r => !r.pending && this.world.tick >= r.nextReview)
      .sort((a, b) => a.nextReview - b.nextReview);
    for (const r of ready) {
      if (this.inFlight >= limit) break;
      const reasons = r.reasons.size ? [...r.reasons].slice(-16) : ["Otwarty przegląd otoczenia i niedokończonych spraw"];
      const context = this.context(r.identity.id, reasons);
      if (!isCognitionContext(context)) {
        this.fail(r, "Kontekst mieszkańca wymaga naprawy; ciało nadal działa.", "context_validation");
        continue;
      }
      r.reasons.clear();
      r.error = null;
      const controller = new AbortController();
      const ticket: Ticket = { actorId: r.identity.id, context, revision: r.revision,
        attemptId: r.identity.id + ":attempt:" + ++r.attemptSequence, monotonicMs: performance.now(),
        realizationKey: key(r.realization), controller, finished: false,
        timer: setTimeout(() => { controller.abort(); this.finish(ticket, undefined, "Namysł trwał zbyt długo. Możesz wznowić połączenie."); }, this.options.deadlineMs ?? 45_000) };
      r.pending = ticket;
      r.lastRequestTick = this.world.tick;
      r.nextReview = this.world.tick + (this.options.minimumIntervalTicks ?? 90);
      this.inFlight++;
      this.log(r, "requested", reasons.join("; "));
      this.observeResearch("cognition.request", { context, basis: ticket.realizationKey, attemptId: ticket.attemptId,
        monotonicMs: ticket.monotonicMs, recordedAt: new Date().toISOString() }, r.identity.id);
      // The provider gets its own copy; its adapter cannot alter the admission basis.
      Promise.resolve().then(() => this.provider(structuredClone(context), controller.signal))
        .then(response => this.finish(ticket, response), error => this.finish(ticket, undefined, error));
    }
  }

  private finish(ticket: Ticket, response?: CognitionResponse, error?: unknown): void {
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
      const failure = done.error instanceof Error ? done.error as Error & { diagnostic?: unknown; usage?: CognitionResponse["usage"] } : null;
      this.observeResearch("cognition.settlement", { requestedAtTick: done.ticket.context.tick,
        attemptId: done.ticket.attemptId, elapsedMs: performance.now() - done.ticket.monotonicMs,
        response: done.response, error: failure?.message ?? done.error, diagnostic: failure?.diagnostic,
        usage: failure?.usage }, r.identity.id);
      if (done.response) {
        this.usage.push(structuredClone(done.response.usage));
        if (this.usage.length > 256) this.usage.shift();
      }
      if (failure?.usage) this.usage.push(structuredClone(failure.usage));
      if (this.usage.length > 256) this.usage.splice(0, this.usage.length - 256);
      if (r.revision !== done.ticket.revision) {
        this.log(r, "stale", "Nowsza wskazówka zwrócenia się do mnie albo sterowanie sesją");
        continue;
      }
      const proposal = done.response && parseCognitionProposal(done.response.proposal, done.ticket.context);
      if (done.error || !proposal) {
        this.fail(r, failure?.message ?? (typeof done.error === "string" ? done.error : "Nie udało się odczytać namysłu mieszkańca."),
          failure?.diagnostic ?? "proposal_validation");
        continue;
      }
      if (key(r.realization) !== done.ticket.realizationKey) {
        // The returned self-report and plan describe a previous execution boundary. Retain the
        // candidate in research, ask with the private result; never compare beliefs to hidden truth.
        this.log(r, "plan_stale", "Własne wykonanie zmieniło etap podczas namysłu; ponownie rozważ cały wynik");
        this.wake(r, "Wykonanie zmieniło etap; poprzednia propozycja nie została przyjęta");
        continue;
      }
      this.commit(r, proposal, done.ticket);
    }
  }

  private commit(r: Resident, p: CognitionProposal, ticket: Ticket): void {
    const disposition = p.activityDisposition;
    const running = r.realization?.status === "running";
    const samePlan = running && p.plan && r.realization!.concernId === p.plan.concernId &&
      JSON.stringify(r.realization!.steps) === JSON.stringify(p.plan.steps);
    if (running && p.plan && !samePlan && !["replace", "suspend"].includes(disposition?.kind ?? "")) {
      this.record(r, "coordination", "Proponowana zmiana zajęcia wymaga jawnego powodu i decyzji o trwającym wykonaniu.");
      this.wake(r, "Rozstrzygnij continue, replace albo suspend dla trwającego zajęcia");
      this.log(r, "interrupted", "Ochroniono trwające zajęcie przed niejawną zamianą");
      return;
    }
    if (disposition?.kind === "suspend" && r.suspended) {
      this.record(r, "coordination", "Mam już jedno odłożone wykonanie. Wybierz świadomie, do którego wrócić albo z którego zrezygnować.");
      this.wake(r, "Jedno odłożone wykonanie; potrzebna decyzja zamiast zgubienia postępu"); return;
    }
    // Apply a bounded whole memory update. No comparison with hidden factual truth.
    const beliefs = new Map(r.beliefs), concerns = new Map(r.concerns);
    for (const belief of p.beliefs) beliefs.set(belief.id, structuredClone(belief));
    for (const concern of p.concerns) concerns.set(concern.id, structuredClone(concern));
    const references = new Set([...beliefs.values(), ...concerns.values()].flatMap(v => v.evidenceIds));
    if (beliefs.size > 32 || concerns.size > 24 || references.size > 80) {
      this.fail(r, "Pamięć wymaga uporządkowania przed kolejnym namysłem.", "memory capacity"); return;
    }
    // In-flight acquired evidence survives prompt-window turnover. Restore only cited sources
    // from this ticket's immutable private basis before pinning the resulting memory references.
    for (const id of references) if (!r.experiences.has(id)) {
      const source = ticket.context.experiences.find(e => e.id === id);
      if (!source) { this.fail(r, "Brakuje źródła własnego przekonania.", "evidence missing"); return; }
      r.experiences.set(id, structuredClone(source));
    }
    r.beliefs = beliefs; r.concerns = concerns;
    if (disposition?.kind === "suspend" && r.realization) {
      r.suspended = { realization: structuredClone(r.realization), elapsedTicks: this.world.tick - r.stepStarted,
        body: r.body.captureExecution() };
      r.suspended.realization.status = "interrupted";
      r.suspended.realization.outcome = disposition.reason;
      r.realization = null;
      r.body.perform({ kind: "wait" });
      this.record(r, "coordination", "Odkładam wykonanie z zachowaniem postępu: " + disposition.reason);
    } else if (disposition?.kind === "stop" && r.realization) {
      r.realization.status = "interrupted"; r.realization.outcome = disposition.reason;
      r.body.perform({ kind: "wait" });
      this.record(r, "coordination", "Kończę tę metodę wykonania: " + disposition.reason);
    } else if (disposition?.kind === "resume" && r.suspended) {
      const saved = r.suspended;
      r.suspended = null; r.realization = saved.realization;
      r.realization.status = "running"; r.realization.outcome = null;
      r.body.resumeExecution(saved.body);
      r.stepStarted = this.world.tick - saved.elapsedTicks;
      this.record(r, "coordination", "Wracam do odłożonego wykonania: " + disposition.reason);
    }
    if (p.plan && !samePlan) {
        if (r.realization?.status === "running") {
          this.record(r, "execution", "Zmieniam metodę wykonania; wcześniejsza sprawa nadal ma swój stan.");
        }
        r.realization = { id: "realization:" + ++r.realizationSequence, concernId: p.plan.concernId,
          steps: structuredClone(p.plan.steps), index: 0, status: "running", outcome: null };
        this.startStep(r);
    }
    // Closing a reason must not leave an unowned body plan running indefinitely. The resident
    // can deliberately finish it by transferring the method to another open concern instead.
    if (r.realization?.status === "running" && r.concerns.get(r.realization.concernId)?.status !== "open") {
      r.realization.status = "interrupted"; r.realization.outcome = "Sprawa została zamknięta; wykonanie wstrzymane.";
      r.body.perform({ kind: "wait" });
      this.record(r, "coordination", r.realization.outcome);
    }
    if (p.speech) {
      // An ordinary utterance is allowed to be fallible; it never sets a physical completion flag.
      this.world.speak(r.identity.id, p.speech.text, p.speech.mode);
      this.record(r, "said", "Powiedziałem: " + p.speech.text);
    }
    r.nextReview = r.reasons.size ? Math.max(this.world.tick, r.lastRequestTick + (this.options.minimumIntervalTicks ?? 90))
      : this.world.tick + Math.max(this.options.minimumIntervalTicks ?? 90, Math.round(p.reviewAfterSeconds * 30));
    this.log(r, "accepted", "Własne przekonania i sprawy; wykonanie rozstrzyga świat");
    r.error = null; r.failures = 0;
    this.trimExperiences(r);
  }

  private startStep(r: Resident): void {
    const plan = r.realization!;
    const step = plan.steps[plan.index];
    r.stepStarted = this.world.tick;
    let intent: ResidentIntent;
    switch (step.skill) {
      case "travel": intent = { kind: "go", targetId: step.targetId }; break;
      case "communicate": intent = { kind: "go", targetId: step.targetId }; break;
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
    if (step.skill === "communicate") {
      const observations = r.body.personalContext().observations;
      const self = observations.find(e => e.id === r.identity.id), other = observations.find(e => e.id === step.targetId);
      if (self && other?.visible && Math.hypot(self.position.x - other.position.x, self.position.y - other.position.y) <= 80) {
        this.world.speak(r.identity.id, step.text, step.mode);
        this.record(r, "said", "Po dotarciu do " + other.label + " mówię: " + step.text);
        this.finishStep(r, "Dotarłem do rozmówcy i wypowiedziałem wiadomość; nie jest to dowód jego zgody ani zrozumienia.");
      } else if (state.status === "blocked" || state.status === "completed") {
        plan.status = "blocked"; plan.outcome = "Nie udało się nawiązać kontaktu z odbiorcą wiadomości.";
        this.record(r, "execution", plan.outcome);
        this.wake(r, "Kontakt wymaga innego sposobu; wiadomość nie została wypowiedziana");
      }
      return;
    }
    const duration = step.skill === "pause" || step.skill === "accompany" ? step.durationSeconds : null;
    const finishedDuration = duration !== null && this.world.tick - r.stepStarted >= duration * 30;
    if (state.status === "blocked") {
      plan.status = "blocked"; plan.outcome = state.outcome;
      this.record(r, "execution", state.outcome ?? "Ta metoda utknęła; sprawa pozostaje otwarta.");
      this.wake(r, "Realizacja wymaga innego sposobu");
    } else if (finishedDuration || state.status === "completed") {
      this.finishStep(r, state.outcome ?? "Upłynął wybrany czas " + step.skill + ".");
    }
  }

  private finishStep(r: Resident, outcome: string): void {
    const plan = r.realization!;
    this.record(r, "execution", outcome);
    plan.index++;
    if (plan.index >= plan.steps.length) {
      plan.status = "completed"; plan.outcome = outcome;
      r.body.perform({ kind: "wait" });
      this.wake(r, "Wynik wykonania; oceń znaczenie dla własnej sprawy");
    } else this.startStep(r);
  }

  private fail(r: Resident, message: string, diagnostic: unknown): void {
    r.error = message;
    r.failures++;
    const delay = Math.min(1800, 90 * 2 ** Math.min(r.failures - 1, 5));
    r.nextReview = this.world.tick + delay;
    r.reasons.add("Powrót po nieudanym namyśle; lokalne wykonanie trwało niezależnie");
    this.log(r, "failed", message);
    this.observeResearch("cognition.retry_scheduled", { diagnostic, attempts: r.failures, retryAtTick: r.nextReview }, r.identity.id);
  }

  state(): ResidentViewState & { residents: Array<{ id: string; name: string }>; bubbles: SpeechBubble[] } {
    const r = this.residents.get(this.selected);
    if (!r) throw new Error("No selected resident");
    const body = r.body.state();
    return { ...body, name: r.identity.name, pending: !!r.pending, error: r.error,
      conversation: structuredClone(this.conversation), contact: "Mowa dociera do osób znajdujących się w pobliżu.",
      residents: [...this.residents.values()].map(v => ({ id: v.identity.id, name: v.identity.name })),
      bubbles: this.bubbles() };
  }

  private bubbles(): SpeechBubble[] {
    return this.playerPerception.recentSpeech().flatMap(speech => {
      if (!speech.sourceId || this.world.tick - speech.tick > 240) return [];
      const seen = this.playerPerception.known.get(speech.sourceId);
      if (!seen || (speech.sourceId !== this.playerId && !this.playerPerception.visible.has(speech.sourceId))) return [];
      return [{ ...speech, sourceId: speech.sourceId, position: { ...seen.position } }];
    });
  }

  /** Observational export only. No cognition or body code consumes this World-wide view. */
  researchState() {
    return structuredClone({ tick: this.world.tick, world: this.world.snapshot(),
      residents: [...this.residents.values()].map(r => ({ id: r.identity.id, name: r.identity.name,
        context: this.context(r.identity.id), pending: !!r.pending, error: r.error,
        perception: { visibleIds: r.body.personalContext().observations.filter(e => e.visible || e.id === r.identity.id).map(e => e.id),
          heardSpeech: r.body.personalContext().speech,
          sight: { range: RESIDENT_SIGHT, halfFieldRadians: RESIDENT_HALF_FIELD } } })),
      trace: this.research, observerErrors: this.world.occurrenceDeliveryErrors() });
  }

  private observeResearch(stage: string, data: unknown, actorId?: string): void {
    this.research.push({ sequence: ++this.researchSequence, tick: this.world.tick, ...(actorId ? { actorId } : {}),
      stage, data: structuredClone(data) });
    if (this.research.length > 1024) this.research.splice(0, this.research.length - 1024);
  }

  private trimConversation(): void { if (this.conversation.length > 64) this.conversation.splice(0, this.conversation.length - 64); }
  private log(r: Resident, kind: HearthTrace["kind"], detail: string): void {
    this.trace.push({ tick: this.world.tick, actorId: r.identity.id, kind, detail });
    this.observeResearch("admission." + kind, { detail, realization: r.realization }, r.identity.id);
    if (this.trace.length > 256) this.trace.shift();
  }
  dispose(): void {
    this.disposed = true;
    for (const r of this.residents.values()) {
      if (r.pending) { r.pending.controller.abort(); this.finish(r.pending); }
      r.body.dispose();
    }
    this.playerPerception.dispose();
    this.unsubscribeWorld();
    this.settled.length = 0;
  }
}
