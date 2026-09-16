import type { AxisAlignedBounds, SightBlocker, Vec2 } from "./contracts";

export interface SightLineResult {
  clear: boolean;
  blockingIds: readonly string[];
}

/**
 * Immutable authored point-sight geometry.
 *
 * The public seam is intentionally narrower than collision/navigation. World may later replace
 * the internal linear blocker scan with a spatial accelerator without changing perception users.
 */
export class SightGeometry {
  private readonly blockers: readonly SightBlocker[];

  constructor(blockers: readonly SightBlocker[]) {
    this.blockers = normalizeBlockers(blockers);
  }

  query(start: Vec2, end: Vec2): SightLineResult {
    assertFinitePoint(start, "sight start");
    assertFinitePoint(end, "sight end");
    const blockingIds = this.blockers
      .filter((blocker) => segmentIntersectsAabbInteriorValidated(start, end, blocker.bounds))
      .map((blocker) => blocker.id);
    return { clear: blockingIds.length === 0, blockingIds };
  }

  hasLineOfSight(start: Vec2, end: Vec2): boolean {
    return this.query(start, end).clear;
  }
}

/**
 * Convenience query for isolated tests/callers. Runtime World should retain one SightGeometry
 * instance rather than rebuilding authored geometry for every ray.
 */
export function querySightLine(
  start: Vec2,
  end: Vec2,
  blockers: readonly SightBlocker[],
): SightLineResult {
  return new SightGeometry(blockers).query(start, end);
}

export function hasGeometricLineOfSight(
  start: Vec2,
  end: Vec2,
  blockers: readonly SightBlocker[],
): boolean {
  return new SightGeometry(blockers).hasLineOfSight(start, end);
}

/**
 * A blocker occludes when the closed query segment has a non-empty intersection with the
 * blocker's OPEN interior. Pure tangency against an edge/corner is therefore clear, while
 * entering the interior from a boundary point is blocked.
 */
export function segmentIntersectsAabbInterior(
  start: Vec2,
  end: Vec2,
  bounds: AxisAlignedBounds,
): boolean {
  assertFinitePoint(start, "segment start");
  assertFinitePoint(end, "segment end");
  assertValidBounds(bounds, "segment bounds");
  return segmentIntersectsAabbInteriorValidated(start, end, bounds);
}

function segmentIntersectsAabbInteriorValidated(
  start: Vec2,
  end: Vec2,
  bounds: AxisAlignedBounds,
): boolean {
  const x = openAxisInterval(start.x, end.x - start.x, bounds.minX, bounds.maxX);
  if (!x) return false;
  const y = openAxisInterval(start.y, end.y - start.y, bounds.minY, bounds.maxY);
  if (!y) return false;

  const lower = Math.max(0, x[0], y[0]);
  const upper = Math.min(1, x[1], y[1]);
  return lower < upper;
}

function normalizeBlockers(blockers: readonly SightBlocker[]): readonly SightBlocker[] {
  const seenIds = new Set<string>();
  const normalized = blockers.map((blocker) => {
    if (typeof blocker.id !== "string" || blocker.id.trim().length === 0) {
      throw new Error("sight blocker id must be non-empty");
    }
    if (seenIds.has(blocker.id)) throw new Error(`duplicate sight blocker id: ${blocker.id}`);
    seenIds.add(blocker.id);
    assertValidBounds(blocker.bounds, blocker.id);
    return {
      id: blocker.id,
      label: blocker.label,
      bounds: { ...blocker.bounds },
    };
  });
  normalized.sort((a, b) => a.id.localeCompare(b.id));
  return normalized;
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
