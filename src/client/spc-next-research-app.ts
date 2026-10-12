import * as Phaser from "phaser";
import "./style.css";
import "./spc-next-research-style.css";
import type { SpcCanonicalEvidenceSnapshotV1 } from "../evidence/spc-next-canonical-evidence-snapshot";
import { FIVE_RESIDENT_ANCHORS, FIVE_RESIDENT_ROLE_PRESSURES } from "../spc-next/five-resident-region";
import {
  validateLocalGroundImageSource,
  validateLocalGroundImageSignature,
} from "./spc-next-local-art-contract";
import { exportLocalArtCandidate, importLocalArtCandidate } from "./spc-next-local-art-candidate";
import { buildSpcManualProbeEvidence } from "./spc-next-manual-probe-export";
import type { ResidentPercept, ResidentTraceEvent, WorldOccurrence } from "../spc-next/contracts";
import {
  SPC_PLAYER_SPEECH_RADIUS,
  SpcNextResearchScene,
  type SpcNextResearchFrame,
} from "./spc-next-research-scene";

const params = new URLSearchParams(location.search);
const evidenceMode = params.get("evidence") === "1";
const unifiedLivingMode = params.get("scenario") === "unified-living"
  || (!evidenceMode && params.get("scenario") === null);
const unifiedWorldMode = unifiedLivingMode || params.get("scenario") === "unified-armed";

const appRoot = document.querySelector<HTMLElement>("#app");
const debugRoot = document.querySelector<HTMLElement>("#debug");
const gameRoot = document.querySelector<HTMLElement>("#game");
const stageChip = document.querySelector<HTMLElement>("#e1-stage-chip");
const heading = document.querySelector<HTMLElement>("h1");
const eyebrow = document.querySelector<HTMLElement>(".game-shell .eyebrow");
const footer = document.querySelector<HTMLElement>(".game-shell footer");
const header = document.querySelector<HTMLElement>(".game-shell header");

if (!appRoot || !debugRoot || !gameRoot || !stageChip || !heading || !eyebrow || !footer || !header) {
  throw new Error("SPC Next research shell is missing required DOM roots.");
}

const appNode: HTMLElement = appRoot;
const debugNode: HTMLElement = debugRoot;
const gameNode: HTMLElement = gameRoot;
const stageNode: HTMLElement = stageChip;

appNode.classList.add("spc-next-mode");
debugNode.hidden = false;
debugNode.className = "debug-shell spc-next-research-panel";
document.documentElement.lang = "pl";
document.title = "SPC Next — Living World Research";
heading.textContent = "SPC Next";
eyebrow.textContent = "Living world · embodied cognition research";
stageNode.textContent = "WORLD / EPISTEMIC LAB";
stageNode.classList.add("is-active");
if (unifiedLivingMode && !evidenceMode) {
  document.title = "SPC — Świat pięciu mieszkańców";
  heading.textContent = "SPC • Pięciu mieszkańców";
  eyebrow.textContent = "Wspólny świat · codzienne życie · rzeczywiste działania";
  stageNode.textContent = "ŚWIAT · BEZ AUTOMATYCZNEGO API";
}
gameNode.setAttribute("aria-label", "SPC Next living-world research scene");
footer.innerHTML = [
  "<span>Ruch: WASD / strzałki</span>",
  "<span>Wybór SPC: klik / Tab</span>",
  "<span>Zawołaj: H · mikroskop: R · podnieś/odłóż: E</span>",
  "<span>Śledź SPC: F · gracz: P · cały świat: O</span>",
  "<span>Tylko świat / badania: G · zoom: kółko</span>",
].join("");

const worldModeButton = document.createElement("button");
worldModeButton.type = "button";
worldModeButton.className = "spc-world-mode-toggle";
worldModeButton.textContent = "Tylko świat";
worldModeButton.setAttribute("aria-pressed", "false");
const chatForm = document.createElement("form");
chatForm.className = "spc-chat-form";
const chatInput = document.createElement("input");
chatInput.className = "spc-chat-input";
chatInput.type = "text";
chatInput.maxLength = 220;
chatInput.autocomplete = "off";
chatInput.placeholder = "Wybierz SPC i naciśnij Enter…";
chatInput.setAttribute("aria-label", "Powiedz coś wybranemu SPC");
const chatSend = document.createElement("button");
chatSend.type = "submit";
chatSend.className = "spc-chat-send";
chatSend.textContent = "Powiedz";
chatForm.append(chatInput, chatSend);

// Deliberate one-shot research control. No implicit Luna calls on World ticks.
const relationalEpisodeMode = params.get("scenario") === "relational-episode";
if (relationalEpisodeMode) {
  appNode.classList.add("spc-relational-mode");
  const history = params.get("case") !== "no-standing";
  const view = document.createElement("a");
  view.className = "spc-episode-compare";
  view.href = history
    ? "?spc=1&scenario=relational-episode&case=no-standing"
    : "?spc=1&scenario=relational-episode";
  view.textContent = history
    ? "Porównaj: ten sam powrót bez wcześniejszej obietnicy"
    : "Porównaj: powrót z wcześniejszą obietnicą";
  const replay = document.createElement("a");
  replay.className = "spc-episode-compare";
  replay.href = location.pathname + location.search;
  replay.textContent = "Odtwórz od początku";
  footer.append(view, replay);
}

