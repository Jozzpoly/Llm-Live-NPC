import * as Phaser from "phaser";
import type {
  ActorMotionOutcome,
  ActorState,
  ResidentDiagnostics,
  WorldOccurrence,
  WorldPublicSnapshot,
} from "../spc-next/contracts";
import { createFiveResidentJanekMaterialSlice } from "../spc-next/five-resident-material-slice";
import {
  projectEpistemicActors,
  projectMotionFeedback,
  projectRecentDirectionalHearing,
  resolveActivityTarget,
} from "./spc-next-research-projection";

const PLAYER_ID = "player.jozz";
const FIXED_STEP_MS = 1000 / 60;
const MAX_FRAME_DELTA_MS = 100;
const SPEECH_LIFETIME_TICKS = 240;
const STATE_PUSH_INTERVAL_MS = 100;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 1.8;
const PLAYER_SPEED = 150;
const PLAYER_CALL_RADIUS = 420;
const MATERIAL_PLACE_OFFSET = 42;

interface ActorView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  heading: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  stateLabel: Phaser.GameObjects.Text;
}

interface SpeechView {
  text: Phaser.GameObjects.Text;
  actorId: string;
  expiresAtTick: number;
}

type MovementKeys = Record<"W" | "A" | "S" | "D" | "R" | "F" | "P" | "O" | "H" | "E" | "TAB", Phaser.Input.Keyboard.Key>;

export interface SpcNextResearchFrame {
  snapshot: WorldPublicSnapshot;
  recentOccurrences: readonly WorldOccurrence[];
  motionOutcomes: readonly ActorMotionOutcome[];
  selectedResidentId: string | null;
  selectedDiagnostics: ResidentDiagnostics | null;
  selectedRegionId: string | null;
  overlayEnabled: boolean;
  cameraZoom: number;
}

type FrameSink = (frame: SpcNextResearchFrame) => void;

export class SpcNextResearchScene extends Phaser.Scene {
  private readonly janekSlice = createFiveResidentJanekMaterialSlice();
  private readonly world = this.janekSlice.world;
  private snapshot: WorldPublicSnapshot = this.world.publicSnapshot();
  private readonly actorViews = new Map<string, ActorView>();
  private readonly speechViews = new Map<string, SpeechView>();
  private readonly materialLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly seenOccurrenceIds = new Set<string>();
  private regionGraphics!: Phaser.GameObjects.Graphics;
  private materialGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private keys: MovementKeys | null = null;
  private accumulatorMs = 0;
  private stateAccumulatorMs = 0;
  private selectedResidentId: string | null = "resident.mira";
  private overlayEnabled = false;

  constructor(private readonly frameSink: FrameSink) {
    super({ key: "spc-next-research" });
  }

