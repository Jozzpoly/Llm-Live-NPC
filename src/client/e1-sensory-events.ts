import {
  projectE1Perception,
  type E1ObservedChange
} from "../agent/e1-grounding";
import type { ExecutionSemanticActionOccurrence } from "../execution/execution-driver";
import type { EntityId, Vec2 } from "../world/types";

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
