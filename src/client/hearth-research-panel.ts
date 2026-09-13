import type { CognitionContext } from "../hearth/contracts";
import type { KnownEntity, ReceivedSpeech } from "../living/types";
import type { WorldSnapshot } from "../world/types";

export type ResidentResearchLens = "resident" | "world";
export interface HearthResearchState {
  tick: number;
  world: WorldSnapshot;
  residents: Array<{
    id: string; name: string; context: CognitionContext; pending: boolean; error: string | null;
    perception: { visibleIds: string[]; heardSpeech: ReceivedSpeech[]; sight?: { range: number; halfFieldRadians: number } };
  }>;
  trace: Array<{ sequence: number; tick: number; actorId?: string; stage: string; data: unknown }>;
  buildIdentity?: unknown;
}

interface ResearchPanelActions {
  read(): HearthResearchState | null;
  view(actorId: string | null, lens: ResidentResearchLens): void;
  typing(active: boolean): void;
}

export function observationStatus(entity: KnownEntity, visibleIds: ReadonlySet<string>): "body" | "visible" | "remembered" | "absent" {
  if (entity.source === "body") return "body";
  if (visibleIds.has(entity.id)) return "visible";
  return entity.lastCheckedAbsentAtTick !== undefined && entity.lastCheckedAbsentAtTick >= entity.seenAtTick ? "absent" : "remembered";
}

const statusLabels = { body: "Własne ciało / trzymane", visible: "Widzę teraz", remembered: "Pamiętam miejsce", absent: "Sprawdzone: nie ma tam" };
const setText = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };

