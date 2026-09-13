import * as Phaser from "phaser";
import { HearthHost } from "../hearth/host";
import { createHearthCognitionProvider } from "../hearth/transport";
import { createHearthSpecimen, HEARTH_RESIDENTS } from "../hearth/scene";
import type { ExecutorStatus } from "../execution/deterministic-executor";
import { ExecutionDriver, type ActionAttemptRecord } from "../execution/execution-driver";
import { World } from "../world/world";
import type {
  Aabb,
  EntityId,
  Vec2,
  WorldActionRequest,
  WorldActionResult,
  WorldEntity,
  WorldEvent,
  WorldSnapshot
} from "../world/types";
import { E1AgentHarness, type E1HarnessDebugState } from "./e1-agent-harness";
import {
  FirstPresenceBrowserProbe,
  createFirstPresenceBrowserProbeSpecimen,
  type FirstPresenceBrowserProbeState
} from "./first-presence-browser-probe";
import {
  interpolationAlpha,
  resolveInterpolatedEntityPositions
} from "./motion-interpolation";
import {
  startManualExecutorTask,
  type ManualExecutorStartResult
} from "./manual-executor-trigger";
import {
  PRESENTATION_DEPTH,
  resolveBlockerVisual,
  resolveEntityVisual,
  resolveLocationVisual,
  type EntityVisualDescriptor
} from "./presentation";
import { combineControlMovement, PlayerControlBuffer } from "./player-control-buffer";
import { observationStatus, type HearthResearchState, type ResidentResearchLens } from "./hearth-research-panel";
import {
  clientPointToScreen,
  resolveDirectInteractionTarget,
  resolvePointerTarget,
  type PointerTargetSample
} from "./pointer-targeting";

const FIXED_STEP_MS = 1000 / 30;
const DEBUG_STATE_INTERVAL_MS = 100;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.1;
const ITEM_LABEL_DISTANCE = 150;
const MOUSE_TARGET_RADIUS_PX = 16;
const TOUCH_TARGET_RADIUS_PX = 28;
const SPEECH_BUBBLE_LIFETIME_TICKS = 240;

interface SpeechBubbleProjection {
  id: number; tick: number; sourceId: string; text: string; position: Vec2;
}
interface SpeechBubbleView {
  view: Phaser.GameObjects.Container; width: number; height: number;
}

type MovementKeys = Record<"W" | "A" | "S" | "D" | "E" | "Q" | "V" | "L", Phaser.Input.Keyboard.Key>;

export interface WorldDebugState {
  tick: number;
  playerPosition: { x: number; y: number };
  location: string;
  heldItem: string;
  npcLineOfSight: boolean;
  npcDistance: number;
  entityCount: number;
  firstPresenceActive: boolean;
  executorStatus: ExecutorStatus;
  executorActorId: EntityId | null;
  executorTargetId: EntityId | null;
  executorStepsUsed: number;
  executorStepBudget: number;
  executorFailureCode: string | null;
  cameraZoom: number;
  debugOverlayVisible: boolean;
  labelsVisible: boolean;
  pointerProbeVisible: boolean;
  pointerInsideCanvas: boolean;
  pointerTarget: PointerTargetSample | null;
  lastActionResult: WorldActionResult | null;
  events: WorldEvent[];
}