  create(): void {
    this.regionGraphics = this.add.graphics().setDepth(-20);
    this.materialGraphics = this.add.graphics().setDepth(6);
    this.overlayGraphics = this.add.graphics().setDepth(40);
    this.drawRegions();
    this.syncActorViews();
    this.syncMaterialViews();

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys("W,A,S,D,R,F,P,O,H,E,TAB") as MovementKeys;
    }

    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      const factor = dy > 0 ? 0.9 : 1.1;
      this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom * factor, MIN_ZOOM, MAX_ZOOM));
      this.pushFrame(true);
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.selectAtPointer(pointer));

    const bounds = this.world.options.bounds;
    this.cameras.main.setBounds(
      bounds.minX,
      bounds.minY,
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
    );
    this.followPlayer();
    this.cameras.main.setZoom(0.72);
    this.captureNewSpeechOccurrences();
    this.pushFrame(true);
  }

  update(_time: number, delta: number): void {
    this.handleResearchShortcuts();
    this.accumulatorMs += Math.min(delta, MAX_FRAME_DELTA_MS);
    this.stateAccumulatorMs += delta;

    while (this.accumulatorMs >= FIXED_STEP_MS) {
      this.stepWorld();
      this.accumulatorMs -= FIXED_STEP_MS;
    }

    this.syncActorViews();
    this.syncMaterialViews();
    this.syncSpeechViews();
    this.drawResearchOverlay();

    if (this.stateAccumulatorMs >= STATE_PUSH_INTERVAL_MS) {
      this.stateAccumulatorMs = 0;
      this.pushFrame(false);
    }
  }

  toggleResearchOverlay(): void {
    this.overlayEnabled = !this.overlayEnabled;
    this.pushFrame(true);
  }

  setResearchOverlay(enabled: boolean): void {
    this.overlayEnabled = enabled;
    this.pushFrame(true);
  }

  playerCall(text = "Hej!"): void {
    this.world.speak(PLAYER_ID, text, PLAYER_CALL_RADIUS);
    this.captureNewSpeechOccurrences();
    this.pushFrame(true);
  }

  selectResident(residentId: string | null): void {
    if (residentId !== null && !this.snapshot.residents.some((resident) => resident.id === residentId)) {
      throw new Error(`unknown SPC Next resident selection: ${residentId}`);
    }
    this.selectedResidentId = residentId;
    this.pushFrame(true);
  }

  focusSelected(): void {
    if (!this.selectedResidentId) return;
    const view = this.actorViews.get(this.selectedResidentId);
    if (!view) return;
    this.cameras.main.startFollow(view.container, true, 0.12, 0.12);
    this.cameras.main.setZoom(Math.max(this.cameras.main.zoom, 0.62));
    this.pushFrame(true);
  }

  followPlayer(): void {
    const view = this.actorViews.get(PLAYER_ID);
    if (!view) return;
    this.cameras.main.startFollow(view.container, true, 0.12, 0.12);
    this.pushFrame(true);
  }

  overview(): void {
    const camera = this.cameras.main;
    const bounds = this.world.options.bounds;
    camera.stopFollow();
    camera.centerOn((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;
    const fitZoom = Math.min(camera.width / worldWidth, camera.height / worldHeight) * 0.92;
    camera.setZoom(Phaser.Math.Clamp(fitZoom, MIN_ZOOM, MAX_ZOOM));
    this.pushFrame(true);
  }

  currentFrame(): SpcNextResearchFrame {
    return this.buildFrame();
  }

  private stepWorld(): void {
    this.applyPlayerControl();
    this.janekSlice.stepJanek();
    this.world.step();
    this.snapshot = this.world.publicSnapshot();
    this.captureNewSpeechOccurrences();
  }

  private applyPlayerControl(): void {
    const left = Boolean(this.cursors?.left.isDown || this.keys?.A.isDown);
    const right = Boolean(this.cursors?.right.isDown || this.keys?.D.isDown);
    const up = Boolean(this.cursors?.up.isDown || this.keys?.W.isDown);
    const down = Boolean(this.cursors?.down.isDown || this.keys?.S.isDown);
    let x = Number(right) - Number(left);
    let y = Number(down) - Number(up);
    const length = Math.hypot(x, y);
    if (length > 1e-9) {
      x /= length;
      y /= length;
    }
    this.world.setActorMotionIntent(PLAYER_ID, { x: x * PLAYER_SPEED, y: y * PLAYER_SPEED });
  }

  private handleResearchShortcuts(): void {
    if (!this.keys) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.toggleResearchOverlay();
    if (Phaser.Input.Keyboard.JustDown(this.keys.F)) this.focusSelected();
    if (Phaser.Input.Keyboard.JustDown(this.keys.P)) this.followPlayer();
    if (Phaser.Input.Keyboard.JustDown(this.keys.O)) this.overview();
    if (Phaser.Input.Keyboard.JustDown(this.keys.H)) this.playerCall();
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.playerMaterialAction();
    if (Phaser.Input.Keyboard.JustDown(this.keys.TAB)) this.cycleResidentSelection();
  }

  private playerMaterialAction(): void {
    const player = this.snapshot.actors.find((actor) => actor.id === PLAYER_ID);
    if (!player) return;
    const objects = this.world.materialObjects();
    const held = objects.find((object) => object.location.kind === "held" && object.location.actorId === PLAYER_ID);
    if (held) {
      this.world.attemptMaterialAction(PLAYER_ID, {
        kind: "place",
        objectId: held.id,
        position: { x: player.position.x + MATERIAL_PLACE_OFFSET, y: player.position.y },
      });
      this.syncMaterialViews();
      this.pushFrame(true);
      return;
    }

    const nearest = objects
      .filter((object) => object.location.kind === "free")
      .map((object) => ({
        object,
        distance: object.location.kind === "free"
          ? Phaser.Math.Distance.Between(player.position.x, player.position.y, object.location.position.x, object.location.position.y)
          : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.distance - b.distance || a.object.id.localeCompare(b.object.id))[0];
    if (!nearest) return;
    this.world.attemptMaterialAction(PLAYER_ID, { kind: "pickup", objectId: nearest.object.id });
    this.syncMaterialViews();
    this.pushFrame(true);
  }

  private cycleResidentSelection(): void {
    const ids = this.snapshot.residents.map((resident) => resident.id).sort((a, b) => a.localeCompare(b));
    if (ids.length === 0) return;
    const index = this.selectedResidentId ? ids.indexOf(this.selectedResidentId) : -1;
    this.selectedResidentId = ids[(index + 1) % ids.length]!;
    this.pushFrame(true);
  }

  private selectAtPointer(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const radius = 30 / this.cameras.main.zoom;
    let best: ActorState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const actor of this.snapshot.actors) {
      if (actor.kind !== "resident") continue;
      const distance = Phaser.Math.Distance.Between(worldPoint.x, worldPoint.y, actor.position.x, actor.position.y);
      if (distance <= radius && distance < bestDistance) {
        best = actor;
        bestDistance = distance;
      }
    }
    if (best) this.selectResident(best.id);
  }

  private drawRegions(): void {
    const palette = [0x253a33, 0x303845, 0x41392d, 0x2d3d46, 0x2c4137, 0x40372e, 0x383145, 0x273841];
    this.regionGraphics.clear();
    this.world.regions().forEach((region, index) => {
      const width = region.maxX - region.minX;
      const height = region.maxY - region.minY;
      const color = palette[index % palette.length]!;
      this.regionGraphics.fillStyle(color, 0.42);
      this.regionGraphics.fillRect(region.minX, region.minY, width, height);
      this.regionGraphics.lineStyle(3, 0x6f8290, 0.16);
      this.regionGraphics.strokeRect(region.minX, region.minY, width, height);
      this.add.text(region.minX + 36, region.minY + 30, region.label, {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "24px",
        color: "#8fa0ab",
      }).setAlpha(0.54).setDepth(-10);
    });

    const bounds = this.world.options.bounds;
    this.regionGraphics.lineStyle(8, 0x9fb1bd, 0.24);
    this.regionGraphics.strokeRect(
      bounds.minX,
      bounds.minY,
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
    );
  }

  private syncActorViews(): void {
    for (const actor of this.snapshot.actors) {
      let view = this.actorViews.get(actor.id);
      if (!view) {
        view = this.createActorView(actor);
        this.actorViews.set(actor.id, view);
      }
      view.container.setPosition(actor.position.x, actor.position.y);
      const speed = Math.hypot(actor.velocity.x, actor.velocity.y);
      if (speed > 1e-6) {
        view.heading.setVisible(true);
        view.heading.setRotation(Math.atan2(actor.velocity.y, actor.velocity.x));
      } else {
        view.heading.setVisible(false);
      }
      const publicResident = this.snapshot.residents.find((resident) => resident.id === actor.id);
      view.stateLabel.setText(publicResident ? publicResident.activity.kind : "player");
      view.stateLabel.setVisible(this.overlayEnabled);
      const selected = actor.id === this.selectedResidentId;
      view.body.setStrokeStyle(selected ? 4 : 2, selected ? 0xf0d889 : 0xc5d3dc, selected ? 1 : 0.48);
    }

    for (const [id, view] of this.actorViews) {
      if (this.snapshot.actors.some((actor) => actor.id === id)) continue;
      view.container.destroy(true);
      this.actorViews.delete(id);
    }
  }

  private syncMaterialViews(): void {
    this.materialGraphics.clear();
    const objects = this.world.materialObjects();
    const presentIds = new Set(objects.map((object) => object.id));
    for (const object of objects) {
      const position = object.location.kind === "free"
        ? object.location.position
        : (() => {
            const holder = this.snapshot.actors.find((actor) => actor.id === object.location.actorId);
            return holder ? { x: holder.position.x + 23, y: holder.position.y + 5 } : null;
          })();
      if (!position) continue;

      const half = Math.max(10, object.radius * 0.9);
      this.materialGraphics.fillStyle(0xb78652, 0.96);
      this.materialGraphics.fillRect(position.x - half, position.y - half * 0.72, half * 2, half * 1.44);
      this.materialGraphics.lineStyle(2, 0xe4c08c, 0.9);
      this.materialGraphics.strokeRect(position.x - half, position.y - half * 0.72, half * 2, half * 1.44);
      this.materialGraphics.lineBetween(position.x, position.y - half * 0.72, position.x, position.y + half * 0.72);

      let label = this.materialLabels.get(object.id);
      if (!label) {
        label = this.add.text(0, 0, object.label, {
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "12px",
          color: "#ead7be",
          backgroundColor: "#17120ec7",
          padding: { x: 4, y: 2 },
        }).setOrigin(0.5, 1).setDepth(7);
        this.materialLabels.set(object.id, label);
      }
      label.setPosition(position.x, position.y - half - 6).setVisible(true);
    }

    for (const [id, label] of this.materialLabels) {
      if (presentIds.has(id)) continue;
      label.destroy();
      this.materialLabels.delete(id);
    }
  }

  private createActorView(actor: ActorState): ActorView {
    const radius = actor.kind === "player" ? 20 : 17;
    const color = actor.kind === "player" ? 0xf3d37b : residentColor(actor.id);
    const body = this.add.circle(0, 0, radius, color, 0.96).setStrokeStyle(2, 0xc5d3dc, 0.48);
    const heading = this.add.rectangle(radius - 1, 0, radius + 8, 3, 0xf5f8fa, 0.92).setOrigin(0, 0.5);
    const name = actor.kind === "player"
      ? "Jozz"
      : this.snapshot.residents.find((resident) => resident.id === actor.id)?.name ?? actor.id;
    const label = this.add.text(0, -31, name, {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "15px",
      color: "#edf3f6",
      backgroundColor: "#111820c7",
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1);
    const stateLabel = this.add.text(0, 28, actor.kind, {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "11px",
      color: "#a7b5bf",
      backgroundColor: "#111820b8",
      padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 0).setVisible(this.overlayEnabled);
    const container = this.add.container(actor.position.x, actor.position.y, [body, heading, label, stateLabel]).setDepth(10);
    return { container, body, heading, label, stateLabel };
  }

  private captureNewSpeechOccurrences(): void {
    const occurrences = this.world.diagnostics().recentOccurrences;
    for (const occurrence of occurrences.slice(-32)) {
      if (this.seenOccurrenceIds.has(occurrence.id)) continue;
      this.seenOccurrenceIds.add(occurrence.id);
      if (occurrence.kind !== "speech" || !occurrence.text || !occurrence.actorId) continue;
      const text = this.add.text(0, 0, occurrence.text.slice(0, 180), {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "13px",
        color: "#eef4f6",
        backgroundColor: "#111820e8",
        padding: { x: 8, y: 5 },
        wordWrap: { width: 220 },
        align: "center",
      }).setOrigin(0.5, 1).setDepth(30);
      this.speechViews.set(occurrence.id, {
        text,
        actorId: occurrence.actorId,
        expiresAtTick: occurrence.tick + SPEECH_LIFETIME_TICKS,
      });
    }
  }

  private syncSpeechViews(): void {
    const zoom = this.cameras.main.zoom;
    for (const [occurrenceId, view] of this.speechViews) {
      if (this.snapshot.tick > view.expiresAtTick) {
        view.text.destroy();
        this.speechViews.delete(occurrenceId);
        continue;
      }
      const actor = this.snapshot.actors.find((candidate) => candidate.id === view.actorId);
      if (!actor) continue;
      view.text.setPosition(actor.position.x, actor.position.y - 42 / zoom);
      view.text.setScale(1 / zoom);
    }
  }

  private drawResearchOverlay(): void {
    this.overlayGraphics.clear();
    if (!this.overlayEnabled || !this.selectedResidentId) return;
    const actor = this.snapshot.actors.find((candidate) => candidate.id === this.selectedResidentId);
    const resident = this.snapshot.residents.find((candidate) => candidate.id === this.selectedResidentId);
    if (!actor || !resident) return;

    const zoom = this.cameras.main.zoom;
    const width = 1.5 / zoom;
    this.overlayGraphics.lineStyle(width, 0x78c6ef, 0.32);
    this.overlayGraphics.strokeCircle(actor.position.x, actor.position.y, actor.sightRadius);
    this.overlayGraphics.lineStyle(width, 0xd8b56b, 0.22);
    this.overlayGraphics.strokeCircle(actor.position.x, actor.position.y, actor.hearingRadius);

    const target = resolveActivityTarget(this.snapshot, resident);
    if (target) {
      this.overlayGraphics.lineStyle(2 / zoom, 0xf0d889, 0.72);
      this.overlayGraphics.lineBetween(actor.position.x, actor.position.y, target.x, target.y);
      this.overlayGraphics.fillStyle(0xf0d889, 0.75);
      this.overlayGraphics.fillCircle(target.x, target.y, 7 / zoom);
    }

    const worldDiagnostics = this.world.diagnostics();
    const motion = projectMotionFeedback(worldDiagnostics.lastMotionOutcomes, actor.id);
    if (motion) {
      const intentSpeed = Math.hypot(motion.desiredVelocity.x, motion.desiredVelocity.y);
      const resolvedSpeed = Math.hypot(motion.resolvedVelocity.x, motion.resolvedVelocity.y);
      const scale = 0.55;
      if (intentSpeed > 1e-6) {
        drawArrow(
          this.overlayGraphics,
          actor.position.x,
          actor.position.y,
          actor.position.x + motion.desiredVelocity.x * scale,
          actor.position.y + motion.desiredVelocity.y * scale,
          0xb98be8,
          zoom,
          0.78,
        );
      }
      if (resolvedSpeed > 1e-6) {
        drawArrow(
          this.overlayGraphics,
          actor.position.x,
          actor.position.y,
          actor.position.x + motion.resolvedVelocity.x * scale,
          actor.position.y + motion.resolvedVelocity.y * scale,
          0xa6e3a1,
          zoom,
          0.96,
        );
      }
      if (motion.resolution !== "full") {
        const color = motion.resolution === "blocked" ? 0xef7d6d : 0xe7b36a;
        this.overlayGraphics.lineStyle(3 / zoom, color, 0.92);
        this.overlayGraphics.strokeCircle(actor.position.x, actor.position.y, 27 / zoom);
      }
    }

    const diagnostics = this.world.residentDiagnostics(this.selectedResidentId);
    for (const marker of projectEpistemicActors(diagnostics)) {
      this.overlayGraphics.lineStyle(2 / zoom, marker.currentlyVisible ? 0x8cd8ff : 0x80909c, marker.currentlyVisible ? 0.82 : 0.48);
      this.overlayGraphics.strokeCircle(marker.lastKnownPosition.x, marker.lastKnownPosition.y, 11 / zoom);
      const truth = this.snapshot.actors.find((candidate) => candidate.id === marker.actorId);
      if (truth && Phaser.Math.Distance.Between(
        truth.position.x,
        truth.position.y,
        marker.lastKnownPosition.x,
        marker.lastKnownPosition.y,
      ) > 4) {
        this.overlayGraphics.lineStyle(1 / zoom, 0x82919c, 0.24);
        this.overlayGraphics.lineBetween(
          marker.lastKnownPosition.x,
          marker.lastKnownPosition.y,
          truth.position.x,
          truth.position.y,
        );
      }
    }

    for (const marker of projectRecentDirectionalHearing(diagnostics, 4)) {
      const length = marker.distanceBand === "near" ? 90 : marker.distanceBand === "mid" ? 170 : 260;
      drawArrow(
        this.overlayGraphics,
        actor.position.x,
        actor.position.y,
        actor.position.x + marker.direction.x * length,
        actor.position.y + marker.direction.y * length,
        0xe0a96e,
        zoom,
        0.82,
      );
    }
  }

  private pushFrame(force: boolean): void {
    if (!force && !this.scene.isActive()) return;
    this.frameSink(this.buildFrame());
  }

  private buildFrame(): SpcNextResearchFrame {
    const selectedDiagnostics = this.selectedResidentId
      ? this.world.residentDiagnostics(this.selectedResidentId)
      : null;
    const selectedActor = this.selectedResidentId
      ? this.snapshot.actors.find((actor) => actor.id === this.selectedResidentId) ?? null
      : null;
    const diagnostics = this.world.diagnostics();
    return {
      snapshot: structuredClone(this.snapshot),
      recentOccurrences: diagnostics.recentOccurrences.slice(-12),
      motionOutcomes: diagnostics.lastMotionOutcomes,
      selectedResidentId: this.selectedResidentId,
      selectedDiagnostics,
      selectedRegionId: selectedActor ? this.world.regionAt(selectedActor.position)?.id ?? null : null,
      overlayEnabled: this.overlayEnabled,
      cameraZoom: this.cameras.main?.zoom ?? 1,
    };
  }
}

function residentColor(id: string): number {
  const palette = [0x6ea6c7, 0xc18b6c, 0x7fb38a, 0xa78bc2, 0xc2ac6f, 0x6fa9a3];
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return palette[(hash >>> 0) % palette.length]!;
}

function drawArrow(
  graphics: Phaser.GameObjects.Graphics,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: number,
  zoom: number,
  alpha: number,
): void {
  graphics.lineStyle(2 / zoom, color, alpha);
  graphics.lineBetween(fromX, fromY, toX, toY);
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const head = 11 / zoom;
  graphics.lineBetween(toX, toY, toX - Math.cos(angle - Math.PI / 6) * head, toY - Math.sin(angle - Math.PI / 6) * head);
  graphics.lineBetween(toX, toY, toX - Math.cos(angle + Math.PI / 6) * head, toY - Math.sin(angle + Math.PI / 6) * head);
}