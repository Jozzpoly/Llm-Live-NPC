import * as Phaser from "phaser";

const wallNow = (): number => performance.timeOrigin + performance.now();
const GEOMETRY_TOLERANCE_PX = 1.25;
const RELEVANT_TRANSITIONS = new Set(["grid-template-columns", "gap"]);

const colorForGeneration = (generation: number): readonly [number, number, number] => [
  32 + (generation * 53) % 192,
  32 + (generation * 97) % 192,
  32 + (generation * 149) % 192,
];

const closeEnough = (left: number, right: number): boolean => Math.abs(left - right) <= GEOMETRY_TOLERANCE_PX;

function parseTimeMs(value: string): number {
  const text = value.trim();
  if (text.endsWith("ms")) return Number.parseFloat(text);
  if (text.endsWith("s")) return Number.parseFloat(text) * 1000;
  return Number.parseFloat(text) || 0;
}

function listValue<T>(values: readonly T[], index: number): T {
  return values[index % values.length]!;
}

function expectedLayoutTransitions(app: HTMLElement): string[] {
  const style = getComputedStyle(app);
  const properties = style.transitionProperty.split(",").map((value) => value.trim());
  const durations = style.transitionDuration.split(",").map(parseTimeMs);
  const delays = style.transitionDelay.split(",").map(parseTimeMs);
  const expected = new Set<string>();

  for (let index = 0; index < properties.length; index += 1) {
    const property = properties[index]!;
    const activeMs = listValue(durations, index) + listValue(delays, index);
    if (activeMs <= 0) continue;
    if (property === "all") {
      for (const relevant of RELEVANT_TRANSITIONS) expected.add(relevant);
    } else if (RELEVANT_TRANSITIONS.has(property)) {
      expected.add(property);
    }
  }
  return [...expected].sort();
}

type GeometrySnapshot = {
  converged: boolean;
  parentRect: { width: number; height: number };
  scaleParentSize: { width: number; height: number };
  gameSize: { width: number; height: number };
  baseSize: { width: number; height: number };
  displaySize: { width: number; height: number };
  canvasBacking: { width: number; height: number };
  canvasRect: { width: number; height: number };
};

type PostRenderSample = {
  wallMs: number;
  gameFrame: number;
  transitionComplete: boolean;
  expectedTransitions: string[];
  completedTransitions: string[];
  sceneRenderedSameFrame: boolean;
  geometry: GeometrySnapshot;
  eligible: boolean;
};

type PendingGeneration = {
  generation: number;
  targetWorldOnly: boolean;
  requestWallMs: number;
  eventIsTrusted: boolean;
  expectedTransitions: string[];
  startedTransitions: Set<string>;
  completedTransitions: Set<string>;
  transitionCompletionWallMs: number | null;
  scaleResizeCount: number;
  lastScaleResizeWallMs: number | null;
  lastSceneRenderWallMs: number | null;
  lastSceneRenderGameFrame: number | null;
  postRenderSamples: PostRenderSample[];
};

type ApplicationRenderAck = {
  generation: number;
  targetWorldOnly: boolean;
  observedWorldOnly: boolean;
  requestWallMs: number;
  transitionCompletionWallMs: number;
  expectedTransitions: string[];
  completedTransitions: string[];
  scaleResizeCount: number;
  lastScaleResizeWallMs: number | null;
  sceneRenderWallMs: number;
  gamePostRenderWallMs: number;
  gameFrame: number;
  markerRgb: readonly [number, number, number];
  geometry: GeometrySnapshot;
  postRenderSamples: PostRenderSample[];
};

let game: Phaser.Game | null = null;
let sceneRenderHooked = false;
let generation = 0;
let markerGeneration = 0;
let pending: PendingGeneration | null = null;
const requests: Array<Record<string, unknown>> = [];
const acknowledgements: ApplicationRenderAck[] = [];
const anomalies: Array<Record<string, unknown>> = [];
const transitionEvents: Array<Record<string, unknown>> = [];
const scaleResizeEvents: Array<Record<string, unknown>> = [];

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("#app missing before presentation instrumentation");

const marker = document.createElement("div");
marker.id = "spc-presentation-geometry-ack-marker";
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

function projectionIsWorldOnly(): boolean {
  return app.classList.contains("spc-world-only");
}

