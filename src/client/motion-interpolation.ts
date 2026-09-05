import type { Vec2, WorldSnapshot } from "../world/types";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
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
  const previousById = new Map(previous.entities.map((entity) => [entity.id, entity.position]));
  const positions = new Map<string, Vec2>();

  for (const entity of current.entities) {
    const previousPosition = previousById.get(entity.id);
    positions.set(
      entity.id,
      previousPosition ? interpolatePosition(previousPosition, entity.position, alpha) : { ...entity.position }
    );
  }

  return positions;
}
