import type { ActorEntity, Vec2, WorldEntity, WorldSnapshot } from "../world/types";

const HELD_ITEM_PRESENTATION_OFFSET = 10;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isActor(entity: WorldEntity | undefined): entity is ActorEntity {
  return entity?.kind === "player" || entity?.kind === "npc";
}

function presentationPosition(snapshot: WorldSnapshot, entity: WorldEntity): Vec2 {
  if (entity.kind !== "item" || entity.heldBy === null) return { ...entity.position };

  const holder = snapshot.entities.find((candidate) => candidate.id === entity.heldBy);
  if (!isActor(holder)) return { ...entity.position };

  return {
    x: holder.position.x,
    y: holder.position.y - holder.radius - HELD_ITEM_PRESENTATION_OFFSET
  };
}

function presentationPositions(snapshot: WorldSnapshot): Map<string, Vec2> {
  return new Map(snapshot.entities.map((entity) => [entity.id, presentationPosition(snapshot, entity)]));
}

export function interpolationAlpha(accumulatorMs: number, fixedStepMs: number): number {
  if (!Number.isFinite(accumulatorMs) || !Number.isFinite(fixedStepMs) || fixedStepMs <= 0) return 0;
  return clamp01(accumulatorMs / fixedStepMs);
}

export function interpolatePosition(previous: Vec2, current: Vec2, alpha: number): Vec2 {
  const t = clamp01(alpha);
  return {
    x: previous.x + (current.x - previous.x) * t,
    y: previous.y + (current.y - previous.y) * t
  };
}

export function resolveInterpolatedEntityPositions(
  previous: WorldSnapshot,
  current: WorldSnapshot,
  alpha: number
): Map<string, Vec2> {
  const previousById = presentationPositions(previous);
  const currentById = presentationPositions(current);
  const positions = new Map<string, Vec2>();

  for (const entity of current.entities) {
    const currentPosition = currentById.get(entity.id) ?? entity.position;
    const previousPosition = previousById.get(entity.id);
    positions.set(
      entity.id,
      previousPosition ? interpolatePosition(previousPosition, currentPosition, alpha) : { ...currentPosition }
    );
  }

  return positions;
}
