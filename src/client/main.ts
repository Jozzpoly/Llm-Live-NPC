import * as Phaser from "phaser";
import "./style.css";
import "./mobile-style.css";
import { DebugWorkspace } from "./debug-workspace";
import { isTouchOwnerDevice, MobileOwnerControls } from "./mobile-controls";
import { PlayerControlBuffer } from "./player-control-buffer";
import { WorldScene } from "./world-scene";

const appRoot = document.querySelector<HTMLElement>("#app");
const debugRoot = document.querySelector<HTMLElement>("#debug");
const gameRoot = document.querySelector<HTMLElement>("#game");

if (!appRoot || !debugRoot || !gameRoot) {
  throw new Error("P1 shell is missing #app, #game or #debug root.");
}

const mobileOwnerMode = isTouchOwnerDevice();
appRoot.classList.toggle("mobile-owner-mode", mobileOwnerMode);

let scene: WorldScene;
const playerControls = new PlayerControlBuffer();

const workspace = new DebugWorkspace(debugRoot, appRoot, {
  toggleLabels: () => scene.toggleLabels(),
  toggleLosProbe: () => scene.toggleDebugOverlay(),
  togglePointerProbe: () => scene.togglePointerProbe()
});
if (mobileOwnerMode) workspace.setCollapsed(true);

scene = new WorldScene((state) => workspace.update(state), playerControls);

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
  zoomByScale: (scale) => scene.zoomByScale(scale)
});
