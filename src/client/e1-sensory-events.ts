import {
  E1_OBSERVED_CHANGE_LIMIT,
  projectE1Perception,
  type E1ObservedChange
} from "../agent/e1-grounding";
import type { ExecutionSemanticActionOccurrence } from "../execution/execution-driver";
import type { EntityId, Vec2 } from "../world/types";

export interface E1PendingSensoryChanges {
  changes: E1ObservedChange[];
  droppedCount: number;
}

/**
 * Session-local bounded queue for already-localized sensory changes. Raw World
 * snapshots and global events are never retained here. Overflow keeps the most
 * recent changes and carries an explicit omission count into the next request.
 */
export class E1SensoryChangeBuffer {
  private readonly changes: E1ObservedChange[] = [];
  private droppedCountValue = 0;

  constructor(private readonly limit = E1_OBSERVED_CHANGE_LIMIT) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`E1 sensory change buffer limit must be a positive integer: ${limit}`);
    }
  }

  append(changes: readonly E1ObservedChange[]): void {
    this.changes.push(...changes.map((change) => structuredClone(change)));
    const overflow = Math.max(0, this.changes.length - this.limit);
    if (overflow > 0) {
      this.changes.splice(0, overflow);
      this.droppedCountValue += overflow;
    }
  }

  pending(): E1PendingSensoryChanges {
    return {
      changes: this.changes.map((change) => structuredClone(change)),
      droppedCount: this.droppedCountValue
    };
  }

  clear(): void {
    this.changes.length = 0;
    this.droppedCountValue = 0;
  }
}

/**
 * Convert frame-local semantic action occurrences into cognition-visible item
 * ownership changes only when every named participant is locally visible at
 * the occurrence's event-time snapshot. This deliberately avoids using the
 * diagnostic World event ring or leaking a globally known actor ID through an
 * otherwise visible item relation.
 */
export function deriveE1SemanticActionObservedChanges(
  occurrences: readonly ExecutionSemanticActionOccurrence[],
  observerId: EntityId,
  hasLineOfSight: (start: Vec2, end: Vec2) => boolean
): E1ObservedChange[] {
  const changes: E1ObservedChange[] = [];

  for (const occurrence of occurrences) {
    const { result, snapshot } = occurrence;
    if (result.actorId === observerId) continue;
    if (
      result.status !== "succeeded" ||
      (result.code !== "picked_up_item" && result.code !== "dropped_item") ||
      !result.targetId
    ) {
      continue;
    }

    const perception = projectE1Perception(snapshot, observerId, hasLineOfSight);
    const item = perception.visibleEntities.find(
      (entity) => entity.id === result.targetId && entity.kind === "item"
    );
    const actor = perception.visibleEntities.find(
      (entity) =>
        entity.id === result.actorId &&
        (entity.kind === "player" || entity.kind === "npc")
    );
    if (!item || !actor) continue;

    if (result.code === "picked_up_item") {
      if (item.heldBy !== result.actorId || actor.heldItemId !== result.targetId) continue;
      changes.push({
        kind: "item_holder_changed",
        itemId: result.targetId,
        previousHolderId: null,
        holderId: result.actorId
      });
      continue;
    }

    if (item.heldBy !== null || actor.heldItemId === result.targetId) continue;
    changes.push({
      kind: "item_holder_changed",
      itemId: result.targetId,
      previousHolderId: result.actorId,
      holderId: null
    });
  }

  return changes;
}