const armedResearchMode = params.get("scenario") === "unified-armed";
const episodeDecision = document.createElement("button");
episodeDecision.type = "button";
episodeDecision.className = "spc-chat-send";
episodeDecision.textContent = "Test: odpowiedz";
episodeDecision.title = "Jawnie wstrzykuje lokalną decyzję TESTU, nie jest to decyzja Luny ani samodzielna inicjatywa Janka.";
episodeDecision.hidden = !relationalEpisodeMode;
episodeDecision.disabled = true;
const episodeDefer = document.createElement("button");
episodeDefer.type = "button";
episodeDefer.className = "spc-chat-send";
episodeDefer.textContent = "Test: odłóż";
episodeDefer.title = "Jawnie wstrzykuje lokalną decyzję TESTU o sensownym nie-działaniu; bez modelu.";
episodeDefer.hidden = !relationalEpisodeMode;
episodeDefer.disabled = true;
const episodeStatus = document.createElement("span");
episodeStatus.className = "spc-episode-status";
episodeStatus.hidden = !relationalEpisodeMode;
episodeStatus.textContent = "Pięć SPC · 0 requestów API · ustawienia sytuacji: autorskie";
const operatorLoginLink = document.createElement("a");
operatorLoginLink.className = "spc-operator-login";
operatorLoginLink.href = "/api/operator/login";
operatorLoginLink.textContent = "Logowanie";
operatorLoginLink.title = "Jednorazowe logowanie operatora do prywatnej sesji (bez Zero Trust).";
operatorLoginLink.hidden = !(armedResearchMode || (unifiedLivingMode && !evidenceMode));
const oneShotButton = document.createElement("button");
oneShotButton.type = "button";
oneShotButton.className = "spc-chat-send";
oneShotButton.textContent = "Zapytaj Lunę (1×)";
oneShotButton.title = "Wybrany mieszkaniec, jego rzeczywiste prywatne powody i maksymalnie jeden request w tej sesji. Model sam wybiera powód decyzji.";
oneShotButton.hidden = !armedResearchMode;
const oneShotStatus = document.createElement("span");
oneShotStatus.className = "spc-armed-status";
oneShotStatus.hidden = !armedResearchMode;
oneShotStatus.textContent = armedResearchMode ? "Luna: bez zapytań" : "";
const exportProbeButton = document.createElement("button");
exportProbeButton.type = "button";
exportProbeButton.className = "spc-chat-send";
exportProbeButton.textContent = "Zapisz dowody JSON";
exportProbeButton.title = "Świadomie zapisz lokalnie prywatny kontekst SPC, odpowiedź modelu i stan World. Plik zawiera dane badawcze; nie udostępniaj go publicznie.";
exportProbeButton.hidden = true;

// First-class World observation, not a hidden debug sidebar requirement.
// These buttons only change the observer's camera / selected resident;
// they never move bodies, grant private knowledge or dispatch model requests.
const worldNavigation = document.createElement("nav");
worldNavigation.className = "spc-world-navigation";
worldNavigation.setAttribute("aria-label", "Obserwuj mieszkańców świata");
worldNavigation.hidden = !(unifiedLivingMode && !evidenceMode);
const observePlayerButton = document.createElement("button");
observePlayerButton.type = "button";
observePlayerButton.textContent = "Gracz";
observePlayerButton.dataset.worldPlayer = "true";
observePlayerButton.title = "Wróć kamerą do gracza (P)";
worldNavigation.append(observePlayerButton);
for (const resident of FIVE_RESIDENT_ROLE_PRESSURES) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = resident.name;
  button.dataset.worldResident = resident.residentId;
  button.title = `Obserwuj ${resident.name} — kamera, bez zmiany zachowania SPC`;
  button.setAttribute("aria-pressed", "false");
  worldNavigation.append(button);
}

const operatorCognitionButton = document.createElement("button");
operatorCognitionButton.type = "button";
operatorCognitionButton.className = "spc-chat-send spc-live-cognition-button";
operatorCognitionButton.hidden = !(unifiedLivingMode && !evidenceMode);
operatorCognitionButton.textContent = "Włącz Lunę (max. 12)";
operatorCognitionButton.title = "Świadomie włącz maksymalnie 12 rzeczywistych zapytań API dla pięciu SPC. Mogą generować koszty; to NIE limit dolarowy. Po odświeżeniu znów wyłączone.";
const operatorCognitionStatus = document.createElement("span");
operatorCognitionStatus.className = "spc-live-cognition-status";
operatorCognitionStatus.hidden = operatorCognitionButton.hidden;
operatorCognitionStatus.textContent = "0 API · cognition wyłączone";


