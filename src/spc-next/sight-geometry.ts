import type { AxisAlignedBounds, SightBlocker, Vec2 } from "./contracts";

export interface SightLineResult {
  clear: boolean;
  blockingIds: readonly string[];
}

/**
 * Answers only geometric point-to-point visibility through authored opaque AABBs.
 * It deliberately knows nothing about sight radius, facing, actor bodies, collision or navigation.
 *
 * A blocker occludes when the closed query segment has a non-empty intersection with the
 * blocker's OPEN interior. Pure tangency against an edge/corner is therefore clear, while
 * entering the interior from a boundary point is blocked.
 */
export function querySightLine(
  start: Vec2,
  end: Vec2,
  blockers: readonly SightBlocker[],
): SightLineResult {
  assertFinitePoint(start, "sight start");
  assertFinitePoint(end, "sight end");

  const seenIds = new Set<string>();
  const validated = blockers.map((blocker) => {
    if (typeof blocker.id !== "string" || blocker.id.trim().length === 0) {
      throw new Error("sight blocker id must be non-empty");
    }
    if (seenIds.has(blocker.id)) throw new Error(`duplicate sight blocker id: ${blocker.id}`);
    seenIds.add(blocker.id);
    assertValidBounds(blocker.bounds, blocker.id);
    return blocker;
  }).sort((a, b) => a.id.localeCompare(b.id));

  const blockingIds = validated
    .filter((blocker) => segmentIntersectsAabbInterior(start, end, blocker.bounds))
    .map((blocker) => blocker.id);

  return { clear: blockingIds.length === 0, blockingIds };
}

export function hasGeometricLineOfSight(
  start: Vec2,
  end: Vec2,
  blockers: readonly SightBlocker[],
): boolean {
  return querySightLine(start, end, blockers).clear;
}

export function segmentIntersectsAabbInterior(
  start: Vec2,
  end: Vec2,
  bounds: AxisAlignedBounds,
): boolean {
  assertFinitePoint(start, "segment start");
  assertFinitePoint(end, "segment end");
  assertValidBounds(bounds, "segment bounds");

  const x = openAxisInterval(start.x, end.x - start.x, bounds.minX, bounds.maxX);
  if (!x) return false;
  const y = openAxisInterval(start.y, end.y - start.y, bounds.minY, bounds.maxY);
  if (!y) return false;

  const lower = Math.max(0, x[0], y[0]);
  const upper = Math.min(1, x[1], y[1]);
  return lower < upper;
}

function openAxisInterval(
  start: number,
  delta: number,
  min: number,
  max: number,
): readonly [number, number] | null {
  if (delta === 0) {
    return start > min && start < max
      ? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      : null;
  }
  const first = (min - start) / delta;
  const second = (max - start) / delta;
  return first < second ? [first, second] : [second, first];
}

function assertFinitePoint(point: Vec2, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} must be finite`);
  }
}

function assertValidBounds(bounds: AxisAlignedBounds, label: string): void {
  const coordinates = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
  if (!coordinates.every(Number.isFinite)) throw new Error(`${label} bounds must be finite`);
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) {
    throw new Error(`${label} bounds must have positive area`);
  }
}