function geometrySnapshot(candidate: Phaser.Game): GeometrySnapshot {
  const parent = candidate.scale.parent;
  const parentRect = parent?.getBoundingClientRect();
  const canvasRect = candidate.canvas.getBoundingClientRect();
  const parentWidth = parentRect?.width ?? Number.NaN;
  const parentHeight = parentRect?.height ?? Number.NaN;
  const scaleParentWidth = candidate.scale.parentSize.width;
  const scaleParentHeight = candidate.scale.parentSize.height;
  const gameWidth = candidate.scale.gameSize.width;
  const gameHeight = candidate.scale.gameSize.height;
  const baseWidth = candidate.scale.baseSize.width;
  const baseHeight = candidate.scale.baseSize.height;
  const displayWidth = candidate.scale.displaySize.width;
  const displayHeight = candidate.scale.displaySize.height;

  const converged = [
    [parentWidth, scaleParentWidth], [parentHeight, scaleParentHeight],
    [parentWidth, gameWidth], [parentHeight, gameHeight],
    [parentWidth, baseWidth], [parentHeight, baseHeight],
    [parentWidth, displayWidth], [parentHeight, displayHeight],
    [parentWidth, candidate.canvas.width], [parentHeight, candidate.canvas.height],
    [parentWidth, canvasRect.width], [parentHeight, canvasRect.height],
  ].every(([left, right]) => Number.isFinite(left) && Number.isFinite(right) && closeEnough(left, right));

  return {
    converged,
    parentRect: { width: parentWidth, height: parentHeight },
    scaleParentSize: { width: scaleParentWidth, height: scaleParentHeight },
    gameSize: { width: gameWidth, height: gameHeight },
    baseSize: { width: baseWidth, height: baseHeight },
    displaySize: { width: displayWidth, height: displayHeight },
    canvasBacking: { width: candidate.canvas.width, height: candidate.canvas.height },
    canvasRect: { width: canvasRect.width, height: canvasRect.height },
  };
}

function transitionComplete(current: PendingGeneration): boolean {
  return current.expectedTransitions.every((property) => current.completedTransitions.has(property));
}

function publicPending(current: PendingGeneration | null): Record<string, unknown> | null {
  if (!current) return null;
  return {
    generation: current.generation,
    targetWorldOnly: current.targetWorldOnly,
    requestWallMs: current.requestWallMs,
    eventIsTrusted: current.eventIsTrusted,
    expectedTransitions: [...current.expectedTransitions],
    startedTransitions: [...current.startedTransitions].sort(),
    completedTransitions: [...current.completedTransitions].sort(),
    transitionComplete: transitionComplete(current),
    transitionCompletionWallMs: current.transitionCompletionWallMs,
    scaleResizeCount: current.scaleResizeCount,
    lastScaleResizeWallMs: current.lastScaleResizeWallMs,
    lastSceneRenderWallMs: current.lastSceneRenderWallMs,
    lastSceneRenderGameFrame: current.lastSceneRenderGameFrame,
    postRenderSamples: current.postRenderSamples.map((sample) => structuredClone(sample)),
  };
}

for (const type of ["transitionrun", "transitionstart", "transitionend", "transitioncancel"] as const) {
  app.addEventListener(type, (event: TransitionEvent) => {
    if (event.target !== app || !RELEVANT_TRANSITIONS.has(event.propertyName)) return;
    const now = wallNow();
    transitionEvents.push({ type, propertyName: event.propertyName, elapsedTime: event.elapsedTime, wallMs: now, generation: pending?.generation ?? null });
    if (!pending || !pending.expectedTransitions.includes(event.propertyName)) return;
    if (type === "transitionrun" || type === "transitionstart") pending.startedTransitions.add(event.propertyName);
    if (type === "transitionend" || type === "transitioncancel") {
      pending.completedTransitions.add(event.propertyName);
      if (transitionComplete(pending)) pending.transitionCompletionWallMs = now;
    }
  });
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
    if (!pending) return;
    pending.lastSceneRenderWallMs = wallNow();
    pending.lastSceneRenderGameFrame = candidate.getFrame();
  });
  sceneRenderHooked = true;
}

