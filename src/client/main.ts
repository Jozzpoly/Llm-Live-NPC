import * as Phaser from "phaser";
import "./style.css";
import "./mobile-style.css";
import "./living-style.css";
import { LivingPanel } from "./living-panel";
import { HearthResearchPanel } from "./hearth-research-panel";
import { ActionAttemptDebugPanel } from "./action-attempt-debug-panel";
import { DebugWorkspace } from "./debug-workspace";
import { E1DebugPanel } from "./e1-debug-panel";
import { FirstPresenceDebugPanel } from "./first-presence-debug-panel";
import { isTouchOwnerDevice, MobileOwnerControls } from "./mobile-controls";
import { PlayerControlBuffer } from "./player-control-buffer";
import { WorldScene } from "./world-scene";

const appRoot = document.querySelector<HTMLElement>("#app");
const debugRoot = document.querySelector<HTMLElement>("#debug");
const gameRoot = document.querySelector<HTMLElement>("#game");
const stageChip = document.querySelector<HTMLElement>("#e1-stage-chip");

if (!appRoot || !debugRoot || !gameRoot || !stageChip) {
  throw new Error("E1 shell is missing #app, #game, #debug or #e1-stage-chip root.");
}

const stageChipNode: HTMLElement = stageChip;
const mobileOwnerMode = isTouchOwnerDevice();
appRoot.classList.toggle("mobile-owner-mode", mobileOwnerMode);
const livingMode = new URLSearchParams(location.search).get("lab") !== "1";
appRoot.classList.toggle("living-mode", livingMode);
if (livingMode) {
  document.documentElement.lang = "pl";
  document.title = "First Hearth — Wspólny świat";
  document.querySelector("h1")!.textContent = "First Hearth";
  document.querySelector(".game-shell .eyebrow")!.textContent = "Pierwsze wspólne chwile";
  document.querySelector(".game-shell footer")!.innerHTML = "<span>Ruch: WASD / strzałki</span><span>Podnieś: E · Odłóż: Q</span><span>Rozmowa: Enter · Powrót do ruchu: Esc</span>";
  gameRoot.setAttribute("aria-label", "Świat mieszkańców i gracza");
}

let scene: WorldScene;
let e1Panel: E1DebugPanel | null = null;
let actionAttemptPanel: ActionAttemptDebugPanel | null = null;
let firstPresencePanel: FirstPresenceDebugPanel | null = null;
let livingPanel: LivingPanel | null = null;
let researchPanel: HearthResearchPanel | null = null;
const uiListeners = new AbortController();
const playerControls = new PlayerControlBuffer();

function updateNpcUi(): void {
  const resident = scene.residentState();
  if (resident) {
    livingPanel?.update(resident);
    if (researchPanel?.isOpen()) researchPanel.update(scene.residentResearchState());
    stageChipNode.textContent = "Wspólny świat";
    stageChipNode.classList.add("is-active");
    return;
  }
  const state = scene.e1AgentState();
  const presence = scene.firstPresenceState();
  const presenceActive = presence.phase !== "idle";
  e1Panel?.setLockedByPresence(presenceActive);
  e1Panel?.update(state);
  firstPresencePanel?.update(presence);
  stageChipNode.textContent = presenceActive
    ? `First Presence · ${presence.phase.replaceAll("_", " ")}`
    : state.armed ? "E1 cognition armed" : "First Presence ready";
  stageChipNode.classList.toggle("is-active", presenceActive || state.armed);
}

const workspace = livingMode ? null : new DebugWorkspace(debugRoot, appRoot, {
  toggleLabels: () => scene.toggleLabels(),
  toggleLosProbe: () => scene.toggleDebugOverlay(),
  togglePointerProbe: () => scene.togglePointerProbe(),
  startNpcFetchLantern: () => scene.startNpcFetchLanternTask()
});
if (mobileOwnerMode) workspace?.setCollapsed(true);

scene = new WorldScene((state) => {
  workspace?.update(state);
  actionAttemptPanel?.update(scene.recentActionAttempts());
  updateNpcUi();
}, playerControls, livingMode);

if (livingMode) {
  debugRoot.hidden = true;
  const residentRoot = document.createElement("aside");
  appRoot.append(residentRoot);
  livingPanel = new LivingPanel(residentRoot, {
    send: (text, mode) => scene.speakToResident(text, mode),
    retry: () => scene.retryResident(),
    typing: active => scene.setTyping(active)
  });
  const researchRoot = document.createElement("aside");
  const researchToggle = document.createElement("button");
  researchToggle.type = "button";
  researchToggle.className = "research-toggle";
  researchToggle.textContent = "Badania / God";
  const headerActions = document.createElement("div");
  headerActions.className = "hearth-header-actions";
  headerActions.append(stageChipNode, researchToggle);
  document.querySelector(".game-shell header")!.append(headerActions);
  appRoot.append(researchRoot);
  researchPanel = new HearthResearchPanel(researchRoot, researchToggle, {
    read: () => scene.residentResearchState(),
    view: (actorId, lens) => {
      appRoot.classList.toggle("research-open", actorId !== null);
      scene.setResidentResearchView(actorId, lens);
    },
    typing: active => scene.setTyping(active)
  });
} else {
  e1Panel = new E1DebugPanel(debugRoot, {
    toggle: () => scene.toggleE1Agent()
  });
  actionAttemptPanel = new ActionAttemptDebugPanel(debugRoot);
  firstPresencePanel = new FirstPresenceDebugPanel(debugRoot, {
    start: () => scene.startFirstPresence(),
    retry: () => scene.retryFirstPresence(),
    resume: () => scene.resumeFirstPresence(),
    replace: () => scene.replaceFirstPresence()
  });
}
updateNpcUi();
actionAttemptPanel?.update(scene.recentActionAttempts());

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: gameRoot,
  width: 960,
  height: 640,
  backgroundColor: "#151b20",
  scene: [scene],
  render: {
    antialias: true,
    pixelArt: false
  },
  scale: {
    mode: livingMode || mobileOwnerMode ? Phaser.Scale.RESIZE : Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 640
  }
});

new MobileOwnerControls(gameRoot, playerControls, {
  zoomByScale: (scale) => scene.zoomByScale(scale),
  interactAtClientPoint: (clientX, clientY) => scene.queueTouchInteractionAtClientPoint(clientX, clientY)
});

if (livingMode) {
  const resize = new ResizeObserver(() => { if (game.scale) game.scale.refresh(); });
  resize.observe(gameRoot);
  game.events.once("destroy", () => resize.disconnect());
  gameRoot.addEventListener("pointerdown", () => {
    livingPanel?.closeComposer();
  }, { capture: true, signal: uiListeners.signal });
  for (const [key, label] of [["interact", "Podnieś"], ["drop", "Odłóż"]]) {
    const button = gameRoot.querySelector<HTMLButtonElement>(`[data-mobile-control="${key}"]`);
    if (button) { button.setAttribute("aria-label", label); button.querySelector("strong")!.textContent = label; }
  }
}

game.events.once("destroy", () => {
  livingPanel?.destroy();
  researchPanel?.destroy();
  uiListeners.abort();
});
if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
