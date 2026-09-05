import * as Phaser from "phaser";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { WorldEvent, WorldSnapshot } from "../world/types";
import {
  PRESENTATION_DEPTH,
  resolveBlockerVisual,
  resolveEntityVisual,
  resolveLocationVisual
} from "./presentation";
import { resolvePointerTarget, type PointerTargetSample } from "./pointer-targeting";

const FIXED_STEP_MS = 1000 / 30;
const DEBUG_STATE_INTERVAL_MS = 100;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.1;
const ITEM_LABEL_DISTANCE = 150;

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
  private readonly entityViews = new Map<string, Phaser.GameObjects.Arc>();
  private readonly entityLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly locationLabels: Phaser.GameObjects.Text[] = [];
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private sceneryGraphics!: Phaser.GameObjects.Graphics;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "S" | "D" | "E" | "Q" | "V" | "L", Phaser.Input.Keyboard.Key>;
  private accumulatorMs = 0;
  private debugAccumulatorMs = 0;
  private pendingInteract = false;
  private pendingDrop = false;
  private debugOverlayVisible = false;
  private labelsVisible = true;
  private pointerProbeVisible = false;
  private pointerInsideCanvas = false;
  private pointerTarget: PointerTargetSample | null = null;

  constructor(debugSink: DebugSink) {
    super({ key: "world" });
    this.debugSink = debugSink;
  }

  create(): void {
    if (!this.input.keyboard) throw new Error("Keyboard input is required for the P1 desktop/browser specimen.");

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D,E,Q,V,L") as typeof this.keys;

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
        const nextZoom = clamp(this.cameras.main.zoom + direction * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
        this.cameras.main.setZoom(Number(nextZoom.toFixed(2)));
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

    this.syncPresentation(true);
  }

  update(_time: number, delta: number): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    const boundedDelta = Math.min(delta, 100);
    this.accumulatorMs += boundedDelta;
    this.debugAccumulatorMs += boundedDelta;
    this.pendingInteract = this.pendingInteract || Phaser.Input.Keyboard.JustDown(this.keys.E);
    this.pendingDrop = this.pendingDrop || Phaser.Input.Keyboard.JustDown(this.keys.Q);

    if (Phaser.Input.Keyboard.JustDown(this.keys.V)) this.toggleDebugOverlay();
    if (Phaser.Input.Keyboard.JustDown(this.keys.L)) this.toggleLabels();

    while (this.accumulatorMs >= FIXED_STEP_MS) {
      const moveX =
        (this.keys.D.isDown || this.cursors.right.isDown ? 1 : 0) -
        (this.keys.A.isDown || this.cursors.left.isDown ? 1 : 0);
      const moveY =
        (this.keys.S.isDown || this.cursors.down.isDown ? 1 : 0) -
        (this.keys.W.isDown || this.cursors.up.isDown ? 1 : 0);

      this.world.step({
        moveX,
        moveY,
        interactPressed: this.pendingInteract,
        dropPressed: this.pendingDrop
      });
      this.pendingInteract = false;
      this.pendingDrop = false;
      this.accumulatorMs -= FIXED_STEP_MS;
    }

    this.updatePointerTarget();

    const emitDebugState = this.debugAccumulatorMs >= DEBUG_STATE_INTERVAL_MS;
    this.syncPresentation(emitDebugState);
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

    this.groundGraphics.fillStyle(0x18231d, 1);
    this.groundGraphics.fillRect(0, 0, snapshot.width, snapshot.height);

    for (const location of snapshot.locations) {
      const visual = resolveLocationVisual(location.id);
      this.groundGraphics.fillStyle(visual.fillColor, visual.fillAlpha);
      this.groundGraphics.fillRect(location.bounds.x, location.bounds.y, location.bounds.width, location.bounds.height);
      const label = this.add
        .text(location.bounds.x + 10, location.bounds.y + 8, location.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          color: "#d7e0e7",
          backgroundColor: "#0d1216aa",
          padding: { x: 6, y: 3 }
        })
        .setDepth(PRESENTATION_DEPTH.scenery);
      this.locationLabels.push(label);
    }

    for (const blocker of snapshot.blockers) {
      const visual = resolveBlockerVisual(blocker);
      this.sceneryGraphics.fillStyle(visual.fillColor, visual.fillAlpha);
      this.sceneryGraphics.fillRect(blocker.bounds.x, blocker.bounds.y, blocker.bounds.width, blocker.bounds.height);
      this.sceneryGraphics.lineStyle(1, visual.strokeColor, visual.strokeAlpha);
      this.sceneryGraphics.strokeRect(blocker.bounds.x, blocker.bounds.y, blocker.bounds.width, blocker.bounds.height);
    }

    this.groundGraphics.lineStyle(4, 0x6a7884, 0.5);
    this.groundGraphics.strokeRect(0, 0, snapshot.width, snapshot.height);
  }

  private createEntityViews(): void {
    for (const entity of this.world.snapshot().entities) {
      const visual = resolveEntityVisual(entity);
      const view = this.add.circle(entity.position.x, entity.position.y, entity.radius, visual.fillColor, 1);
      view.setStrokeStyle(2, visual.strokeColor, visual.strokeAlpha);
      view.setDepth(visual.depth);
      this.entityViews.set(entity.id, view);

      const label = this.add
        .text(entity.position.x, entity.position.y - entity.radius - 18, entity.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: visual.labelFontSize,
          color: "#f0f4f7",
          backgroundColor: "#0b0e12bb",
          padding: { x: 4, y: 2 }
        })
        .setOrigin(0.5, 1)
        .setDepth(PRESENTATION_DEPTH.overhead);
      this.entityLabels.set(entity.id, label);
    }
  }

  private syncPresentation(emitDebugState = false): void {
    const snapshot = this.world.snapshot();
    const player = snapshot.entities.find((entity) => entity.kind === "player");

    for (const entity of snapshot.entities) {
      const view = this.entityViews.get(entity.id);
      if (view) view.setPosition(entity.position.x, entity.position.y);

      const label = this.entityLabels.get(entity.id);
      if (!label) continue;
      label.setPosition(entity.position.x, entity.position.y - entity.radius - 18);

      let visible = this.labelsVisible;
      if (visible && entity.kind === "item" && player) {
        const distance = Math.hypot(entity.position.x - player.position.x, entity.position.y - player.position.y);
        visible = entity.heldBy !== null || distance <= ITEM_LABEL_DISTANCE;
      }
      label.setVisible(visible);
    }

    for (const label of this.locationLabels) label.setVisible(this.labelsVisible);

    this.drawDebug(snapshot);
    if (emitDebugState) this.emitDebugState(snapshot);
  }

  private drawDebug(snapshot: WorldSnapshot): void {
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
    this.debugGraphics.lineStyle(2, visible ? 0x65d38e : 0xe6a455, 0.72);
    this.debugGraphics.lineBetween(npc.position.x, npc.position.y, player.position.x, player.position.y);

    this.debugGraphics.lineStyle(1, 0x9fb0be, 0.22);
    this.debugGraphics.strokeCircle(npc.position.x, npc.position.y, 220);
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