// Voluntary, LOCAL ONLY visual comparison. The user supplies a real PNG/WebP;
// no generated noise, no network loading, no World mutation and no persistence.
const artPreviewPanel = document.createElement("details");
artPreviewPanel.className = "spc-owner-art-preview";
artPreviewPanel.hidden = !(unifiedLivingMode && !evidenceMode);
const artSummary = document.createElement("summary");
artSummary.textContent = "Grafika świata · podgląd";
const artBody = document.createElement("div");
artBody.className = "spc-owner-art-body";
const artExplain = document.createElement("p");
artExplain.textContent = "Wyłącznie lokalny PNG/WebP na podłożu przy rzeczywistym miejscu. Bez kolizji i zmian zachowania SPC.";
const artFile = document.createElement("input");
artFile.type = "file";
artFile.accept = "image/png,image/webp";
artFile.setAttribute("aria-label", "Wybierz obraz podłoża PNG lub WebP");
const artSiteLabel = document.createElement("label");
artSiteLabel.textContent = "Miejsce";
const artSite = document.createElement("select");
for (const anchor of FIVE_RESIDENT_ANCHORS) {
  const option = document.createElement("option");
  option.value = anchor.id;
  option.textContent = anchor.label;
  artSite.append(option);
}
artSite.value = "anchor.workshop.bench";
artSiteLabel.append(artSite);
const artSizeLabel = document.createElement("label");
artSizeLabel.textContent = "Szerokość w World";
const artSize = document.createElement("input");
artSize.type = "range";
artSize.min = "96";
artSize.max = "1200";
artSize.step = "16";
artSize.value = "480";
const artSizeValue = document.createElement("span");
artSizeValue.textContent = "480";
artSizeLabel.append(artSize, artSizeValue);
const artOpacityLabel = document.createElement("label");
artOpacityLabel.textContent = "Krycie podglądu";
const artOpacity = document.createElement("input");
artOpacity.type = "range";
artOpacity.min = "0.1";
artOpacity.max = "1";
artOpacity.step = "0.05";
artOpacity.value = "0.85";
artOpacityLabel.append(artOpacity);
const artButtons = document.createElement("div");
artButtons.className = "spc-owner-art-buttons";
const artSaveCandidate = document.createElement("button");
artSaveCandidate.type = "button";
artSaveCandidate.textContent = "Zapisz próbkę";
artSaveCandidate.title = "Lokalny JSON zawiera dokładne bajty obrazu, SHA-256 i jego położenie. Nie tworzy mapy ani nie przesyła plików.";
const artLoadCandidate = document.createElement("button");
artLoadCandidate.type = "button";
artLoadCandidate.textContent = "Otwórz próbkę";
const artCandidateInput = document.createElement("input");
artCandidateInput.type = "file";
artCandidateInput.accept = "application/json,.json";
artCandidateInput.hidden = true;
const artShow = document.createElement("button");
artShow.type = "button";
artShow.textContent = "Ukryj / pokaż";
const artFocus = document.createElement("button");
artFocus.type = "button";
artFocus.textContent = "Zobacz miejsce";
const artRemove = document.createElement("button");
artRemove.type = "button";
artRemove.textContent = "Usuń podgląd";
artButtons.append(artShow, artFocus, artRemove, artSaveCandidate, artLoadCandidate, artCandidateInput);
const artStatus = document.createElement("p");
artStatus.className = "spc-owner-art-status";
artStatus.setAttribute("role", "status");
artStatus.textContent = "Brak grafiki. Neutralny World jest stanem tymczasowym, nie zatwierdzonym stylem.";
const artSafety = document.createElement("small");
artSafety.textContent = "Brak wysyłania do serwera. Odświeżenie usuwa podgląd; Zapisz próbkę pobiera lokalny JSON z dokładnym obrazem i ustawieniami.";
artBody.append(artExplain, artFile, artSiteLabel, artSizeLabel, artOpacityLabel, artButtons, artStatus, artSafety);
artPreviewPanel.append(artSummary, artBody);
let artDecodedImage: HTMLImageElement | null = null;
let artSourceFile: File | null = null;
let artVisible = true;
let artImportRevision = 0;

const headerActions = document.createElement("div");
headerActions.className = "spc-header-actions";
headerActions.append(stageNode, chatForm, operatorLoginLink, operatorCognitionButton, operatorCognitionStatus, oneShotButton, exportProbeButton, oneShotStatus, episodeStatus, episodeDecision, episodeDefer, worldModeButton);
header.append(worldNavigation, headerActions, artPreviewPanel);

let scene: SpcNextResearchScene;
// The Owner's default opens the World rather than requiring an extra click
// to hide the research microscope. Evidence and archival routes are untouched.
let worldOnly = unifiedLivingMode && !evidenceMode;
appNode.classList.toggle("spc-world-only", worldOnly);
worldModeButton.textContent = worldOnly ? "Otwórz badania" : "Tylko świat";
worldModeButton.setAttribute("aria-pressed", String(worldOnly));
let lastFrame: SpcNextResearchFrame | null = null;
let manualProbeBeginning: SpcNextResearchFrame | null = null;

function setWorldOnly(enabled: boolean): void {
  worldOnly = enabled;
  appNode.classList.toggle("spc-world-only", enabled);
  worldModeButton.textContent = enabled ? "Otwórz badania" : "Tylko świat";
  worldModeButton.setAttribute("aria-pressed", String(enabled));
  stageNode.textContent = enabled
    ? unifiedLivingMode ? "ŚWIAT · BEZ AUTOMATYCZNEGO API" : "WORLD VIEW · NO TELEMETRY"
    : unifiedLivingMode ? "ŚWIAT / BADANIA" : "WORLD / EPISTEMIC LAB";
  if (enabled) scene.setResearchOverlay(false);
}

