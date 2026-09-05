import * as Phaser from "phaser";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { WorldEvent, WorldSnapshot } from "../world/types";

const FIXED_STEP_MS = 1000 / 30;
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
  private staticGraphics!: Phaser.GameObjects.Graphics;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "S" | "D" | "E" | "Q" | "V" | "L", Phaser.Input.Keyboard.Key>;
  private accumulatorMs = 0;
  private pendingInteract = false;
  private pendingDrop = false;
  private debugOverlayVisible = false;
  private labelsVisible = true;

  constructor(debugSink: DebugSink) {
    super({ key: "world" });
    this.debugSink = debugSink;
  }

  create(): void {
    if (!this.input.keyboard) throw new Error("Keyboard input is required for the P1 desktop/browser specimen.");

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D,E,Q,V,L") as typeof this.keys;

    this.staticGraphics = this.add.graphics();
    this.debugGraphics = this.add.graphics().setDepth(20);
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

    this.syncPresentation();
  }

  update(_time: number, delta: number): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.accumulatorMs += Math.min(delta, 100);
    this.pendingInteract = this.pendingInteract || Phaser.Input.Keyboard.JustDown(this.keys.E);
    this.pendingDrop = this.pendingDrop || Phaser.Input.Keyboard.JustDown(this.keys.Q);

    if (Phaser.Input.Keyboard.JustDown(this.keys.V)) {
      this.debugOverlayVisible = !this.debugOverlayVisible;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.L)) {
      this.labelsVisible = !this.labelsVisible;
    }

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

    this.syncPresentation();
  }

  private drawStaticWorld(): void {
    const snapshot = this.world.snapshot();

    this.staticGraphics.fillStyle(0x18231d, 1);
    this.staticGraphics.fillRect(0, 0, snapshot.width, snapshot.height);

    for (const location of snapshot.locations) {
      const color = this.locationColor(location.id);
      this.staticGraphics.fillStyle(color, 0.16);
      this.staticGraphics.fillRect(location.bounds.x, location.bounds.y, location.bounds.width, location.bounds.height);
      const label = this.add
        .text(location.bounds.x + 10, location.bounds.y + 8, location.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          color: "#d7e0e7",
          backgroundColor: "#0d1216aa",
          padding: { x: 6, y: 3 }
        })
        .setDepth(2);
      this.locationLabels.push(label);
    }

    for (const blocker of snapshot.blockers) {
      this.staticGraphics.fillStyle(blocker.occludesVision ? 0x4d5963 : 0x66523d, 0.95);
      this.staticGraphics.fillRect(blocker.bounds.x, blocker.bounds.y, blocker.bounds.width, blocker.bounds.height);
      this.staticGraphics.lineStyle(1, 0xaab5bd, blocker.occludesVision ? 0.35 : 0.2);
      this.staticGraphics.strokeRect(blocker.bounds.x, blocker.bounds.y, blocker.bounds.width, blocker.bounds.height);
    }

    this.staticGraphics.lineStyle(4, 0x6a7884, 0.5);
    this.staticGraphics.strokeRect(0, 0, snapshot.width, snapshot.height);
  }

  private createEntityViews(): void {
    for (const entity of this.world.snapshot().entities) {
      const color = entity.kind === "player" ? 0x79d8ff : entity.kind === "npc" ? 0xffc46b : 0xece6cf;
      const view = this.add.circle(entity.position.x, entity.position.y, entity.radius, color, 1);
      view.setStrokeStyle(2, 0x0b0e12, 0.9);
      view.setDepth(entity.kind === "item" ? 5 : 6);
      this.entityViews.set(entity.id, view);

      const label = this.add
        .text(entity.position.x, entity.position.y - entity.radius - 18, entity.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: entity.kind === "item" ? "11px" : "12px",
          color: "#f0f4f7",
          backgroundColor: "#0b0e12bb",
          padding: { x: 4, y: 2 }
        })
        .setOrigin(0.5, 1)
        .setDepth(7);
      this.entityLabels.set(entity.id, label);
    }
  }

  private syncPresentation(): void {
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
    this.emitDebugState(snapshot);
  }

  private drawDebug(snapshot: WorldSnapshot): void {
    this.debugGraphics.clear();
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
      events: this.world.recentEvents(10).reverse()
    });
  }

  private locationColor(id: string): number {
    switch (id) {
      case "workshop":
        return 0x5e7080;
      case "cottage":
        return 0x826956;
      case "grove":
        return 0x456d50;
      case "north-path":
        return 0x70695a;
      default:
        return 0x536c61;
    }
  }
}
