import * as Phaser from "phaser";
import "./style.css";
import "./mobile-style.css";
import { DebugWorkspace } from "./debug-workspace";
import { E1DebugPanel } from "./e1-debug-panel";
import type { E1HarnessDebugState } from "./e1-agent-harness";
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

const mobileOwnerMode = isTouchOwnerDevice();
appRoot.classList.toggle("mobile-owner-mode", mobileOwnerMode);

let scene: WorldScene;
let e1Panel: E1DebugPanel | null = null;
const playerControls = new PlayerControlBuffer();

function updateE1Ui(state: E1HarnessDebugState): void {
  e1Panel?.update(state);
  stageChip.textContent = state.armed ? "E1 cognition armed" : "E1 cognition disarmed";
  stageChip.classList.toggle("is-active", state.armed);
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
  updateE1Ui(scene.e1AgentState());
}, playerControls);

e1Panel = new E1DebugPanel(debugRoot, {
  toggle: () => scene.toggleE1Agent()
});
updateE1Ui(scene.e1AgentState());

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
