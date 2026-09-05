import type { EntityId, Vec2, WorldEntity, WorldSnapshot } from "../world/types";

export const E1_OBSERVER_ID = "npc.001";
export const E1_PERCEPTION_RANGE = 220;
export const E1_DECISION_BUDGET = 3;
export const E1_DECISION_COOLDOWN_MS = 750;

export interface E1PerceivedEntity {
  id: EntityId;
  kind: WorldEntity["kind"];
  label: string;
  distance: number;
  direction: Vec2;
  heldBy?: EntityId | null;
  heldItemId?: EntityId | null;
}

export interface E1Perception {
  tick: number;
  observer: {
    id: EntityId;
    label: string;
    locationId: string | null;
    locationLabel: string | null;
    heldItemId: EntityId | null;
  };
  visibleEntities: E1PerceivedEntity[];
  fetchableItemIds: EntityId[];
}

export interface E1Experience {
  tick: number;
  status: "succeeded" | "failed";
  code: string;
  targetId: EntityId | null;
  message: string;
}

export type E1Decision = { kind: "wait" } | { kind: "fetch"; targetId: EntityId };

export type E1DecisionValidation =
  | { status: "accepted"; decision: E1Decision }
  | { status: "rejected"; code: "invalid_shape" | "target_not_fetchable"; targetId?: EntityId };

export interface E1CycleRequest {
  cycleId: number;
  trigger: "perception_changed" | "experience_changed" | "perception_and_experience_changed";
  perception: E1Perception;
  previousExperience: E1Experience | null;
}

export interface E1GateState {
  armed: boolean;
  inFlight: boolean;
  cyclesUsed: number;
  cycleBudget: number;
  pendingCycleId: number | null;
}

