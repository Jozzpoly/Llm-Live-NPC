import * as Phaser from "phaser";
import "./style.css";
import "./spc-next-research-style.css";
import type { SpcCanonicalEvidenceSnapshotV1 } from "../evidence/spc-next-canonical-evidence-snapshot";
import { FIVE_RESIDENT_ROLE_PRESSURES } from "../spc-next/five-resident-region";
import type { ResidentPercept, ResidentTraceEvent, WorldOccurrence } from "../spc-next/contracts";
import { SpcNextResearchScene, type SpcNextResearchFrame } from "./spc-next-research-scene";

const params = new URLSearchParams(location.search);
const evidenceMode = params.get("evidence") === "1";

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
gameNode.setAttribute("aria-label", "SPC Next living-world research scene");
footer.innerHTML = [
  "<span>Ruch: WASD / strzałki</span>",
  "<span>Wybór SPC: klik / Tab</span>",
  "<span>Zawołaj: H · mikroskop: R</span>",
  "<span>Śledź SPC: F · gracz: P · cały świat: O</span>",
  "<span>Tylko świat / badania: G · zoom: kółko</span>",
].join("");

const worldModeButton = document.createElement("button");
worldModeButton.type = "button";
worldModeButton.className = "spc-world-mode-toggle";
worldModeButton.textContent = "Tylko świat";
worldModeButton.setAttribute("aria-pressed", "false");
const headerActions = document.createElement("div");
headerActions.className = "spc-header-actions";
headerActions.append(stageNode, worldModeButton);
header.append(headerActions);

let scene: SpcNextResearchScene;
let worldOnly = false;

function setWorldOnly(enabled: boolean): void {
  worldOnly = enabled;
  appNode.classList.toggle("spc-world-only", enabled);
  worldModeButton.textContent = enabled ? "Otwórz badania" : "Tylko świat";
  worldModeButton.setAttribute("aria-pressed", String(enabled));
  stageNode.textContent = enabled ? "WORLD VIEW · NO TELEMETRY" : "WORLD / EPISTEMIC LAB";
  if (enabled) scene.setResearchOverlay(false);
}

function renderPanel(frame: SpcNextResearchFrame): void {
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
    return `<button class="spc-resident-button${active}" data-resident="${escapeHtml(resident.id)}">
      <span>${escapeHtml(resident.name)}</span>
      <small>${embodied} · legacy ${escapeHtml(resident.activity.kind)} · C${resident.pendingCognitionReasonCount}</small>
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
            <div><dt>camera zoom</dt><dd>${frame.cameraZoom.toFixed(2)}×</dd></div>
          </dl>
          ${activityMismatch ? '<p class="debug-note"><strong>Projection mismatch:</strong> ciało jest w ruchu mimo legacy activity=idle. Legacy activity nie jest tutaj bieżącym execution authority.</p>' : ""}
          <p class="spc-activity-reason"><strong>legacy reason:</strong> ${escapeHtml(activity?.reason ?? "")}</p>
        ` : '<p class="spc-empty">Kliknij residenta w świecie albo wybierz go z listy.</p>'}
      </section>

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
      addressResident: (residentId: string, text = "Hej!") => scene.playerAddressResident(residentId, text),
    }),
  });
}

worldModeButton.addEventListener("click", () => {
  setWorldOnly(!worldOnly);
  game.scale.refresh();
});
window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
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
