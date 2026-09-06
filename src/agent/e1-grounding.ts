import { resolveLocationZone } from "../world/location-membership";
import type { EntityId, Vec2, WorldEntity, WorldSnapshot } from "../world/types";

export const E1_OBSERVER_ID = "npc.001";
export const E1_PERCEPTION_RANGE = 220;
export const E1_DECISION_BUDGET = 3;
export const E1_DECISION_COOLDOWN_MS = 750;
export const E1_OBSERVED_CHANGE_LIMIT = 32;

export interface E1PerceivedEntity {
  id: EntityId;
  kind: WorldEntity["kind"];
  label: string;
  distance: number;
  /** Observer-body direction: x = forward/back, y = right/left. */
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

export type E1ObservedChange =
  | {
      kind: "item_entered_perception";
      itemId: EntityId;
      holderId: EntityId | null;
    }
  | {
      kind: "item_left_perception";
      itemId: EntityId;
      previousHolderId: EntityId | null;
    }
  | {
      kind: "item_holder_changed";
      itemId: EntityId;
      previousHolderId: EntityId | null;
      holderId: EntityId | null;
    }
  | {
      kind: "observer_held_item_changed";
      previousItemId: EntityId | null;
      itemId: EntityId | null;
    }
  | {
      kind: "observer_location_changed";
      previousLocationId: string | null;
      locationId: string | null;
    };

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
  observedChanges: E1ObservedChange[];
  /** Number of older bounded temporal changes omitted before this request. */
  observedChangesDropped: number;
  previousExperience: E1Experience | null;
}

export interface E1GateState {
  armed: boolean;
  inFlight: boolean;
  cyclesUsed: number;
  cycleBudget: number;
  pendingCycleId: number | null;
}