function renderPanel(frame: SpcNextResearchFrame): void {
  lastFrame = frame;
  if (unifiedLivingMode && !evidenceMode && frame.livingDiagnostics) {
    const usage = frame.livingDiagnostics.providerHardBudget;
    const running = frame.livingDiagnostics.operatorAutoDispatchEnabled;
    const latestError = frame.livingDiagnostics.recentProviderEvents.some(event =>
      event.status === "provider_error" || event.status === "transport_internal_error");
    operatorCognitionButton.textContent = running ? "Pauzuj Lunę" : "Włącz Lunę";
    operatorCognitionButton.disabled = usage.exhausted && !running;
    operatorCognitionStatus.textContent = `${usage.upstreamRequestsStarted}/${usage.maxUpstreamRequests} API · ${
      running ? "SPC myślą" : latestError ? "pauza po błędzie" : usage.exhausted ? "limit" : "wyłączone"
    }`;
  }
  for (const button of worldNavigation.querySelectorAll<HTMLButtonElement>("[data-world-resident]")) {
    const selected = button.dataset.worldResident === frame.selectedResidentId;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  if (relationalEpisodeMode) {
    const current = scene?.relationalEpisodeState();
    if (current) {
      const labels: Record<typeof current.phase, string> = {
        approach: "Ida idzie do warsztatu · autorski warunek",
        promise: "Janek wykonuje wcześniej zadane zobowiązanie",
        leaving: "Ida odchodzi · autorska trasa",
        returning: "Ida wraca · World / prywatna pamięć",
        awaiting_choice: "Janek ma prywatny powód. Niczego nie robi automatycznie.",
        settling_choice: "Przyjmowanie ręcznej decyzji TESTU",
        spoken: "World: wypowiedź Janka rzeczywiście zaszła",
        deferred: "TEST: Janek odkłada sprawę, bez nowego działania",
        control_complete: "Kontrola: bez dawnej obietnicy nie powstał nowy powód",
        failed: "Eksperyment nie przeszedł: " + (current.failure ?? "nieznany powód"),
      };
      episodeStatus.textContent = labels[current.phase] + " · 0 API · " +
        (current.withEarlierPromise ? "historia: tak" : "kontrola: bez obietnicy");
      episodeDecision.disabled = current.phase !== "awaiting_choice";
      episodeDefer.disabled = current.phase !== "awaiting_choice";
    }
  }
  if (armedResearchMode && oneShotButton.disabled) {
    const latest = frame.livingDiagnostics?.recentProviderEvents.at(-1);
    if (latest?.status === "provider_error" || latest?.status === "transport_internal_error") {
      oneShotStatus.textContent = "Luna: błąd API";
      oneShotStatus.title = "Próba została wykorzystana. Świat działa dalej, ale odpowiedź modelu nie została przyjęta.";
    } else if (latest?.status === "admitted") {
      oneShotStatus.textContent = latest.detail.startsWith("applied ")
        ? latest.detail.includes("no new matter")
          ? "Decyzja: bez nowego zadania"
          : "Zamiar przyjęty; obserwuj World"
        : "Zamiar odrzucony (szczegóły w logu).";
    } else if (latest?.status === "arrival_ready") {
      oneShotStatus.textContent = "Odpowiedź czeka na World";
    } else if (latest?.status === "request_started") {
      oneShotStatus.textContent = "Luna: oczekiwanie";
    }
  }
  const selected = frame.selectedDiagnostics;
  const selectedActor = frame.selectedResidentId
    ? frame.snapshot.actors.find((actor) => actor.id === frame.selectedResidentId) ?? null
    : null;
  const role = frame.selectedResidentId
    ? FIVE_RESIDENT_ROLE_PRESSURES.find((candidate) => candidate.residentId === frame.selectedResidentId) ?? null
    : null;
  const motion = frame.selectedResidentId
    ? frame.motionOutcomes.find((candidate) => candidate.actorId === frame.selectedResidentId) ?? null
    : null;

  const residentButtons = frame.snapshot.residents.map((resident) => {
    const active = resident.id === frame.selectedResidentId ? " is-active" : "";
    const actor = frame.snapshot.actors.find((candidate) => candidate.id === resident.id);
    const speed = actor ? Math.hypot(actor.velocity.x, actor.velocity.y) : 0;
    const embodied = speed > 1 ? `moving ${speed.toFixed(0)}` : "still";
    const activityLabel = unifiedLivingMode
      ? `${embodied} · C${resident.pendingCognitionReasonCount}`
      : `${embodied} · legacy ${resident.activity.kind} · C${resident.pendingCognitionReasonCount}`;
    return `<button class="spc-resident-button${active}" data-resident="${escapeHtml(resident.id)}">
      <span>${escapeHtml(resident.name)}</span>
      <small>${escapeHtml(activityLabel)}</small>
    </button>`;
  }).join("");

  const percepts = selected?.recentPercepts.slice(-9).reverse().map(renderPercept).join("")
    ?? '<li class="spc-empty">Wybierz residenta, aby zobaczyć jego prywatny strumień percepcji.</li>';
  const trace = selected?.trace.slice(-8).reverse().map(renderTrace).join("")
    ?? '<li class="spc-empty">Brak wybranego residenta.</li>';
  const occurrences = frame.recentOccurrences.slice(-7).reverse().map((occurrence) => `
    <li>
      <span class="spc-log-main">t${occurrence.tick} · ${escapeHtml(occurrence.kind)} · ${escapeHtml(occurrence.actorId ?? "world")}</span>
      <span class="spc-log-sub">${escapeHtml(occurrence.text ?? occurrence.summary)}</span>
    </li>`).join("") || '<li class="spc-empty">Brak publicznych occurrences.</li>';

  const resolvedSpeed = selectedActor ? Math.hypot(selectedActor.velocity.x, selectedActor.velocity.y) : 0;
  const intentSpeed = motion ? Math.hypot(motion.desiredVelocity.x, motion.desiredVelocity.y) : 0;
  const activity = selected?.publicState.activity ?? null;
  const constraintLabel = motion?.constraints.length ? motion.constraints.join(" + ") : "—";
  const bodyState = resolvedSpeed > 1 ? "moving" : "still";
  const activityMismatch = Boolean(activity?.kind === "idle" && resolvedSpeed > 1);
  const life = frame.selectedLife;
  const focusedMatter = life?.body.focusedRunId
    ? life.matters.find((matter) => matter.activeRun?.runId === life.body.focusedRunId) ?? null
    : null;
  const living = frame.livingDiagnostics;
  const admittedEvent = living?.recentProviderEvents.slice().reverse().find(
    (event) => event.status === "admitted"
      && event.residentId === frame.selectedResidentId
      && event.admittedChoice !== undefined,
  ) ?? null;
  const admittedChoice = admittedEvent?.admittedChoice ?? null;
  const chosenMatter = admittedChoice?.matterId
    ? life?.matters.find((matter) => matter.id === admittedChoice.matterId) ?? null
    : null;
  // Outcome is projected from CURRENT resident-owned kernel evidence, not model prose.
  const chosenOutcome = chosenMatter && admittedChoice?.runId
    && chosenMatter.lastOutcomeEvidence?.sourceRunId === admittedChoice.runId
    ? chosenMatter.lastOutcomeEvidence
    : null;
  const providerEvents = living?.recentProviderEvents.slice(-7).reverse().map((event) => `
    <li>
      <span class="spc-log-main">t${event.tick} · ${escapeHtml(event.status)} · ${escapeHtml(event.residentId)}</span>
      <span class="spc-log-sub">${escapeHtml(event.detail)}</span>
    </li>`).join("") ?? "";

  const playerActor = frame.snapshot.actors.find((actor) => actor.id === "player.jozz") ?? null;
  const selectedSpeechDistance = playerActor && selectedActor
    ? Math.hypot(
        selectedActor.position.x - playerActor.position.x,
        selectedActor.position.y - playerActor.position.y,
      )
    : null;
  const selectedCanHearPlayer = frame.selectedResidentId !== null
    && selectedSpeechDistance !== null
    && selectedSpeechDistance <= SPC_PLAYER_SPEECH_RADIUS;

  chatInput.disabled = !selectedCanHearPlayer;
  chatInput.placeholder = frame.selectedResidentId === null
    ? "Wybierz SPC…"
    : selectedCanHearPlayer
      ? `Powiedz coś: ${selected?.publicState.name ?? frame.selectedResidentId}`
      : `${selected?.publicState.name ?? frame.selectedResidentId} jest poza zasięgiem głosu — podejdź bliżej`;
  chatSend.disabled = !selectedCanHearPlayer;

  debugNode.innerHTML = `
    <div class="workspace-header spc-research-header">
      <div class="workspace-title-block">
        <div class="workspace-kicker">SPC Next</div>
        <h2 class="workspace-title">Causal research lens</h2>
      </div>
      <span class="spc-tick">t${frame.snapshot.tick}</span>
    </div>
    <div class="debug-content spc-research-content">
      <section class="spc-control-grid">
        <button class="debug-toggle${frame.overlayEnabled ? " is-active" : ""}" data-action="overlay">
          <span class="debug-toggle-label">Epistemic overlay</span><span class="debug-shortcut">R</span>
        </button>
        <button class="debug-toggle" data-action="call"><span class="debug-toggle-label">Zawołaj w świecie</span><span class="debug-shortcut">H</span></button>
        <button class="debug-toggle" data-action="focus"><span class="debug-toggle-label">Śledź SPC</span><span class="debug-shortcut">F</span></button>
        <button class="debug-toggle" data-action="player"><span class="debug-toggle-label">Śledź gracza</span><span class="debug-shortcut">P</span></button>
        <button class="debug-toggle" data-action="overview"><span class="debug-toggle-label">Cały świat</span><span class="debug-shortcut">O</span></button>
      </section>

      <section class="debug-section">
        <h3 class="debug-section-title">Residents</h3>
        <div class="spc-resident-list">${residentButtons}</div>
      </section>

      <section class="debug-section">
        <h3 class="debug-section-title">Selected body / projection</h3>
        ${selected && selectedActor ? `
          <div class="spc-selected-name">${escapeHtml(selected.publicState.name)}</div>
          <p class="spc-role">${escapeHtml(role?.pressure ?? "resident world participant")}</p>
          <dl class="spc-facts">
            <div><dt>region</dt><dd>${escapeHtml(frame.selectedRegionId ?? "—")}</dd></div>
            <div><dt>position</dt><dd>${selectedActor.position.x.toFixed(0)}, ${selectedActor.position.y.toFixed(0)}</dd></div>
            <div><dt>body</dt><dd>${bodyState}</dd></div>
            <div><dt>legacy activity</dt><dd>${escapeHtml(activity?.kind ?? "—")}</dd></div>
            <div><dt>motion intent</dt><dd>${intentSpeed.toFixed(1)}</dd></div>
            <div><dt>resolved velocity</dt><dd>${resolvedSpeed.toFixed(1)}</dd></div>
            <div><dt>resolution</dt><dd class="motion-${motion?.resolution ?? "none"}">${escapeHtml(motion?.resolution ?? "—")}</dd></div>
            <div><dt>constraint</dt><dd>${escapeHtml(constraintLabel)}</dd></div>
            <div><dt>cognition queue</dt><dd>${selected.publicState.pendingCognitionReasonCount}</dd></div>
            <div><dt>recovered matters</dt><dd>${life?.matters.length ?? "—"}</dd></div>
            <div><dt>focused run</dt><dd>${escapeHtml(life?.body.focusedRunId ?? "—")}</dd></div>
            <div><dt>semantic intent</dt><dd>${escapeHtml(focusedMatter?.semanticIntent?.kind ?? "—")}</dd></div>
            <div><dt>camera zoom</dt><dd>${frame.cameraZoom.toFixed(2)}×</dd></div>
          </dl>
          ${focusedMatter ? `<p class="spc-activity-reason"><strong>causal matter:</strong> ${escapeHtml(focusedMatter.semanticCourse)}</p>` : ""}
          ${activityMismatch ? '<p class="debug-note"><strong>Projection mismatch:</strong> ciało jest w ruchu mimo legacy activity=idle. Legacy activity nie jest tutaj bieżącym execution authority.</p>' : ""}
          <p class="spc-activity-reason"><strong>legacy reason:</strong> ${escapeHtml(activity?.reason ?? "")}</p>
        ` : '<p class="spc-empty">Kliknij residenta w świecie albo wybierz go z listy.</p>'}
      </section>

      ${armedResearchMode ? `
      <section class="debug-section">
        <h3 class="debug-section-title">Decyzja cognition → World</h3>
        ${admittedChoice ? `
          <dl class="spc-facts">
            <div><dt>Przyczyna (prywatna)</dt><dd>${escapeHtml(admittedChoice.originReasonId)}</dd></div>
            <div><dt>Decyzja przyjęta lokalnie</dt><dd>${escapeHtml(admittedChoice.kind)}</dd></div>
            <div><dt>Uzasadnienie modelu (deklaracja)</dt><dd>${escapeHtml(admittedChoice.declaredRationale ?? "niedostępne")}</dd></div>
            <div><dt>Nowe zobowiązanie</dt><dd>${escapeHtml(admittedChoice.matterId ?? "brak")}</dd></div>
            <div><dt>Aktualny stan matter</dt><dd>${escapeHtml(chosenMatter?.status ?? (admittedChoice.matterId ? "poza bieżącą projekcją" : "bez nowego matter"))}</dd></div>
            <div><dt>Autoryzowany run</dt><dd>${escapeHtml(admittedChoice.runId ?? "brak")}</dd></div>
          </dl>
          ${chosenMatter ? `<p class="spc-activity-reason"><strong>Własny cel:</strong> ${escapeHtml(chosenMatter.semanticCourse)}</p>` : ""}
          <p class="spc-activity-reason"><strong>Faktyczny wynik w World:</strong> ${chosenOutcome
            ? `t${chosenOutcome.tick} · ${escapeHtml(chosenOutcome.kind)} · ${escapeHtml(chosenOutcome.summary)}`
            : "Brak potwierdzonego wyniku wykonania."}</p>
        ` : '<p class="spc-empty">Brak lokalnie przyjętej decyzji dla wybranego SPC. Próba API lub nieprawidłowa propozycja nie są decyzją.</p>'}
        <p class="debug-note">Uznanie zamiaru nie jest wykonaniem. Nawet factual outcome nie oznacza automatycznie sukcesu; czytaj status, rodzaj i treść dowodu.</p>
      </section>` : ""}

      ${living ? `
      <section class="debug-section">
        <h3 class="debug-section-title">Unified living runtime</h3>
        <dl class="spc-facts">
          <div><dt>recovered residents</dt><dd>${living.claimedResidentIds.length}/5</dd></div>
          <div><dt>provider requests</dt><dd>${living.providerRequestCount}</dd></div>
          <div><dt>provider in flight</dt><dd>${living.providerInFlightResidentIds.length}</dd></div>
          <div><dt>arrival inbox</dt><dd>${living.providerInboxCount}</dd></div>
        </dl>
        <ol class="spc-log">${providerEvents || '<li class="spc-empty">Brak provider events.</li>'}</ol>
      </section>` : ""}

      <section class="debug-section spc-legend">
        <h3 class="debug-section-title">Jak czytać mikroskop</h3>
        <p><i class="legend-dot sight"></i> sight reach / dokładny ślad wzrokowy</p>
        <p><i class="legend-dot hearing"></i> hearing reach / kierunkowy ślad dźwięku</p>
        <p><i class="legend-dot target"></i> legacy public activity target</p>
        <p><i class="legend-dot intent"></i> motion intent — czego aktualny controller próbuje</p>
        <p><i class="legend-dot resolved"></i> resolved motion — co ciało faktycznie zrobiło</p>
        <p><i class="legend-dot constraint"></i> constrained / blocked physical outcome</p>
        <p class="debug-note">Legacy activity jest zachowaną projekcją starego runtime i nie może być traktowana jako execution authority recovered residenta. Szara linia od epistemicznego śladu do prawdziwego aktora pokazuje rozjazd wiedzy NPC z aktualnym stanem świata. Overlay jest narzędziem badawczym; nie jest gameplay UI.</p>
      </section>

      <section class="debug-section">
        <h3 class="debug-section-title">Private perception</h3>
        <ol class="spc-log">${percepts}</ol>
      </section>

      <section class="debug-section">
        <h3 class="debug-section-title">Resident causal trace</h3>
        <ol class="spc-log">${trace}</ol>
      </section>

      <section class="debug-section">
        <h3 class="debug-section-title">Public world occurrences</h3>
        <ol class="spc-log">${occurrences}</ol>
      </section>
    </div>`;
}

function renderPercept(percept: ResidentPercept): string {
  return `<li>
    <span class="spc-log-main">t${percept.tick} · ${escapeHtml(percept.phenomenon)} / ${escapeHtml(percept.modality)}</span>
    <span class="spc-log-sub">${escapeHtml(percept.actorId ?? "world")} · ${escapeHtml(spatialLabel(percept))}${percept.addressed ? " · addressed" : ""}</span>
  </li>`;
}

function renderTrace(event: ResidentTraceEvent): string {
  return `<li>
    <span class="spc-log-main">t${event.tick} · ${escapeHtml(event.kind)}</span>
    <span class="spc-log-sub">${escapeHtml(event.summary)}</span>
  </li>`;
}

function spatialLabel(percept: ResidentPercept): string {
  if (percept.spatial.kind === "exact") {
    return `exact (${percept.spatial.position.x.toFixed(0)}, ${percept.spatial.position.y.toFixed(0)})`;
  }
  if (percept.spatial.kind === "directional") {
    return `${percept.spatial.distanceBand} direction (${percept.spatial.direction.x.toFixed(2)}, ${percept.spatial.direction.y.toFixed(2)})`;
  }
  return "no spatial cue";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

scene = new SpcNextResearchScene(renderPanel, { manualWorldControl: evidenceMode });
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: gameNode,
  width: 960,
  height: 640,
  backgroundColor: "#10161a",
  scene: [scene],
  render: { antialias: true, pixelArt: false },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 640,
  },
});