/** Read-only projections: choosing a lens never selects or controls a resident mind. */
export class HearthResearchPanel {
  private readonly listeners = new AbortController();
  private readonly selection: HTMLSelectElement;
  private readonly lensSelection: HTMLSelectElement;
  private readonly content: HTMLElement;
  private readonly status: HTMLElement;
  private selectedId = "";
  private lens: ResidentResearchLens = "resident";
  private open = false;
  private lastObservationKey = "";
  private lastTraceKey = "";
  private readonly downloadUrls = new Set<string>();
  private readonly downloadTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly root: HTMLElement, private readonly toggle: HTMLButtonElement, private readonly actions: ResearchPanelActions) {
    root.id = "hearth-research";
    root.className = "hearth-research";
    root.hidden = true;
    root.setAttribute("aria-label", "Tryb badawczy God — tylko odczyt");
    toggle.setAttribute("aria-controls", root.id);
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-pressed", "false");
    root.innerHTML = `<header class="research-header"><div><p class="eyebrow">Jawny podgląd · tylko odczyt</p><h2>Tryb badawczy / God</h2></div><button type="button" class="research-close" aria-label="Zamknij tryb badawczy">×</button></header>
      <div class="research-toolbar"><label>Mieszkaniec <select aria-label="Badany mieszkaniec"></select></label><label>Widok <select aria-label="Soczewka badawcza"><option value="resident">Wiedza mieszkańca</option><option value="world">Świat fizyczny / God</option></select></label></div>
      <p class="research-disclosure">Ten podgląd nie przekazuje wiedzy mieszkańcom i nie zmienia ich działań. Sterowanie graczem pozostaje aktywne.</p>
      <div class="research-content">
        <section class="research-section"><h3>Teraz <span data-field="tick"></span></h3><p data-field="activity"></p><p class="research-runtime" data-field="pending"></p><p class="research-error" data-field="error"></p></section>
        <section class="research-section"><h3>Własne spostrzeżenia</h3><p class="research-legend"><span class="is-visible">● Widzi</span><span class="is-remembered">○ Pamięta</span><span class="is-absent">× Sprawdzone puste miejsce</span></p><p class="research-note" data-field="sight"></p><p class="research-note">Znaczniki pamięci leżą w ostatnim poznanym miejscu. Nie pokazują aktualnej pozycji niewidzianej rzeczy.</p><ul class="research-observations"></ul></section>
        <details class="research-section" open><summary>Własne sprawy i przekonania</summary><div data-field="concerns"></div><div data-field="beliefs"></div></details>
        <details class="research-section"><summary>Usłyszane przez mieszkańca</summary><pre data-field="heard"></pre></details>
        <details class="research-section"><summary>Doświadczenia i bieżący kontekst</summary><pre data-field="context"></pre></details>
        <details class="research-section"><summary>Zapytania, propozycje i przyjęcie</summary><p class="research-note">Ostatnie 40 wpisów tej osoby oraz wspólne zdarzenia. Pełny zachowany ślad jest w eksporcie.</p><div class="research-trace"></div></details>
        <details class="research-section"><summary>World — pełna prawda fizyczna</summary><p class="research-note">Ten blok może zawierać informacje nieznane wybranemu mieszkańcowi.</p><pre data-field="world"></pre></details>
      </div>
      <footer class="research-footer"><button type="button" class="research-export">Eksportuj JSON</button><span class="research-export-status" role="status"></span></footer>`;
    this.selection = root.querySelector('[aria-label="Badany mieszkaniec"]')!;
    this.lensSelection = root.querySelector('[aria-label="Soczewka badawcza"]')!;
    this.content = root.querySelector(".research-content")!;
    this.status = root.querySelector(".research-export-status")!;
    const options = { signal: this.listeners.signal };
    toggle.addEventListener("click", () => this.setOpen(!this.open), options);
    root.querySelector(".research-close")!.addEventListener("click", () => this.setOpen(false), options);
    this.selection.addEventListener("change", () => {
      this.selectedId = this.selection.value;
      this.resetSelection();
    }, options);
    this.lensSelection.addEventListener("change", () => {
      this.lens = this.lensSelection.value === "world" ? "world" : "resident";
      this.actions.view(this.selectedId, this.lens);
      this.blurSelection();
    }, options);
    root.addEventListener("focusin", event => {
      if (event.target instanceof HTMLSelectElement) this.actions.typing(true);
    }, options);
    root.addEventListener("focusout", event => {
      if (event.target instanceof HTMLSelectElement) this.actions.typing(false);
    }, options);
    root.addEventListener("keydown", event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.setOpen(false);
      }
    }, options);
    root.querySelector(".research-export")!.addEventListener("click", () => this.exportSnapshot(), options);
  }

  isOpen(): boolean { return this.open; }

  private setOpen(open: boolean): void {
    this.open = open;
    this.root.hidden = !open;
    this.toggle.setAttribute("aria-expanded", String(open));
    this.toggle.setAttribute("aria-pressed", String(open));
    this.toggle.classList.toggle("is-active", open);
    if (open) {
      this.update(this.actions.read());
      this.actions.view(this.selectedId || null, this.lens);
    } else {
      this.blurSelection();
      this.actions.view(null, this.lens);
    }
  }

  private blurSelection(): void {
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    this.actions.typing(false);
  }

  private resetSelection(): void {
    this.lastObservationKey = this.lastTraceKey = "";
    this.content.scrollTop = 0;
    this.update(this.actions.read());
    this.actions.view(this.selectedId, this.lens);
    this.blurSelection();
  }

  update(state: HearthResearchState | null): void {
    if (!this.open || !state) return;
    const residentKey = state.residents.map(r => `${r.id}:${r.name}`).join("|");
    if (this.selection.dataset.residents !== residentKey) {
      this.selection.replaceChildren(...state.residents.map(r => new Option(r.name, r.id)));
      this.selection.dataset.residents = residentKey;
    }
    if (!state.residents.some(r => r.id === this.selectedId)) {
      this.selectedId = state.residents[0]?.id ?? "";
      this.actions.view(this.selectedId || null, this.lens);
    }
    this.selection.value = this.selectedId;
    const resident = state.residents.find(r => r.id === this.selectedId);
    if (!resident) return;
    const { context } = resident;
    const field = (name: string) => this.root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
    setText(field("tick"), `t${state.tick}`);
    const realization = context.realization;
    const step = realization?.steps[realization.index];
    const concern = context.concerns.find(c => c.id === realization?.concernId);
    setText(field("activity"), realization
      ? `${concern?.description ?? realization.concernId} · ${realization.status} · krok ${Math.min(realization.index + 1, realization.steps.length)}/${realization.steps.length}${step ? ": " + JSON.stringify(step) : ""}${realization.outcome ? " · " + realization.outcome : ""}`
      : "Nie ma uruchomionego sposobu działania.");
    setText(field("pending"), resident.pending ? "Trwa zapytanie o namysł." : "Brak oczekującego zapytania.");
    setText(field("error"), resident.error ?? "");
    const sight = resident.perception.sight;
    setText(field("sight"), sight
      ? `Zasięg wzroku: ${sight.range}; kąt: ${Math.round(sight.halfFieldRadians * 360 / Math.PI)}°. Obrys pokazuje limit; ściany ograniczają widoczność.`
      : "Parametry stożka wzroku nie są dostępne w tej projekcji.");
    const visibleIds = new Set(resident.perception.visibleIds);
    const observationKey = JSON.stringify([resident.id, resident.perception.visibleIds, context.observations]);
    if (observationKey !== this.lastObservationKey) {
      this.lastObservationKey = observationKey;
      const nodes = context.observations.map(entity => {
        const status = observationStatus(entity, visibleIds);
        const li = document.createElement("li");
        li.className = `is-${status}`;
        const name = document.createElement("strong");
        name.textContent = entity.label;
        const detail = document.createElement("span");
        detail.textContent = `${statusLabels[status]} · (${Math.round(entity.position.x)}, ${Math.round(entity.position.y)}) · t${entity.seenAtTick}${status === "absent" ? " · sprawdzone t" + entity.lastCheckedAbsentAtTick : ""}`;
        li.append(name, detail);
        return li;
      });
      this.root.querySelector(".research-observations")!.replaceChildren(...nodes);
    }
    this.renderParagraphs(field("concerns"), context.concerns.map(c => `${c.status} · ${c.description}\n${c.reason} · dowody: ${c.evidenceIds.join(", ") || "brak odnośników"}`), "Brak zapisanych spraw.");
    this.renderParagraphs(field("beliefs"), context.beliefs.map(b => `${b.confidence} · ${b.claim}\nDowody: ${b.evidenceIds.join(", ") || "brak odnośników"}`), "Brak zapisanych przekonań.");
    const heardDetails = field("heard").closest("details")!;
    if (heardDetails.open) setText(field("heard"), JSON.stringify(resident.perception.heardSpeech, null, 2));
    if (field("context").closest("details")!.open) setText(field("context"), JSON.stringify(context, null, 2));
    if (field("world").closest("details")!.open) setText(field("world"), JSON.stringify(state.world, null, 2));
    const traceRoot = this.root.querySelector<HTMLElement>(".research-trace")!;
    if (traceRoot.closest("details")!.open) {
      const trace = state.trace.filter(t => !t.actorId || t.actorId === resident.id).slice(-40).reverse();
      const traceKey = JSON.stringify(trace);
      if (traceKey !== this.lastTraceKey) {
        this.lastTraceKey = traceKey;
        traceRoot.replaceChildren(...trace.map(entry => {
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = `#${entry.sequence} · t${entry.tick} · ${entry.stage}`;
          const data = document.createElement("pre");
          data.textContent = JSON.stringify(entry.data, null, 2) ?? "null";
          details.append(summary, data);
          return details;
        }));
      }
    }
  }

  private renderParagraphs(root: HTMLElement, rows: string[], empty: string): void {
    const key = JSON.stringify(rows);
    if (root.dataset.key === key) return;
    root.dataset.key = key;
    root.replaceChildren(...(rows.length ? rows : [empty]).map(words => {
      const paragraph = document.createElement("p");
      paragraph.textContent = words;
      return paragraph;
    }));
  }

  private exportSnapshot(): void {
    const state = this.actions.read();
    if (!state) return;
    const capture = {
      format: "first-hearth-research-v1",
      capturedAt: new Date().toISOString(),
      build: { declaredIdentity: state.buildIdentity ?? null, clientModuleUrl: import.meta.url },
      page: { origin: location.origin, pathname: location.pathname },
      selectedResidentId: this.selectedId,
      lens: this.lens,
      state
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(capture, null, 2)], { type: "application/json" }));
    this.downloadUrls.add(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = `first-hearth-t${state.tick}-${capture.capturedAt.replaceAll(":", "-")}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setText(this.status, `Zapisano zrzut t${state.tick}.`);
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      this.downloadUrls.delete(url);
      this.downloadTimers.delete(timer);
    }, 1000);
    this.downloadTimers.add(timer);
  }

  destroy(): void {
    this.setOpen(false);
    this.listeners.abort();
    for (const timer of this.downloadTimers) clearTimeout(timer);
    for (const url of this.downloadUrls) URL.revokeObjectURL(url);
    this.downloadTimers.clear();
    this.downloadUrls.clear();
    this.root.remove();
    this.toggle.remove();
  }
}
