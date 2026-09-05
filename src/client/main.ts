import * as Phaser from "phaser";
import "./style.css";
import { WorldScene, type WorldDebugState } from "./world-scene";

const debugRoot = document.querySelector<HTMLElement>("#debug");
const gameRoot = document.querySelector<HTMLElement>("#game");

if (!debugRoot || !gameRoot) {
  throw new Error("P1 shell is missing #game or #debug root.");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDebug(state: WorldDebugState): void {
  const losClass = state.npcLineOfSight ? "pass" : "blocked";
  const events = state.events.length
    ? state.events
        .map(
          (event) => `
            <li>
              <div>${escapeHtml(event.message)}</div>
              <div class="event-meta">#${event.seq} · tick ${event.tick} · ${escapeHtml(event.type)}</div>
            </li>`
        )
        .join("")
    : "<li>No semantic events yet.</li>";

  debugRoot.innerHTML = `
    <h2>World Inspector</h2>
    <p>P1 exposes domain truth directly. The LLM is not running.</p>

    <h3>Player</h3>
    <dl class="debug-grid">
      <dt>tick</dt><dd>${state.tick}</dd>
      <dt>position</dt><dd>${state.playerPosition.x.toFixed(1)}, ${state.playerPosition.y.toFixed(1)}</dd>
      <dt>location</dt><dd>${escapeHtml(state.location)}</dd>
      <dt>held item</dt><dd>${escapeHtml(state.heldItem)}</dd>
    </dl>

    <h3>NPC-001 observation seam</h3>
    <dl class="debug-grid">
      <dt>line of sight</dt><dd class="${losClass}">${state.npcLineOfSight ? "VISIBLE" : "OCCLUDED"}</dd>
      <dt>distance</dt><dd>${state.npcDistance.toFixed(1)} px</dd>
      <dt>cognition</dt><dd>disabled</dd>
      <dt>entities</dt><dd>${state.entityCount}</dd>
    </dl>

    <h3>Recent world events</h3>
    <ul class="event-list">${events}</ul>
  `;
}

const scene = new WorldScene(renderDebug);

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
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 640
  }
});