if (evidenceMode) {
  const evidenceWindow = window as Window & {
    __SPC_EVIDENCE__?: Readonly<{
      version: 3;
      control: "manual-world";
      ready(): boolean;
      snapshot(): SpcNextResearchFrame;
      canonicalSnapshot(): SpcCanonicalEvidenceSnapshotV1;
      stepWorld(steps?: number): SpcNextResearchFrame;
      scenarioAction(actionId: string): unknown;
      addressResident(residentId: string, text?: string): WorldOccurrence;
    }>;
  };
  Object.defineProperty(evidenceWindow, "__SPC_EVIDENCE__", {
    configurable: true,
    enumerable: false,
    value: Object.freeze({
      version: 3 as const,
      control: "manual-world" as const,
      ready: () => scene.evidenceReady(),
      snapshot: () => scene.currentFrame(),
      canonicalSnapshot: () => scene.currentCanonicalEvidenceSnapshot(),
      stepWorld: (steps = 1) => scene.stepEvidenceWorld(steps),
      scenarioAction: (actionId: string) => scene.runEvidenceScenarioAction(actionId),
      addressResident: (residentId: string, text = "Hej!") => {
        // Evidence that inspects a private resident plane must bind observation to
        // the addressed resident on every replay. Selection is presentation-only;
        // the participant action itself still enters through World.speak().
        scene.selectResident(residentId);
        return scene.playerAddressResident(residentId, text);
      },
    }),
  });
}