function containsPoint(
  bounds: { x: number; y: number; width: number; height: number },
  point: Vec2
): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function rounded(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function projectE1Perception(
  snapshot: WorldSnapshot,
  observerId: EntityId,
  hasLineOfSight: (start: Vec2, end: Vec2) => boolean,
  range = E1_PERCEPTION_RANGE
): E1Perception {
  const observer = snapshot.entities.find((entity) => entity.id === observerId);
  if (!observer || observer.kind !== "npc") {
    throw new Error(`E1 observer must be an NPC entity: ${observerId}`);
  }
  if (!Number.isFinite(range) || range <= 0) {
    throw new Error(`E1 perception range must be positive and finite: ${range}`);
  }

  const location = snapshot.locations.find((entry) => containsPoint(entry.bounds, observer.position));
  const visibleEntities = snapshot.entities
    .filter((entity) => entity.id !== observer.id)
    .map((entity) => {
      const dx = entity.position.x - observer.position.x;
      const dy = entity.position.y - observer.position.y;
      return { entity, dx, dy, distance: Math.hypot(dx, dy) };
    })
    .filter(({ distance }) => distance <= range)
    .filter(({ entity }) => hasLineOfSight(observer.position, entity.position))
    .map(({ entity, dx, dy, distance }): E1PerceivedEntity => {
      const direction = distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
      const perceived: E1PerceivedEntity = {
        id: entity.id,
        kind: entity.kind,
        label: entity.label,
        distance: rounded(distance, 1),
        direction: { x: rounded(direction.x, 3), y: rounded(direction.y, 3) }
      };
      if (entity.kind === "item") perceived.heldBy = entity.heldBy;
      if (entity.kind === "player" || entity.kind === "npc") perceived.heldItemId = entity.heldItemId;
      return perceived;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    tick: snapshot.tick,
    observer: {
      id: observer.id,
      label: observer.label,
      locationId: location?.id ?? null,
      locationLabel: location?.label ?? null,
      heldItemId: observer.heldItemId
    },
    visibleEntities,
    fetchableItemIds:
      observer.heldItemId === null
        ? visibleEntities
            .filter((entity) => entity.kind === "item" && entity.heldBy === null)
            .map((entity) => entity.id)
            .sort((a, b) => a.localeCompare(b))
        : []
  };
}

/**
 * E1 wake semantics are intentionally narrower than the full perception payload.
 * Pure actor motion does not wake cognition. Item visibility/ownership, observer
 * location/held state and explicit execution experience do.
 */
export function e1WakeFingerprint(perception: E1Perception): string {
  return JSON.stringify({
    observer: {
      locationId: perception.observer.locationId,
      heldItemId: perception.observer.heldItemId
    },
    items: perception.visibleEntities
      .filter((entity) => entity.kind === "item")
      .map((entity) => ({ id: entity.id, heldBy: entity.heldBy ?? null }))
  });
}

export function e1ExperienceFingerprint(experience: E1Experience | null): string {
  if (!experience) return "none";
  return JSON.stringify({
    tick: experience.tick,
    status: experience.status,
    code: experience.code,
    targetId: experience.targetId
  });
}

export function validateE1Decision(value: unknown, perception: E1Perception): E1DecisionValidation {
  if (!value || typeof value !== "object") return { status: "rejected", code: "invalid_shape" };
  const record = value as Record<string, unknown>;
  if (record.kind === "wait") return { status: "accepted", decision: { kind: "wait" } };
  if (record.kind !== "fetch" || typeof record.targetId !== "string") {
    return { status: "rejected", code: "invalid_shape" };
  }
  if (!perception.fetchableItemIds.includes(record.targetId)) {
    return { status: "rejected", code: "target_not_fetchable", targetId: record.targetId };
  }
  return { status: "accepted", decision: { kind: "fetch", targetId: record.targetId } };
}

export class E1CognitionGate {
  private armedValue = false;
  private inFlightValue = false;
  private cyclesUsedValue = 0;
  private nextCycleId = 1;
  private pendingCycleIdValue: number | null = null;
  private lastWakeFingerprint = "";
  private lastExperienceFingerprint = "none";
  private lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly cycleBudget = E1_DECISION_BUDGET,
    private readonly cooldownMs = E1_DECISION_COOLDOWN_MS
  ) {
    if (!Number.isInteger(cycleBudget) || cycleBudget <= 0) {
      throw new Error("E1 cycle budget must be positive.");
    }
    if (!Number.isFinite(cooldownMs) || cooldownMs < 0) {
      throw new Error("E1 cooldown must be finite and non-negative.");
    }
  }

  arm(perception: E1Perception, experience: E1Experience | null): void {
    this.armedValue = true;
    this.inFlightValue = false;
    this.cyclesUsedValue = 0;
    this.nextCycleId = 1;
    this.pendingCycleIdValue = null;
    this.lastWakeFingerprint = e1WakeFingerprint(perception);
    this.lastExperienceFingerprint = e1ExperienceFingerprint(experience);
    this.lastRequestAt = Number.NEGATIVE_INFINITY;
  }

  disarm(): void {
    this.armedValue = false;
    this.inFlightValue = false;
    this.pendingCycleIdValue = null;
  }

  state(): E1GateState {
    return {
      armed: this.armedValue,
      inFlight: this.inFlightValue,
      cyclesUsed: this.cyclesUsedValue,
      cycleBudget: this.cycleBudget,
      pendingCycleId: this.pendingCycleIdValue
    };
  }

  consider(
    perception: E1Perception,
    experience: E1Experience | null,
    executorRunning: boolean,
    nowMs: number
  ): E1CycleRequest | null {
    if (!this.armedValue || this.inFlightValue || executorRunning) return null;
    if (this.cyclesUsedValue >= this.cycleBudget) return null;
    if (!Number.isFinite(nowMs) || nowMs - this.lastRequestAt < this.cooldownMs) return null;

    const wakeFingerprint = e1WakeFingerprint(perception);
    const experienceFingerprint = e1ExperienceFingerprint(experience);
    const perceptionChanged = wakeFingerprint !== this.lastWakeFingerprint;
    const experienceChanged = experienceFingerprint !== this.lastExperienceFingerprint;
    if (!perceptionChanged && !experienceChanged) return null;

    const cycleId = this.nextCycleId++;
    this.inFlightValue = true;
    this.pendingCycleIdValue = cycleId;
    this.cyclesUsedValue += 1;
    this.lastWakeFingerprint = wakeFingerprint;
    this.lastExperienceFingerprint = experienceFingerprint;
    this.lastRequestAt = nowMs;

    const trigger =
      perceptionChanged && experienceChanged
        ? "perception_and_experience_changed"
        : perceptionChanged
          ? "perception_changed"
          : "experience_changed";

    return {
      cycleId,
      trigger,
      perception: structuredClone(perception),
      previousExperience: experience ? { ...experience } : null
    };
  }

  finish(cycleId: number): boolean {
    if (!this.inFlightValue || this.pendingCycleIdValue !== cycleId) return false;
    this.inFlightValue = false;
    this.pendingCycleIdValue = null;
    return true;
  }
}