function captureGame(candidate: Phaser.Game): void {
  if (game === candidate) return;
  game = candidate;

  candidate.scale.on(Phaser.Scale.Events.RESIZE, () => {
    const now = wallNow();
    const geometry = geometrySnapshot(candidate);
    scaleResizeEvents.push({ wallMs: now, generation: pending?.generation ?? null, geometry });
    if (pending) {
      pending.scaleResizeCount += 1;
      pending.lastScaleResizeWallMs = now;
    }
  });

  candidate.events.on(Phaser.Core.Events.PRE_RENDER, () => hookSceneRender(candidate));
  candidate.events.on(Phaser.Core.Events.POST_RENDER, () => {
    hookSceneRender(candidate);
    const current = pending;
    if (!current) return;

    const now = wallNow();
    const observedWorldOnly = projectionIsWorldOnly();
    const geometry = geometrySnapshot(candidate);
    const didTransitionComplete = transitionComplete(current);
    const sceneRenderedSameFrame = current.lastSceneRenderGameFrame === candidate.getFrame();
    const eligible = didTransitionComplete && geometry.converged && sceneRenderedSameFrame && observedWorldOnly === current.targetWorldOnly;
    const sample: PostRenderSample = {
      wallMs: now,
      gameFrame: candidate.getFrame(),
      transitionComplete: didTransitionComplete,
      expectedTransitions: [...current.expectedTransitions],
      completedTransitions: [...current.completedTransitions].sort(),
      sceneRenderedSameFrame,
      geometry,
      eligible,
    };
    current.postRenderSamples.push(sample);
    if (current.postRenderSamples.length > 80) current.postRenderSamples.splice(0, current.postRenderSamples.length - 80);
    if (!eligible) return;

    if (current.transitionCompletionWallMs === null) current.transitionCompletionWallMs = current.requestWallMs;
    const markerRgb = colorForGeneration(current.generation);
    const ack: ApplicationRenderAck = Object.freeze({
      generation: current.generation,
      targetWorldOnly: current.targetWorldOnly,
      observedWorldOnly,
      requestWallMs: current.requestWallMs,
      transitionCompletionWallMs: current.transitionCompletionWallMs,
      expectedTransitions: [...current.expectedTransitions],
      completedTransitions: [...current.completedTransitions].sort(),
      scaleResizeCount: current.scaleResizeCount,
      lastScaleResizeWallMs: current.lastScaleResizeWallMs,
      sceneRenderWallMs: current.lastSceneRenderWallMs!,
      gamePostRenderWallMs: now,
      gameFrame: candidate.getFrame(),
      markerRgb,
      geometry,
      postRenderSamples: current.postRenderSamples.map((entry) => structuredClone(entry)),
    });
    acknowledgements.push(ack);
    markerGeneration = current.generation;
    marker.dataset.generation = String(current.generation);
    marker.style.background = `rgb(${markerRgb.join(",")})`;
    pending = null;
  });
}

const gamePrototype = Phaser.Game.prototype as unknown as { start: (this: Phaser.Game) => void };
const originalStart = gamePrototype.start;
gamePrototype.start = function patchedPresentationStart(this: Phaser.Game): void {
  captureGame(this);
  originalStart.call(this);
};

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest(".spc-world-mode-toggle") : null;
  if (!target) return;
  if (pending) anomalies.push({ kind: "superseded_pending_request", previousGeneration: pending.generation, wallMs: wallNow() });

  const expectedTransitions = expectedLayoutTransitions(app);
  const request: PendingGeneration = {
    generation: ++generation,
    targetWorldOnly: !projectionIsWorldOnly(),
    requestWallMs: wallNow(),
    eventIsTrusted: event.isTrusted,
    expectedTransitions,
    startedTransitions: new Set(),
    completedTransitions: new Set(),
    transitionCompletionWallMs: expectedTransitions.length === 0 ? wallNow() : null,
    scaleResizeCount: 0,
    lastScaleResizeWallMs: null,
    lastSceneRenderWallMs: null,
    lastSceneRenderGameFrame: null,
    postRenderSamples: [],
  };
  pending = request;
  requests.push({
    generation: request.generation,
    targetWorldOnly: request.targetWorldOnly,
    requestWallMs: request.requestWallMs,
    eventIsTrusted: request.eventIsTrusted,
    expectedTransitions: [...expectedTransitions],
  });
}, true);

const presentationWindow = window as Window & {
  __SPC_PRESENTATION_GEOMETRY_ACK__?: Readonly<{
    version: 1;
    ready(): boolean;
    state(): Record<string, unknown>;
    sleepLoop(): void;
    wakeLoop(): void;
  }>;
};

Object.defineProperty(presentationWindow, "__SPC_PRESENTATION_GEOMETRY_ACK__", {
  configurable: true,
  enumerable: false,
  value: Object.freeze({
    version: 1 as const,
    ready: () => Boolean(game && sceneRenderHooked && document.querySelector(".spc-world-mode-toggle")),
    state: () => ({
      version: 1,
      ready: Boolean(game && sceneRenderHooked && document.querySelector(".spc-world-mode-toggle")),
      gameCaptured: game !== null,
      sceneRenderHooked,
      markerGeneration,
      pending: publicPending(pending),
      currentGeometry: game ? geometrySnapshot(game) : null,
      requests: structuredClone(requests),
      acknowledgements: acknowledgements.map((entry) => structuredClone(entry)),
      anomalies: structuredClone(anomalies),
      transitionEvents: structuredClone(transitionEvents),
      scaleResizeEvents: structuredClone(scaleResizeEvents),
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