function refreshLocalArtPreview(): void {
  if (!artDecodedImage) return;
  try {
    scene.previewLocalGroundImage(
      artSite.value, artDecodedImage, Number(artSize.value), Number(artOpacity.value),
    );
    scene.setLocalGroundImageVisible(artVisible);
    artSizeValue.textContent = artSize.value;
    artStatus.textContent = `${artVisible ? "Podgląd" : "Ukryta grafika"}: ${artSite.selectedOptions[0]?.textContent ?? artSite.value} · tylko warstwa wizualna`;
  } catch (error) {
    artStatus.textContent = error instanceof Error ? error.message : "Nie udało się pokazać obrazu.";
  }
}

artFile.addEventListener("change", () => {
  const file = artFile.files?.[0];
  if (!file) return;
  const revision = ++artImportRevision;
  void (async () => {
    validateLocalGroundImageSource(file);
    validateLocalGroundImageSignature(file.type, new Uint8Array(await file.arrayBuffer()));
    if (revision !== artImportRevision) return;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (revision !== artImportRevision) return;
      artDecodedImage = image;
      artSourceFile = file;
      artVisible = true;
      refreshLocalArtPreview();
      scene.viewWorldSite(artSite.value);
    } finally {
      URL.revokeObjectURL(url);
    }
  })().catch((error: unknown) => {
    if (revision !== artImportRevision) return;
    artFile.value = "";
    artStatus.textContent = error instanceof Error ? error.message : "Plik został odrzucony.";
  });
});
artSite.addEventListener("change", () => {
  refreshLocalArtPreview();
  scene.viewWorldSite(artSite.value);
});
artSize.addEventListener("input", refreshLocalArtPreview);
artOpacity.addEventListener("input", refreshLocalArtPreview);
artShow.addEventListener("click", () => {
  if (!artDecodedImage) return;
  artVisible = !artVisible;
  refreshLocalArtPreview();
});
artFocus.addEventListener("click", () => scene.viewWorldSite(artSite.value));
artSaveCandidate.addEventListener("click", () => {
  if (!artSourceFile || !artDecodedImage) {
    artStatus.textContent = "Najpierw załaduj własną grafikę.";
    return;
  }
  void exportLocalArtCandidate(
    artSourceFile, artSite.value,
    Number(artSize.value), Number(artOpacity.value), FIVE_RESIDENT_ANCHORS,
  ).then((json) => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "spc-art-candidate-local.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    artStatus.textContent = "Próbka zapisana lokalnie. World nie został zmieniony.";
  }).catch((error: unknown) => {
    artStatus.textContent = error instanceof Error ? error.message : "Błąd eksportu.";
  });
});
artLoadCandidate.addEventListener("click", () => artCandidateInput.click());
artCandidateInput.addEventListener("change", () => {
  const selected = artCandidateInput.files?.[0];
  if (!selected) return;
  const revision = ++artImportRevision;
  void (async () => {
    if (selected.size > 6_000_000 || selected.size <= 0) {
      throw new Error("Lokalna próbka JSON jest pusta lub przekracza limit.");
    }
    const restored = await importLocalArtCandidate(
      await selected.text(), FIVE_RESIDENT_ANCHORS,
    );
    if (revision !== artImportRevision) return;
    const copy = new Uint8Array(restored.bytes.length);
    copy.set(restored.bytes);
    const file = new File([copy.buffer], restored.fileName, { type: restored.mime });
    const url = URL.createObjectURL(file);
    let image: HTMLImageElement;
    try {
      image = new Image();
      image.src = url;
      await image.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    if (revision !== artImportRevision) return;
    // Only the ART UI is restored; this is not a World save/load.
    artSourceFile = file;
    artDecodedImage = image;
    artSite.value = restored.anchorId;
    artSize.value = String(restored.worldWidth);
    artOpacity.value = String(restored.opacity);
    artVisible = true;
    refreshLocalArtPreview();
    scene.viewWorldSite(artSite.value);
  })().catch((error: unknown) => {
    if (revision !== artImportRevision) return;
    artStatus.textContent = error instanceof Error ? error.message : "Próbka została odrzucona.";
  }).finally(() => { artCandidateInput.value = ""; });
});
artRemove.addEventListener("click", () => {
  artImportRevision += 1;
  artSourceFile = null;
  artDecodedImage = null;
  artFile.value = "";
  artVisible = true;
  scene.clearLocalGroundImage();
  artStatus.textContent = "Podgląd usunięty. Świat i jego stan są bez zmian.";
});

episodeDecision.addEventListener("click", () => {
  if (!relationalEpisodeMode) return;
  scene.chooseRelationalTestOutcome("respond");
});
episodeDefer.addEventListener("click", () => {
  if (!relationalEpisodeMode) return;
  scene.chooseRelationalTestOutcome("defer");
});

oneShotButton.addEventListener("click", () => {
  if (!armedResearchMode || oneShotButton.disabled) return;
  const before = scene.currentFrame();
  const status = scene.requestSelectedResidentCognition();
  if (status === "started") {
    manualProbeBeginning = structuredClone(before);
    exportProbeButton.hidden = false;
    oneShotStatus.textContent = "Wysłano 1/1";
    oneShotButton.disabled = true;
  } else if (status === "budget_exhausted") {
    oneShotStatus.textContent = "Limit 1/1 wyczerpany";
    oneShotButton.disabled = true;
  } else if (status === "no_reason") {
    oneShotStatus.textContent = "Brak prywatnego powodu";
    oneShotStatus.title = "Brak aktualnego powodu do oceny. Możesz poczekać na prawdziwe wydarzenie w World; nie wymuszaj wypowiedzi gracza tylko po to, aby uruchomić model.";
  } else {
    oneShotStatus.textContent = "Mieszkaniec jeszcze niegotowy";
  }
});

exportProbeButton.addEventListener("click", () => {
  if (!armedResearchMode || !manualProbeBeginning) return;
  const probe = scene.manualResearchProbe();
  if (!probe) {
    oneShotStatus.textContent = "Brak danych próby";
    return;
  }
  const after = scene.currentFrame();
  if (after.selectedResidentId !== probe.residentId) {
    oneShotStatus.textContent = "Wybierz ponownie " + probe.residentId;
    return;
  }
  try {
    const evidence = buildSpcManualProbeEvidence(
      manualProbeBeginning, after, probe, new Date().toISOString(),
    );
    // Browser-local download only. Never POST, never server persistence.
    const blob = new Blob([JSON.stringify(evidence, null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `spc-manual-luna-${probe.residentId.replaceAll(".", "-")}-t${probe.dispatchedAtTick}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 10_000);
  } catch {
    oneShotStatus.textContent = "Nie można zapisać: niespójny kontekst";
  }
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  const residentId = lastFrame?.selectedResidentId ?? null;
  const player = lastFrame?.snapshot.actors.find((actor) => actor.id === "player.jozz") ?? null;
  const resident = residentId
    ? lastFrame?.snapshot.actors.find((actor) => actor.id === residentId) ?? null
    : null;
  const inSpeechRange = player && resident
    ? Math.hypot(resident.position.x - player.position.x, resident.position.y - player.position.y)
      <= SPC_PLAYER_SPEECH_RADIUS
    : false;
  if (!text || !residentId || !inSpeechRange) return;
  scene.playerAddressResident(residentId, text);
  chatInput.value = "";
  chatInput.blur();
  game.canvas.focus();
});

operatorCognitionButton.addEventListener("click", () => {
  if (operatorCognitionButton.disabled || !lastFrame?.livingDiagnostics) return;
  if (lastFrame.livingDiagnostics.operatorAutoDispatchEnabled) {
    scene.pauseBoundedCognition();
    return;
  }
  const cap = lastFrame.livingDiagnostics.providerHardBudget.maxUpstreamRequests;
  const consent = window.confirm(
    `Uruchomić wyższą cognition pięciu SPC? W tej sesji może rozpocząć się do ${cap} rzeczywistych requestów API. Mogą generować koszty; to NIE jest limit dolarowy. Bez Twojego kliknięcia nie są wysyłane zapytania.`,
  );
  if (!consent) return;
  scene.startBoundedCognition();
});
worldNavigation.addEventListener("click", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>("button")
    : null;
  if (!button) return;
  if (button.dataset.worldPlayer === "true") {
    scene.followPlayer();
    return;
  }
  const residentId = button.dataset.worldResident;
  if (!residentId) return;
  scene.selectResident(residentId);
  scene.focusSelected();
});
worldModeButton.addEventListener("click", () => {
  setWorldOnly(!worldOnly);
  game.scale.refresh();
});
window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (event.key === "Enter") {
    event.preventDefault();
    chatInput.focus();
    return;
  }
  if (event.key.toLowerCase() === "g") {
    setWorldOnly(!worldOnly);
    game.scale.refresh();
  }
});

debugNode.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action], [data-resident]") : null;
  if (!target) return;
  const residentId = target.dataset.resident;
  if (residentId) {
    scene.selectResident(residentId);
    // In the actual FIVE-person living World, choosing a resident must
    // immediately let the Owner *see* their embodied work and whereabouts.
    // Pure selection in an 8,192-unit World otherwise feels like a dead UI.
    // Press P to return the camera to the player.
    if (unifiedWorldMode) {
      scene.focusSelected();
    }
    return;
  }
  switch (target.dataset.action) {
    case "overlay":
      scene.toggleResearchOverlay();
      break;
    case "call":
      scene.playerCall();
      break;
    case "focus":
      scene.focusSelected();
      break;
    case "player":
      scene.followPlayer();
      break;
    case "overview":
      scene.overview();
      break;
  }
});

const resizeObserver = new ResizeObserver(() => game.scale.refresh());
resizeObserver.observe(gameNode);
game.events.once("destroy", () => resizeObserver.disconnect());
if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
