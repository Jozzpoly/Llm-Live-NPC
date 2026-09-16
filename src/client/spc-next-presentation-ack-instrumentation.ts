import * as Phaser from "phaser";

const wallNow = (): number => performance.timeOrigin + performance.now();
const colorForGeneration = (generation: number): readonly [number, number, number] => [
  32 + (generation * 53) % 192,
  32 + (generation * 97) % 192,
  32 + (generation * 149) % 192,
];

type ProjectionRequest = {
  generation: number;
  targetWorldOnly: boolean;
  requestWallMs: number;
  eventIsTrusted: boolean;
  sceneRenderWallMs: number | null;
  sceneRenderGameFrame: number | null;
};

type ApplicationRenderAck = {
  generation: number;
  targetWorldOnly: boolean;
  observedWorldOnly: boolean;
  requestWallMs: number;
  sceneRenderWallMs: number;
  gamePostRenderWallMs: number;
  gameFrame: number;
  markerRgb: readonly [number, number, number];
  canvas: {
    width: number;
    height: number;
    cssWidth: number;
    cssHeight: number;
  };
};

type PresentationAckState = {
  version: 1;
  ready: boolean;
  gameCaptured: boolean;
  sceneRenderHooked: boolean;
  markerGeneration: number;
  pending: ProjectionRequest | null;
  requests: readonly ProjectionRequest[];
  acknowledgements: readonly ApplicationRenderAck[];
  anomalies: readonly Readonly<Record<string, unknown>>[];
  loopRunning: boolean | null;
};

let game: Phaser.Game | null = null;
let sceneRenderHooked = false;
let generation = 0;
let markerGeneration = 0;
let pending: ProjectionRequest | null = null;
const requests: ProjectionRequest[] = [];
const acknowledgements: ApplicationRenderAck[] = [];
const anomalies: Array<Readonly<Record<string, unknown>>> = [];

const marker = document.createElement("div");
marker.id = "spc-presentation-ack-marker";
marker.dataset.generation = "0";
Object.assign(marker.style, {
  position: "fixed",
  left: "0px",
  top: "0px",
  width: "96px",
  height: "96px",
  zIndex: "2147483647",
  pointerEvents: "none",
  background: "rgb(16, 16, 16)",
});
document.body.append(marker);

function cloneRequest(value: ProjectionRequest | null): ProjectionRequest | null {
  return value ? { ...value } : null;
}

function projectionIsWorldOnly(): boolean {
  return document.querySelector("#app")?.classList.contains("spc-world-only") ?? false;
}

function hookSceneRender(candidate: Phaser.Game): void {
  if (sceneRenderHooked) return;
  let scene: Phaser.Scene;
  try {
    scene = candidate.scene.getScene("spc-next-research");
  } catch {
    return;
  }
  if (!scene) return;
  scene.events.on(Phaser.Scenes.Events.RENDER, () => {
    if (!pending || pending.sceneRenderWallMs !== null) return;
    pending.sceneRenderWallMs = wallNow();
    pending.sceneRenderGameFrame = candidate.getFrame();
  });
  sceneRenderHooked = true;
}

function captureGame(candidate: Phaser.Game): void {
  if (game === candidate) return;
  game = candidate;
  candidate.events.on(Phaser.Core.Events.PRE_RENDER, () => hookSceneRender(candidate));
  candidate.events.on(Phaser.Core.Events.POST_RENDER, () => {
    hookSceneRender(candidate);
    const current = pending;
    if (!current) return;

    const observedWorldOnly = projectionIsWorldOnly();
    if (current.sceneRenderWallMs === null) {
      anomalies.push(Object.freeze({
        kind: "postrender_without_scene_render",
        generation: current.generation,
        wallMs: wallNow(),
        gameFrame: candidate.getFrame(),
      }));
      return;
    }
    if (observedWorldOnly !== current.targetWorldOnly) {
      anomalies.push(Object.freeze({
        kind: "postrender_projection_mismatch",
        generation: current.generation,
        targetWorldOnly: current.targetWorldOnly,
        observedWorldOnly,
        wallMs: wallNow(),
        gameFrame: candidate.getFrame(),
      }));
      return;
    }

    const canvasRect = candidate.canvas.getBoundingClientRect();
    const markerRgb = colorForGeneration(current.generation);
    const ack: ApplicationRenderAck = Object.freeze({
      generation: current.generation,
      targetWorldOnly: current.targetWorldOnly,
      observedWorldOnly,
      requestWallMs: current.requestWallMs,
      sceneRenderWallMs: current.sceneRenderWallMs,
      gamePostRenderWallMs: wallNow(),
      gameFrame: candidate.getFrame(),
      markerRgb,
      canvas: Object.freeze({
        width: candidate.canvas.width,
        height: candidate.canvas.height,
        cssWidth: canvasRect.width,
        cssHeight: canvasRect.height,
      }),
    });
    acknowledgements.push(ack);
    markerGeneration = current.generation;
    marker.dataset.generation = String(current.generation);
    marker.style.background = `rgb(${markerRgb.join(",")})`;
    pending = null;
  });
}

const gamePrototype = Phaser.Game.prototype as unknown as {
  start: (this: Phaser.Game) => void;
};
const originalStart = gamePrototype.start;
gamePrototype.start = function patchedEvidenceStart(this: Phaser.Game): void {
  captureGame(this);
  originalStart.call(this);
};

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element
    ? event.target.closest(".spc-world-mode-toggle")
    : null;
  if (!target) return;

  if (pending) {
    anomalies.push(Object.freeze({
      kind: "superseded_pending_request",
      previousGeneration: pending.generation,
      wallMs: wallNow(),
    }));
  }

  const request: ProjectionRequest = {
    generation: ++generation,
    targetWorldOnly: !projectionIsWorldOnly(),
    requestWallMs: wallNow(),
    eventIsTrusted: event.isTrusted,
    sceneRenderWallMs: null,
    sceneRenderGameFrame: null,
  };
  pending = request;
  requests.push(request);
}, true);

const presentationWindow = window as Window & {
  __SPC_PRESENTATION_ACK__?: Readonly<{
    version: 1;
    ready(): boolean;
    state(): PresentationAckState;
    sleepLoop(): void;
    wakeLoop(): void;
  }>;
};

Object.defineProperty(presentationWindow, "__SPC_PRESENTATION_ACK__", {
  configurable: true,
  enumerable: false,
  value: Object.freeze({
    version: 1 as const,
    ready: () => Boolean(game && sceneRenderHooked && document.querySelector(".spc-world-mode-toggle")),
    state: (): PresentationAckState => ({
      version: 1,
      ready: Boolean(game && sceneRenderHooked && document.querySelector(".spc-world-mode-toggle")),
      gameCaptured: game !== null,
      sceneRenderHooked,
      markerGeneration,
      pending: cloneRequest(pending),
      requests: requests.map((entry) => ({ ...entry })),
      acknowledgements: acknowledgements.map((entry) => ({ ...entry, canvas: { ...entry.canvas } })),
      anomalies: anomalies.map((entry) => ({ ...entry })),
      loopRunning: game ? game.loop.running : null,
    }),
    sleepLoop: () => {
      if (!game) throw new Error("Phaser Game has not been captured");
      game.loop.sleep();
    },
    wakeLoop: () => {
      if (!game) throw new Error("Phaser Game has not been captured");
      game.loop.wake();
    },
  }),
});
