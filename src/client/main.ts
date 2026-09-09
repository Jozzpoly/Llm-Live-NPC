import * as Phaser from "phaser";
import "./style.css";
import "./mobile-style.css";
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

let scene: WorldScene;
let e1Panel: E1DebugPanel | null = null;
let actionAttemptPanel: ActionAttemptDebugPanel | null = null;
let firstPresencePanel: FirstPresenceDebugPanel | null = null;
const playerControls = new PlayerControlBuffer();

function updateNpcUi(): void {
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

const workspace = new DebugWorkspace(debugRoot, appRoot, {
  toggleLabels: () => scene.toggleLabels(),
  toggleLosProbe: () => scene.toggleDebugOverlay(),
  togglePointerProbe: () => scene.togglePointerProbe(),
  startNpcFetchLantern: () => scene.startNpcFetchLanternTask()
});
if (mobileOwnerMode) workspace.setCollapsed(true);

scene = new WorldScene((state) => {
  workspace.update(state);
  actionAttemptPanel?.update(scene.recentActionAttempts());
  updateNpcUi();
}, playerControls);

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
updateNpcUi();
actionAttemptPanel.update(scene.recentActionAttempts());

new Phaser.Game({
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
    mode: mobileOwnerMode ? Phaser.Scale.RESIZE : Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 640
  }
});

new MobileOwnerControls(gameRoot, playerControls, {
  zoomByScale: (scale) => scene.zoomByScale(scale),
  interactAtClientPoint: (clientX, clientY) => scene.queueTouchInteractionAtClientPoint(clientX, clientY)
});