function rounded(value: number, digits: number): number {
  const factor = 10 ** digits;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function perceivedItems(perception: E1Perception): Map<EntityId, E1PerceivedEntity> {
  return new Map(
    perception.visibleEntities
      .filter((entity) => entity.kind === "item")
      .map((entity) => [entity.id, entity])
  );
}

function observedChangeSignature(change: E1ObservedChange): string {
  return JSON.stringify(change);
}

function mergeBoundedObservedChanges(
  sampledChanges: readonly E1ObservedChange[],
  supplementalObservedChanges: readonly E1ObservedChange[],
  supplementalDroppedCount: number
): { observedChanges: E1ObservedChange[]; observedChangesDropped: number } {
  const supplementalSignatures = new Set(supplementalObservedChanges.map(observedChangeSignature));
  const uniqueSampled = sampledChanges.filter(
    (change) => !supplementalSignatures.has(observedChangeSignature(change))
  );

  // Buffered semantic occurrences are historical event-time facts. Sampled
  // changes are the current reconciliation against the last cognition sample.
  // Reserve space for current sampled facts first; if the request overflows,
  // omit the oldest buffered event history rather than silently losing a fresh
  // sampled state change. Relative ordering inside the retained event batch is
  // preserved, but the combined array is not claimed to be a total chronology
  // across event-time and sampled modalities.
  const sampledOverflow = Math.max(0, uniqueSampled.length - E1_OBSERVED_CHANGE_LIMIT);
  const retainedSampled = uniqueSampled.slice(sampledOverflow);
  const supplementalCapacity = E1_OBSERVED_CHANGE_LIMIT - retainedSampled.length;
  const supplementalOverflow = Math.max(0, supplementalObservedChanges.length - supplementalCapacity);
  const retainedSupplemental = supplementalObservedChanges.slice(supplementalOverflow);
  const observedChangesDropped = supplementalDroppedCount + supplementalOverflow + sampledOverflow;
  if (!Number.isSafeInteger(observedChangesDropped)) {
    throw new Error(`E1 dropped observed-change count exceeded safe integer range: ${observedChangesDropped}`);
  }

  return {
    observedChanges: [
      ...retainedSupplemental.map((change) => structuredClone(change)),
      ...retainedSampled.map((change) => structuredClone(change))
    ],
    observedChangesDropped
  };
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

  const location = resolveLocationZone(snapshot.locations, observer.position);
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
      const worldDirection = distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
      const right = { x: -observer.facing.y, y: observer.facing.x };
      const direction = {
        x: worldDirection.x * observer.facing.x + worldDirection.y * observer.facing.y,
        y: worldDirection.x * right.x + worldDirection.y * right.y
      };
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
 * E1's sampled wake surface remains intentionally narrow: observer state plus
 * visible free-item IDs. R6b supplements this fingerprint with explicit local
 * semantic occurrences at the gate boundary rather than adding all direction
 * or motion churn to this fingerprint.
 */
export function e1WakeFingerprint(perception: E1Perception): string {
  return JSON.stringify({
    observer: {
      locationId: perception.observer.locationId,
      heldItemId: perception.observer.heldItemId
    },
    fetchableItemIds: [...perception.fetchableItemIds].sort((a, b) => a.localeCompare(b))
  });
}

export function deriveE1ObservedChanges(
  previous: E1Perception,
  current: E1Perception
): E1ObservedChange[] {
  const changes: E1ObservedChange[] = [];

  if (previous.observer.locationId !== current.observer.locationId) {
    changes.push({
      kind: "observer_location_changed",
      previousLocationId: previous.observer.locationId,
      locationId: current.observer.locationId
    });
  }
  if (previous.observer.heldItemId !== current.observer.heldItemId) {
    changes.push({
      kind: "observer_held_item_changed",
      previousItemId: previous.observer.heldItemId,
      itemId: current.observer.heldItemId
    });
  }

  const previousItems = perceivedItems(previous);
  const currentItems = perceivedItems(current);
  const itemIds = new Set([...previousItems.keys(), ...currentItems.keys()]);
  for (const itemId of [...itemIds].sort((a, b) => a.localeCompare(b))) {
    const before = previousItems.get(itemId);
    const after = currentItems.get(itemId);
    if (!before && after) {
      changes.push({
        kind: "item_entered_perception",
        itemId,
        holderId: after.heldBy ?? null
      });
      continue;
    }
    if (before && !after) {
      changes.push({
        kind: "item_left_perception",
        itemId,
        previousHolderId: before.heldBy ?? null
      });
      continue;
    }
    if (before && after && (before.heldBy ?? null) !== (after.heldBy ?? null)) {
      changes.push({
        kind: "item_holder_changed",
        itemId,
        previousHolderId: before.heldBy ?? null,
        holderId: after.heldBy ?? null
      });
    }
  }

  return changes;
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
  private lastPerception: E1Perception | null = null;
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
    this.lastPerception = structuredClone(perception);
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
    nowMs: number,
    supplementalObservedChanges: readonly E1ObservedChange[] = [],
    supplementalDroppedCount = 0
  ): E1CycleRequest | null {
    if (!this.armedValue) return null;
    if (!Number.isSafeInteger(supplementalDroppedCount) || supplementalDroppedCount < 0) {
      throw new Error(`E1 dropped observed-change count must be a non-negative safe integer: ${supplementalDroppedCount}`);
    }

    const wakeFingerprint = e1WakeFingerprint(perception);
    const experienceFingerprint = e1ExperienceFingerprint(experience);
    const sampledPerceptionChanged = wakeFingerprint !== this.lastWakeFingerprint;
    const semanticPerceptionChanged = supplementalObservedChanges.length > 0 || supplementalDroppedCount > 0;
    const perceptionChanged = sampledPerceptionChanged || semanticPerceptionChanged;
    const experienceChanged = experienceFingerprint !== this.lastExperienceFingerprint;

    if (!perceptionChanged && !experienceChanged) {
      this.lastPerception = structuredClone(perception);
      return null;
    }

    if (this.inFlightValue || executorRunning) return null;
    if (this.cyclesUsedValue >= this.cycleBudget) return null;
    if (!Number.isFinite(nowMs) || nowMs - this.lastRequestAt < this.cooldownMs) return null;

    const previousPerception = this.lastPerception ?? perception;
    const sampledChanges = deriveE1ObservedChanges(previousPerception, perception);
    const { observedChanges, observedChangesDropped } = mergeBoundedObservedChanges(
      sampledChanges,
      supplementalObservedChanges,
      supplementalDroppedCount
    );

    const cycleId = this.nextCycleId++;
    this.inFlightValue = true;
    this.pendingCycleIdValue = cycleId;
    this.cyclesUsedValue += 1;
    this.lastWakeFingerprint = wakeFingerprint;
    this.lastExperienceFingerprint = experienceFingerprint;
    this.lastPerception = structuredClone(perception);
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
      observedChanges,
      observedChangesDropped,
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
