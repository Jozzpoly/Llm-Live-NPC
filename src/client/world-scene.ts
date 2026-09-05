import * as Phaser from "phaser";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { Aabb, Vec2, WorldEntity, WorldEvent, WorldSnapshot } from "../world/types";
import {
  interpolationAlpha,
  resolveInterpolatedEntityPositions
} from "./motion-interpolation";
import {
  PRESENTATION_DEPTH,
  resolveBlockerVisual,
  resolveEntityVisual,
  resolveLocationVisual,
  type EntityVisualDescriptor
} from "./presentation";
import { combineControlMovement, PlayerControlBuffer } from "./player-control-buffer";
import { resolvePointerTarget, type PointerTargetSample } from "./pointer-targeting";

const FIXED_STEP_MS = 1000 / 30;
const DEBUG_STATE_INTERVAL_MS = 100;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.1;
const ITEM_LABEL_DISTANCE = 150;

type MovementKeys = Record<"W" | "A" | "S" | "D" | "E" | "Q" | "V" | "L", Phaser.Input.Keyboard.Key>;

export interface WorldDebugState {
  tick: number;
  playerPosition: { x: number; y: number };
  location: string;
  heldItem: string;
  npcLineOfSight: boolean;
  npcDistance: number;
  entityCount: number;
  cameraZoom: number;
  debugOverlayVisible: boolean;
  labelsVisible: boolean;
  pointerProbeVisible: boolean;
  pointerInsideCanvas: boolean;
  pointerTarget: PointerTargetSample | null;
  events: WorldEvent[];
}

type DebugSink = (state: WorldDebugState) => void;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class WorldScene extends Phaser.Scene {
  private readonly world = new World(createP1Specimen());
  private readonly debugSink: DebugSink;
  private readonly playerControls: PlayerControlBuffer;
  private readonly entityViews = new Map<string, Phaser.GameObjects.Container>();
  private readonly entityLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly locationLabels: Phaser.GameObjects.Text[] = [];
  private previousPresentationSnapshot = this.world.snapshot();
  private currentPresentationSnapshot = this.previousPresentationSnapshot;
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private sceneryGraphics!: Phaser.GameObjects.Graphics;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private keys: MovementKeys | null = null;
  private accumulatorMs = 0;
  private debugAccumulatorMs = 0;
  private pendingInteract = false;
  private pendingDrop = false;
  private debugOverlayVisible = false;
  private labelsVisible = true;
  private pointerProbeVisible = false;
  private pointerInsideCanvas = false;
  private pointerTarget: PointerTargetSample | null = null;

  constructor(debugSink: DebugSink, playerControls: PlayerControlBuffer) {
    super({ key: "world" });
    this.debugSink = debugSink;
    this.playerControls = playerControls;
  }

  create(): void {
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

  update(_time: number, delta: number): void {
    const boundedDelta = Math.min(delta, 100);
    this.accumulatorMs += boundedDelta;
    this.debugAccumulatorMs += boundedDelta;

    if (this.keys) {
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
      const movement = combineControlMovement(keyboardMove, this.playerControls.movement());

      this.previousPresentationSnapshot = this.currentPresentationSnapshot;
      this.world.step({
        moveX: movement.x,
        moveY: movement.y,
        interactPressed: this.pendingInteract,
        dropPressed: this.pendingDrop
      });
      this.currentPresentationSnapshot = this.world.snapshot();
      this.pendingInteract = false;
      this.pendingDrop = false;
      this.accumulatorMs -= FIXED_STEP_MS;
    }

    this.updatePointerTarget();

    const emitDebugState = this.debugAccumulatorMs >= DEBUG_STATE_INTERVAL_MS;
    this.syncPresentation(emitDebugState, interpolationAlpha(this.accumulatorMs, FIXED_STEP_MS));
    if (emitDebugState) this.debugAccumulatorMs %= DEBUG_STATE_INTERVAL_MS;
  }

  toggleDebugOverlay(): void {
    this.debugOverlayVisible = !this.debugOverlayVisible;
  }

  toggleLabels(): void {
    this.labelsVisible = !this.labelsVisible;
  }

  togglePointerProbe(): void {
    this.pointerProbeVisible = !this.pointerProbeVisible;
  }

  zoomByScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.setCameraZoom(this.cameras.main.zoom * scale);
  }

  private setCameraZoom(zoom: number): void {
    this.cameras.main.setZoom(Number(clamp(zoom, MIN_ZOOM, MAX_ZOOM).toFixed(3)));
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
        .text(entity.position.x, entity.position.y - entity.radius - 18, entity.label, {
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

    for (const entity of snapshot.entities) {
      const renderedPosition = renderedPositions.get(entity.id) ?? entity.position;
      const view = this.entityViews.get(entity.id);
      if (view) view.setPosition(renderedPosition.x, renderedPosition.y);

      const label = this.entityLabels.get(entity.id);
      if (!label) continue;
      label.setPosition(renderedPosition.x, renderedPosition.y - entity.radius - 18);

      let visible = this.labelsVisible;
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
    if (emitDebugState) this.emitDebugState(snapshot);
  }

  private drawDebug(snapshot: WorldSnapshot, renderedPositions: ReadonlyMap<string, Vec2>): void {
    this.debugGraphics.clear();

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

  private emitDebugState(snapshot: WorldSnapshot): void {
    const player = snapshot.entities.find((entity) => entity.kind === "player");
    const npc = snapshot.entities.find((entity) => entity.kind === "npc");
    if (!player || player.kind !== "player" || !npc) return;

    const location = snapshot.locations.find((entry) => entry.id === snapshot.playerLocationId)?.label ?? "Open ground";
    const heldItem = player.heldItemId
      ? snapshot.entities.find((entity) => entity.id === player.heldItemId)?.label ?? player.heldItemId
      : "none";

    this.debugSink({
      tick: snapshot.tick,
      playerPosition: { ...player.position },
      location,
      heldItem,
      npcLineOfSight: this.world.hasLineOfSight(npc.position, player.position),
      npcDistance: Math.hypot(npc.position.x - player.position.x, npc.position.y - player.position.y),
      entityCount: snapshot.entities.length,
      cameraZoom: this.cameras.main.zoom,
      debugOverlayVisible: this.debugOverlayVisible,
      labelsVisible: this.labelsVisible,
      pointerProbeVisible: this.pointerProbeVisible,
      pointerInsideCanvas: this.pointerInsideCanvas,
      pointerTarget: this.pointerTarget,
      events: this.world.recentEvents(10).reverse()
    });
  }
}