type DebugSink = (state: WorldDebugState) => void;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class WorldScene extends Phaser.Scene {
  private readonly world: World;
  private readonly firstPresence: FirstPresenceBrowserProbe;
  private readonly npcExecutor: FirstPresenceBrowserProbe["executor"];
  private readonly executionDriver: ExecutionDriver;
  private readonly e1Agent: E1AgentHarness;
  private readonly living: HearthHost | null;
  private typing = false;
  private readonly debugSink: DebugSink;
  private readonly playerControls: PlayerControlBuffer;
  private readonly entityViews = new Map<string, Phaser.GameObjects.Container>();
  private readonly entityLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly locationLabels: Phaser.GameObjects.Text[] = [];
  private previousPresentationSnapshot: WorldSnapshot;
  private currentPresentationSnapshot: WorldSnapshot;
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private sceneryGraphics!: Phaser.GameObjects.Graphics;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private keys: MovementKeys | null = null;
  private accumulatorMs = 0;
  private debugAccumulatorMs = 0;
  private pendingInteract = false;
  private pendingDrop = false;
  private pendingDirectInteractTargetId: EntityId | null = null;
  private debugOverlayVisible = false;
  private labelsVisible = true;
  private pointerProbeVisible = false;
  private pointerInsideCanvas = false;
  private pointerTarget: PointerTargetSample | null = null;
  private researchActorId: string | null = null;
  private researchLens: ResidentResearchLens = "resident";
  private researchSnapshot: HearthResearchState | null = null;
  private readonly researchLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly speechBubbleViews = new Map<number, SpeechBubbleView>();
  private presentationBubbles: SpeechBubbleProjection[] = [];

  constructor(debugSink: DebugSink, playerControls: PlayerControlBuffer, livingMode = false) {
    super({ key: "world" });
    this.world = new World(livingMode ? createHearthSpecimen() : createFirstPresenceBrowserProbeSpecimen());
    this.firstPresence = new FirstPresenceBrowserProbe(this.world);
    this.npcExecutor = this.firstPresence.executor;
    this.executionDriver = new ExecutionDriver(this.world, this.npcExecutor);
    this.e1Agent = new E1AgentHarness(this.world, this.npcExecutor);
    this.previousPresentationSnapshot = this.world.snapshot();
    this.currentPresentationSnapshot = this.previousPresentationSnapshot;
    this.debugSink = debugSink;
    this.playerControls = playerControls;
    this.living = livingMode ? new HearthHost(this.world, createHearthCognitionProvider(), HEARTH_RESIDENTS) : null;
  }

  create(): void {
    this.events.once("shutdown", () => {
      this.living?.dispose();
      this.speechBubbleViews.clear();
      this.researchLabels.clear();
      this.presentationBubbles = [];
      this.researchSnapshot = null;
    });
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys("W,A,S,D,E,Q,V,L") as MovementKeys;
    }

    this.groundGraphics = this.add.graphics().setDepth(PRESENTATION_DEPTH.ground);
    this.sceneryGraphics = this.add.graphics().setDepth(PRESENTATION_DEPTH.scenery);
    this.debugGraphics = this.add.graphics().setDepth(PRESENTATION_DEPTH.debug);
    this.drawStaticWorld();
    this.createEntityViews();

    const playerView = this.entityViews.get("player.jozz");
    if (!playerView) throw new Error("Missing player render view.");

    this.cameras.main.setBounds(0, 0, this.world.width, this.world.height);
    this.cameras.main.startFollow(playerView, true, 0.14, 0.14);
    this.cameras.main.setZoom(1.05);

    const canvas = this.game.canvas;
    const handleCanvasPointerUp = (event: PointerEvent) => {
      if (this.living && document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (event.pointerType === "touch" || event.button !== 0) return;
      this.queueDirectInteractionAtClientPoint(event.clientX, event.clientY, MOUSE_TARGET_RADIUS_PX);
    };
    canvas.addEventListener("pointerup", handleCanvasPointerUp);
    this.events.once("shutdown", () => canvas.removeEventListener("pointerup", handleCanvasPointerUp));

    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _currentlyOver: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number
      ) => {
        const direction = deltaY < 0 ? 1 : -1;
        this.setCameraZoom(this.cameras.main.zoom + direction * ZOOM_STEP);
      }
    );

    const markPointerInside = () => {
      this.pointerInsideCanvas = true;
    };
    this.input.on("pointermove", markPointerInside);
    this.input.on("pointerdown", markPointerInside);
    this.input.on("gameover", markPointerInside);
    this.input.on("gameout", () => {
      this.pointerInsideCanvas = false;
      this.pointerTarget = null;
    });

    this.syncPresentation(true, 1);
  }

  update(time: number, delta: number): void {
    const boundedDelta = Math.min(delta, 100);
    this.accumulatorMs += boundedDelta;
    this.debugAccumulatorMs += boundedDelta;

    if (this.keys && !this.typing) {
      this.pendingInteract = this.pendingInteract || Phaser.Input.Keyboard.JustDown(this.keys.E);
      this.pendingDrop = this.pendingDrop || Phaser.Input.Keyboard.JustDown(this.keys.Q);
      if (Phaser.Input.Keyboard.JustDown(this.keys.V)) this.toggleDebugOverlay();
      if (Phaser.Input.Keyboard.JustDown(this.keys.L)) this.toggleLabels();
    }

    const externalActions = this.playerControls.consumeActions();
    this.pendingInteract = this.pendingInteract || externalActions.interactPressed;
    this.pendingDrop = this.pendingDrop || externalActions.dropPressed;

    while (this.accumulatorMs >= FIXED_STEP_MS) {
      const keyboardMove = {
        x:
          (this.keys?.D.isDown || this.cursors?.right.isDown ? 1 : 0) -
          (this.keys?.A.isDown || this.cursors?.left.isDown ? 1 : 0),
        y:
          (this.keys?.S.isDown || this.cursors?.down.isDown ? 1 : 0) -
          (this.keys?.W.isDown || this.cursors?.up.isDown ? 1 : 0)
      };
      const movement = this.typing ? { x: 0, y: 0 } : combineControlMovement(keyboardMove, this.playerControls.movement());
      const playerActions: WorldActionRequest[] = [];
      if (this.pendingDrop) {
        playerActions.push({ action: "drop", actorId: "player.jozz" });
      }
      if (this.pendingDirectInteractTargetId) {
        playerActions.push({
          action: "interact",
          actorId: "player.jozz",
          targetId: this.pendingDirectInteractTargetId
        });
      } else if (this.pendingInteract) {
        playerActions.push({ action: "interact", actorId: "player.jozz" });
      }

      this.previousPresentationSnapshot = this.currentPresentationSnapshot;
      if (this.living) {
        this.living.step({ moveX: movement.x, moveY: movement.y }, playerActions);
      } else {
        const frameResult = this.executionDriver.step({
          playerControl: { moveX: movement.x, moveY: movement.y }, playerActions
        });
        if (this.firstPresence.isActive()) this.firstPresence.afterExecutionFrame(frameResult);
        else void this.e1Agent.afterExecutionStep(frameResult, time);
      }

      this.currentPresentationSnapshot = this.world.snapshot();
      this.pendingInteract = false;
      this.pendingDrop = false;
      this.pendingDirectInteractTargetId = null;
      this.accumulatorMs -= FIXED_STEP_MS;
    }

    this.updatePointerTarget();

    // The host supplies only legitimately heard speech with a currently visible anchor.
    // No renderer lookup of a speaker's hidden World position is needed for bubbles.
    if (this.living) this.presentationBubbles = this.living.state().bubbles;

    const emitDebugState = this.debugAccumulatorMs >= DEBUG_STATE_INTERVAL_MS;
    this.syncPresentation(emitDebugState, interpolationAlpha(this.accumulatorMs, FIXED_STEP_MS));
    if (emitDebugState) this.debugAccumulatorMs %= DEBUG_STATE_INTERVAL_MS;
  }

  toggleDebugOverlay(): void {
    if (this.living) return; // First Hearth research uses its explicit panel, never the legacy V probe.
    this.debugOverlayVisible = !this.debugOverlayVisible;
  }

  residentState(): ReturnType<HearthHost["state"]> | null { return this.living?.state() ?? null; }
  residentResearchState(): HearthResearchState | null {
    const state = this.living?.researchState() ?? null;
    if (this.researchActorId) this.researchSnapshot = state;
    return state;
  }
  setResidentResearchView(actorId: string | null, lens: ResidentResearchLens): void {
    this.researchActorId = actorId;
    this.researchLens = lens;
    this.researchSnapshot = actorId ? this.living?.researchState() ?? null : null;
    if (!actorId) for (const label of this.researchLabels.values()) label.setVisible(false);
    const follow = this.entityViews.get(actorId && lens === "resident" ? actorId : "player.jozz");
    if (follow && this.cameras?.main) this.cameras.main.startFollow(follow, true, 0.14, 0.14);
    if (this.sys.isActive()) this.scale.refresh();
  }
  speakToResident(text: string, mode: "quiet" | "normal" | "call" = "normal"): Promise<void> { return this.living?.speak(text, mode) ?? Promise.resolve(); }
  selectResident(actorId: string): void { this.living?.select(actorId); }
  retryResident(): Promise<void> { return this.living?.retry() ?? Promise.resolve(); }
  stopResident(): void { this.living?.stop(); }
  callResident(): void { this.living?.call(); }
  setTyping(typing: boolean): void {
    this.typing = typing;
    this.playerControls.clearMovement();
    this.playerControls.consumeActions();
    this.pendingInteract = this.pendingDrop = false;
    this.pendingDirectInteractTargetId = null;
    if (this.input?.keyboard) {
      this.input.keyboard.resetKeys();
      this.input.keyboard.enabled = !typing;
    }
  }

  toggleLabels(): void {
    this.labelsVisible = !this.labelsVisible;
  }

  togglePointerProbe(): void {
    this.pointerProbeVisible = !this.pointerProbeVisible;
  }

  toggleE1Agent(): E1HarnessDebugState {
    if (this.living || this.firstPresence.isActive()) this.e1Agent.disarm();
    else this.e1Agent.toggle();
    this.emitDebugState(this.currentPresentationSnapshot);
    return this.e1Agent.state();
  }

  e1AgentState(): E1HarnessDebugState {
    return this.e1Agent.state();
  }

  recentActionAttempts(): ActionAttemptRecord[] {
    return this.executionDriver.recentActionAttempts();
  }

  firstPresenceState(): FirstPresenceBrowserProbeState {
    return this.firstPresence.state();
  }

  startFirstPresence(): FirstPresenceBrowserProbeState {
    if (this.living) return this.firstPresence.state();
    this.firstPresence.start();
    // Disarm only after ownership changes. A refused start must not interrupt E1.
    // Disarming also invalidates any E1 response already in flight.
    if (this.firstPresence.isActive()) this.e1Agent.disarm();
    this.emitDebugState(this.currentPresentationSnapshot);
    return this.firstPresence.state();
  }

  retryFirstPresence(): FirstPresenceBrowserProbeState {
    this.firstPresence.retry();
    this.emitDebugState(this.currentPresentationSnapshot);
    return this.firstPresence.state();
  }

  resumeFirstPresence(): FirstPresenceBrowserProbeState {
    this.firstPresence.resume();
    this.emitDebugState(this.currentPresentationSnapshot);
    return this.firstPresence.state();
  }

  replaceFirstPresence(): FirstPresenceBrowserProbeState {
    this.firstPresence.replace();
    this.emitDebugState(this.currentPresentationSnapshot);
    return this.firstPresence.state();
  }

  startNpcFetchLanternTask(): ManualExecutorStartResult {
    if (this.living || this.firstPresence.isActive()) {
      return { started: false, state: this.npcExecutor.state() };
    }
    const result = startManualExecutorTask(
      this.npcExecutor,
      {
        kind: "approach-and-interact",
        actorId: "npc.001",
        targetId: "item.lantern"
      },
      () => this.e1Agent.disarm()
    );
    this.emitDebugState(this.currentPresentationSnapshot);
    return result;
  }

  zoomByScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.setCameraZoom(this.cameras.main.zoom * scale);
  }

  queueTouchInteractionAtClientPoint(clientX: number, clientY: number): void {
    this.queueDirectInteractionAtClientPoint(clientX, clientY, TOUCH_TARGET_RADIUS_PX);
  }

  private setCameraZoom(zoom: number): void {
    this.cameras.main.setZoom(Number(clamp(zoom, MIN_ZOOM, MAX_ZOOM).toFixed(3)));
  }

  private queueDirectInteractionAtClientPoint(
    clientX: number,
    clientY: number,
    minimumScreenRadiusPx: number
  ): void {
    const canvas = this.game.canvas;
    const screen = clientPointToScreen(
      { x: clientX, y: clientY },
      canvas.getBoundingClientRect(),
      { width: canvas.width, height: canvas.height }
    );
    if (!screen) return;

    const pointerTarget = resolvePointerTarget(
      (screenX, screenY) => this.cameras.main.getWorldPoint(screenX, screenY),
      screen,
      { width: this.world.width, height: this.world.height }
    );
    if (!pointerTarget.insideWorld) return;

    const renderedPositions = resolveInterpolatedEntityPositions(
      this.previousPresentationSnapshot,
      this.currentPresentationSnapshot,
      interpolationAlpha(this.accumulatorMs, FIXED_STEP_MS)
    );
    const targetId = resolveDirectInteractionTarget(
      this.currentPresentationSnapshot.entities,
      renderedPositions,
      pointerTarget.world,
      this.cameras.main.zoom,
      minimumScreenRadiusPx
    );
    if (targetId) this.pendingDirectInteractTargetId = targetId;
  }

  private updatePointerTarget(): void {
    if (!this.pointerInsideCanvas) {
      this.pointerTarget = null;
      return;
    }

    const pointer = this.input.activePointer;
    this.pointerTarget = resolvePointerTarget(
      (screenX, screenY) => this.cameras.main.getWorldPoint(screenX, screenY),
      { x: pointer.x, y: pointer.y },
      { width: this.world.width, height: this.world.height }
    );
  }

  private drawStaticWorld(): void {
    const snapshot = this.world.snapshot();

    this.groundGraphics.fillStyle(0x1f2d24, 1);
    this.groundGraphics.fillRect(0, 0, snapshot.width, snapshot.height);

    for (const location of snapshot.locations) {
      const visual = resolveLocationVisual(location.id);
      this.groundGraphics.fillStyle(visual.fillColor, visual.fillAlpha);
      this.groundGraphics.fillRect(location.bounds.x, location.bounds.y, location.bounds.width, location.bounds.height);
      this.groundGraphics.lineStyle(1, visual.strokeColor, visual.strokeAlpha);
      this.groundGraphics.strokeRect(location.bounds.x, location.bounds.y, location.bounds.width, location.bounds.height);

      if (visual.treatment === "yard") this.drawCommonYardDressing(location.bounds);

      const label = this.add
        .text(location.bounds.x + 10, location.bounds.y + 8, location.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "13px",
          color: "#d7e0e7",
          backgroundColor: "#0d12168f",
          padding: { x: 6, y: 3 }
        })
        .setDepth(PRESENTATION_DEPTH.scenery);
      this.locationLabels.push(label);
    }

    for (const blocker of snapshot.blockers) {
      const visual = resolveBlockerVisual(blocker);
      if (visual.glyph === "table") {
        this.drawTable(blocker.bounds, visual.fillColor, visual.secondaryColor, visual.strokeColor);
        continue;
      }

      this.sceneryGraphics.fillStyle(visual.fillColor, visual.fillAlpha);
      this.sceneryGraphics.fillRect(blocker.bounds.x, blocker.bounds.y, blocker.bounds.width, blocker.bounds.height);
      this.sceneryGraphics.lineStyle(1, visual.strokeColor, visual.strokeAlpha);
      this.sceneryGraphics.strokeRect(blocker.bounds.x, blocker.bounds.y, blocker.bounds.width, blocker.bounds.height);
    }

    this.groundGraphics.lineStyle(4, 0x6a7884, 0.35);
    this.groundGraphics.strokeRect(0, 0, snapshot.width, snapshot.height);
  }

  private drawCommonYardDressing(bounds: Aabb): void {
    const pathWidth = 74;
    const pathX = bounds.x + bounds.width * 0.47;
    this.groundGraphics.fillStyle(0x9b8257, 0.12);
    this.groundGraphics.fillRect(pathX, bounds.y, pathWidth, bounds.height);

    const tufts: Array<[number, number]> = [
      [0.08, 0.16],
      [0.18, 0.72],
      [0.29, 0.31],
      [0.38, 0.82],
      [0.61, 0.18],
      [0.72, 0.67],
      [0.84, 0.28],
      [0.9, 0.82]
    ];

    this.groundGraphics.lineStyle(1, 0x8eb382, 0.32);
    for (const [u, v] of tufts) {
      const x = bounds.x + bounds.width * u;
      const y = bounds.y + bounds.height * v;
      this.groundGraphics.lineBetween(x - 4, y + 3, x, y - 4);
      this.groundGraphics.lineBetween(x, y + 3, x + 4, y - 2);
      this.groundGraphics.lineBetween(x, y + 3, x, y - 5);
    }

    const stones: Array<[number, number]> = [
      [0.12, 0.46],
      [0.53, 0.58],
      [0.78, 0.45]
    ];
    this.groundGraphics.fillStyle(0x9ca38d, 0.16);
    for (const [u, v] of stones) {
      this.groundGraphics.fillCircle(bounds.x + bounds.width * u, bounds.y + bounds.height * v, 3);
    }
  }

  private drawTable(bounds: Aabb, topColor: number, plankColor: number, strokeColor: number): void {
    this.sceneryGraphics.fillStyle(0x000000, 0.22);
    this.sceneryGraphics.fillRect(bounds.x + 5, bounds.y + 7, bounds.width, bounds.height);

    this.sceneryGraphics.fillStyle(0x4d321f, 1);
    this.sceneryGraphics.fillRect(bounds.x + 9, bounds.y + bounds.height - 3, 10, 13);
    this.sceneryGraphics.fillRect(bounds.x + bounds.width - 19, bounds.y + bounds.height - 3, 10, 13);

    this.sceneryGraphics.fillStyle(topColor, 1);
    this.sceneryGraphics.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.sceneryGraphics.fillStyle(plankColor, 0.52);
    this.sceneryGraphics.fillRect(bounds.x + 5, bounds.y + 5, bounds.width - 10, 8);
    this.sceneryGraphics.fillRect(bounds.x + 5, bounds.y + 18, bounds.width - 10, 7);
    this.sceneryGraphics.lineStyle(2, strokeColor, 0.75);
    this.sceneryGraphics.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  private createEntityViews(): void {
    for (const entity of this.world.snapshot().entities) {
      const visual = resolveEntityVisual(entity);
      const view = this.createEntityGlyph(entity, visual);
      this.entityViews.set(entity.id, view);

      const label = this.add
        .text(entity.position.x, entity.position.y - entity.radius - 18, this.living && entity.id === "npc.001" ? "Mira" : entity.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: visual.labelFontSize,
          color: "#f0f4f7",
          backgroundColor: "#0b0e1299",
          padding: { x: 4, y: 2 }
        })
        .setOrigin(0.5, 1)
        .setDepth(PRESENTATION_DEPTH.overhead);
      this.entityLabels.set(entity.id, label);
    }
  }

  private createEntityGlyph(entity: WorldEntity, visual: EntityVisualDescriptor): Phaser.GameObjects.Container {
    const container = this.add.container(entity.position.x, entity.position.y).setDepth(visual.depth);
    const shadow = this.add
      .ellipse(0, entity.radius * 0.6, entity.radius * 1.8, entity.radius * 0.72, 0x000000, visual.shadowAlpha)
      .setOrigin(0.5);
    const glyph = this.add.graphics();

    glyph.lineStyle(2, visual.strokeColor, visual.strokeAlpha);

    if (visual.glyph === "player" || visual.glyph === "npc") {
      glyph.fillStyle(visual.fillColor, 1);
      glyph.fillCircle(0, 0, entity.radius);
      glyph.strokeCircle(0, 0, entity.radius);
      glyph.fillStyle(visual.secondaryColor, 0.92);
      glyph.fillCircle(-entity.radius * 0.28, -entity.radius * 0.3, Math.max(3, entity.radius * 0.22));
      glyph.lineStyle(2, visual.secondaryColor, 0.62);
      glyph.lineBetween(-entity.radius * 0.45, entity.radius * 0.45, entity.radius * 0.45, entity.radius * 0.45);
    } else if (visual.glyph === "mug") {
      glyph.fillStyle(visual.fillColor, 1);
      glyph.fillRect(-6, -7, 11, 14);
      glyph.strokeRect(-6, -7, 11, 14);
      glyph.lineStyle(2, visual.secondaryColor, 0.95);
      glyph.strokeCircle(6, 0, 4);
    } else if (visual.glyph === "hammer") {
      glyph.lineStyle(4, visual.secondaryColor, 1);
      glyph.lineBetween(-4, 7, 4, -5);
      glyph.fillStyle(visual.fillColor, 1);
      glyph.fillRect(-5, -9, 12, 6);
      glyph.lineStyle(2, visual.strokeColor, visual.strokeAlpha);
      glyph.strokeRect(-5, -9, 12, 6);
    } else if (visual.glyph === "lantern") {
      glyph.fillStyle(visual.secondaryColor, 0.16);
      glyph.fillCircle(0, 0, 13);
      glyph.fillStyle(visual.fillColor, 1);
      glyph.fillRect(-6, -6, 12, 13);
      glyph.lineStyle(2, visual.strokeColor, visual.strokeAlpha);
      glyph.strokeRect(-6, -6, 12, 13);
      glyph.lineStyle(2, visual.secondaryColor, 0.9);
      glyph.lineBetween(-5, -7, -2, -11);
      glyph.lineBetween(-2, -11, 2, -11);
      glyph.lineBetween(2, -11, 5, -7);
    } else {
      glyph.fillStyle(visual.fillColor, 1);
      glyph.fillCircle(0, 0, entity.radius * 0.72);
      glyph.strokeCircle(0, 0, entity.radius * 0.72);
      glyph.fillStyle(visual.secondaryColor, 0.72);
      glyph.fillCircle(-2, -2, Math.max(2, entity.radius * 0.2));
    }

    container.add([shadow, glyph]);
    if (this.living && (entity.kind === "npc" || entity.kind === "player")) {
      const attention = this.add.graphics().setName("attention");
      attention.fillStyle(entity.kind === "npc" ? 0xf4d69d : 0xb0e3fa, 0.95);
      attention.fillTriangle(entity.radius + 10, 0, entity.radius + 2, -4, entity.radius + 2, 4);
      container.add(attention);
    }
    return container;
  }

  private syncPresentation(emitDebugState = false, alpha = 1): void {
    const snapshot = this.currentPresentationSnapshot;
    const renderedPositions = resolveInterpolatedEntityPositions(
      this.previousPresentationSnapshot,
      this.currentPresentationSnapshot,
      alpha
    );
    const player = snapshot.entities.find((entity) => entity.kind === "player");
    const playerRenderedPosition = player ? renderedPositions.get(player.id) : undefined;
    const researchResident = this.researchSnapshot?.residents.find(resident => resident.id === this.researchActorId);
    const lensVisibleIds = researchResident && this.researchLens === "resident"
      ? new Set(researchResident.perception.visibleIds) : null;

    for (const entity of snapshot.entities) {
      const renderedPosition = renderedPositions.get(entity.id) ?? entity.position;
      const view = this.entityViews.get(entity.id);
      if (view) {
        view.setPosition(renderedPosition.x, renderedPosition.y);
        view.setVisible(!lensVisibleIds || lensVisibleIds.has(entity.id));
      }
      if (view && (entity.kind === "npc" || entity.kind === "player")) {
        const attention = view.getByName("attention") as Phaser.GameObjects.Graphics | null;
        attention?.setRotation(Math.atan2(entity.facing.y, entity.facing.x));
      }

      const label = this.entityLabels.get(entity.id);
      if (!label) continue;
      label.setPosition(renderedPosition.x, renderedPosition.y - entity.radius - 18);

      let visible = this.labelsVisible && (!lensVisibleIds || lensVisibleIds.has(entity.id));
      if (visible && entity.kind === "item" && player && playerRenderedPosition) {
        const distance = Math.hypot(
          renderedPosition.x - playerRenderedPosition.x,
          renderedPosition.y - playerRenderedPosition.y
        );
        visible = entity.heldBy !== null || distance <= ITEM_LABEL_DISTANCE;
      }
      label.setVisible(visible);
    }

    for (const label of this.locationLabels) label.setVisible(this.labelsVisible);

    this.drawDebug(snapshot, renderedPositions);
    this.drawSpeechBubbles(this.presentationBubbles, snapshot.tick);
    if (emitDebugState) this.emitDebugState(snapshot);
  }

  private createSpeechBubble(text: string, player: boolean): SpeechBubbleView {
    const words = this.add.text(0, 0, text.replace(/\s+/gu, " ").trim(), {
      fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#23332b",
      lineSpacing: 2, wordWrap: { width: 214, useAdvancedWrap: true }
    }).setOrigin(0.5, 1);
    const lines = words.getWrappedText();
    if (lines.length > 4) words.setText([...lines.slice(0, 3), lines[3].slice(0, -2).trimEnd() + "…"].join("\n"));
    const width = words.width + 22, height = words.height + 16;
    words.setPosition(0, -8);
    const background = this.add.graphics();
    background.fillStyle(player ? 0xdcebdd : 0xf2eddf, 0.98);
    background.lineStyle(1, player ? 0x759681 : 0xa69a80, 1);
    background.fillRoundedRect(-width / 2, -height, width, height, 10);
    background.strokeRoundedRect(-width / 2, -height, width, height, 10);
    background.fillTriangle(-6, 0, 6, 0, 0, 7);
    const view = this.add.container(0, 0, [background, words]).setDepth(PRESENTATION_DEPTH.effects + 2);
    return { view, width, height };
  }

  private drawSpeechBubbles(bubbles: readonly SpeechBubbleProjection[], tick: number): void {
    const newest = new Map<string, SpeechBubbleProjection>();
    for (const bubble of bubbles) {
      const age = tick - bubble.tick;
      if (age < 0 || age > SPEECH_BUBBLE_LIFETIME_TICKS || !bubble.text.trim()) continue;
      if (!newest.has(bubble.sourceId) || newest.get(bubble.sourceId)!.id < bubble.id) newest.set(bubble.sourceId, bubble);
    }
    const active = [...newest.values()].sort((a, b) => b.id - a.id).slice(0, 3);
    const ids = new Set(active.map(b => b.id));
    for (const [id, bubble] of this.speechBubbleViews) {
      if (!ids.has(id)) { bubble.view.destroy(true); this.speechBubbleViews.delete(id); }
    }
    const zoom = this.cameras.main.zoom;
    const camera = this.cameras.main.worldView;
    const boxes: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (const bubble of active) {
      let display = this.speechBubbleViews.get(bubble.id);
      if (!display) {
        display = this.createSpeechBubble(bubble.text, bubble.sourceId === "player.jozz");
        this.speechBubbleViews.set(bubble.id, display);
      }
      const halfWidth = display.width / (zoom * 2), height = display.height / zoom;
      const x = clamp(bubble.position.x, camera.left + halfWidth + 6 / zoom, camera.right - halfWidth - 6 / zoom);
      let y = bubble.position.y - 46 / zoom;
      for (const previous of boxes) {
        if (x - halfWidth < previous.right && x + halfWidth > previous.left && y > previous.top && y - height < previous.bottom) y = previous.top - 10 / zoom;
      }
      y = Math.max(camera.top + height + 6 / zoom, y);
      boxes.push({ left: x - halfWidth, right: x + halfWidth, top: y - height, bottom: y });
      display.view.setPosition(x, y).setScale(1 / zoom)
        .setAlpha(clamp((SPEECH_BUBBLE_LIFETIME_TICKS - (tick - bubble.tick)) / 30, 0, 1));
      // Research may hide physical entities, but never creates extra speech beyond this public projection.
      display.view.setVisible(!this.researchActorId || this.researchLens === "world");
    }
  }

  private drawDebug(snapshot: WorldSnapshot, renderedPositions: ReadonlyMap<string, Vec2>): void {
    this.debugGraphics.clear();

    if (this.living) {
      this.drawResidentResearch(snapshot, renderedPositions);
      return;
    }

    if (this.pointerProbeVisible && this.pointerTarget) {
      const { x, y } = this.pointerTarget.world;
      const color = this.pointerTarget.insideWorld ? 0x79d8ff : 0xe67575;
      this.debugGraphics.lineStyle(2, color, 0.9);
      this.debugGraphics.lineBetween(x - 9, y, x + 9, y);
      this.debugGraphics.lineBetween(x, y - 9, x, y + 9);
      this.debugGraphics.strokeCircle(x, y, 5);
    }

    if (!this.debugOverlayVisible) return;

    const player = snapshot.entities.find((entity) => entity.kind === "player");
    const npc = snapshot.entities.find((entity) => entity.kind === "npc");
    if (!player || !npc) return;

    const visible = this.world.hasLineOfSight(npc.position, player.position);
    const playerRendered = renderedPositions.get(player.id) ?? player.position;
    const npcRendered = renderedPositions.get(npc.id) ?? npc.position;
    this.debugGraphics.lineStyle(2, visible ? 0x65d38e : 0xe6a455, 0.72);
    this.debugGraphics.lineBetween(npcRendered.x, npcRendered.y, playerRendered.x, playerRendered.y);

    this.debugGraphics.lineStyle(1, 0x9fb0be, 0.22);
    this.debugGraphics.strokeCircle(npcRendered.x, npcRendered.y, 220);
  }

  private drawResidentResearch(snapshot: WorldSnapshot, renderedPositions: ReadonlyMap<string, Vec2>): void {
    const resident = this.researchSnapshot?.residents.find(r => r.id === this.researchActorId);
    const usedLabels = new Set<string>();
    if (resident) {
      const visible = new Set(resident.perception.visibleIds);
      const actor = snapshot.entities.find(entity => entity.id === resident.id);
      const sight = resident.perception.sight;
      if (actor && actor.kind !== "item" && sight) {
        const point = renderedPositions.get(actor.id) ?? actor.position;
        const heading = Math.atan2(actor.facing.y, actor.facing.x);
        this.debugGraphics.lineStyle(1.5, 0x91cbd8, 0.6);
        this.debugGraphics.beginPath();
        this.debugGraphics.arc(point.x, point.y, sight.range, heading - sight.halfFieldRadians, heading + sight.halfFieldRadians);
        this.debugGraphics.strokePath();
        for (const angle of [heading - sight.halfFieldRadians, heading + sight.halfFieldRadians]) {
          this.debugGraphics.lineBetween(point.x, point.y, point.x + Math.cos(angle) * sight.range, point.y + Math.sin(angle) * sight.range);
        }
      }
      for (const entity of resident.context.observations) {
        const status = observationStatus(entity, visible);
        const point = status === "body" || status === "visible" ? renderedPositions.get(entity.id) ?? entity.position : entity.position;
        const color = status === "body" ? 0x91cbd8 : status === "visible" ? 0x9fe1a3 : status === "absent" ? 0xe8a287 : 0xdfc287;
        this.debugGraphics.lineStyle(2, color, 0.9);
        this.debugGraphics.strokeCircle(point.x, point.y, status === "body" ? 23 : 20);
        if (status === "visible" || status === "body") continue;
        if (status === "absent") {
          this.debugGraphics.lineBetween(point.x - 8, point.y - 8, point.x + 8, point.y + 8);
          this.debugGraphics.lineBetween(point.x - 8, point.y + 8, point.x + 8, point.y - 8);
        }
        usedLabels.add(entity.id);
        let label = this.researchLabels.get(entity.id);
        if (!label) {
          label = this.add.text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "11px", backgroundColor: "#171c20ed", padding: { x: 5, y: 3 } })
            .setOrigin(0.5, 0).setDepth(PRESENTATION_DEPTH.debug + 1);
          this.researchLabels.set(entity.id, label);
        }
        label.setPosition(point.x, point.y + 25).setColor(status === "absent" ? "#efb49d" : "#ead2a4")
          .setText(`${entity.label} · ${status === "absent" ? "nie ma tu" : "pamięć"} · t${entity.seenAtTick}`).setVisible(true);
      }
    }
    for (const [id, label] of this.researchLabels) if (!usedLabels.has(id)) label.setVisible(false);
  }

  private emitDebugState(snapshot: WorldSnapshot): void {
    const player = snapshot.entities.find((entity) => entity.kind === "player");
    const npc = snapshot.entities.find((entity) => entity.kind === "npc");
    if (!player || player.kind !== "player" || !npc) return;

    const location = snapshot.locations.find((entry) => entry.id === snapshot.playerLocationId)?.label ?? "Open ground";
    const heldItem = player.heldItemId
      ? snapshot.entities.find((entity) => entity.id === player.heldItemId)?.label ?? player.heldItemId
      : "none";
    const executorState = this.npcExecutor.state();

    this.debugSink({
      tick: snapshot.tick,
      playerPosition: { ...player.position },
      location,
      heldItem,
      npcLineOfSight: this.world.hasLineOfSight(npc.position, player.position),
      npcDistance: Math.hypot(npc.position.x - player.position.x, npc.position.y - player.position.y),
      entityCount: snapshot.entities.length,
      firstPresenceActive: this.firstPresence.isActive(),
      executorStatus: executorState.status,
      executorActorId: executorState.task?.actorId ?? null,
      executorTargetId: executorState.task?.targetId ?? null,
      executorStepsUsed: executorState.stepsUsed,
      executorStepBudget: executorState.stepBudget,
      executorFailureCode: executorState.failureCode,
      cameraZoom: this.cameras.main.zoom,
      debugOverlayVisible: this.debugOverlayVisible,
      labelsVisible: this.labelsVisible,
      pointerProbeVisible: this.pointerProbeVisible,
      pointerInsideCanvas: this.pointerInsideCanvas,
      pointerTarget: this.pointerTarget,
      lastActionResult: this.world.lastActionResult(),
      events: this.world.recentEvents(10).reverse()
    });
  }
}
