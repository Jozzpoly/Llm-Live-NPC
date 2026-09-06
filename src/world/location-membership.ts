import type { Aabb, LocationZone, Vec2 } from "./types";

export function locationContainsPoint(location: LocationZone, point: Vec2): boolean {
  const bounds = location.bounds;
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * Location identity is singular in the current substrate. Overlap is legal,
 * but authored priority is the semantic discriminator; array order is never a
 * priority channel. The id tie-break keeps this helper total for defensive
 * callers, while WorldSpecimen validation rejects equal-priority overlaps.
 */
export function resolveLocationZone(
  locations: readonly LocationZone[],
  point: Vec2
): LocationZone | null {
  return (
    locations
      .filter((location) => locationContainsPoint(location, point))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null
  );
}

export function aabbsIntersectInclusively(a: Aabb, b: Aabb): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

export function equalPriorityLocationAmbiguities(
  locations: readonly LocationZone[]
): Array<[LocationZone, LocationZone]> {
  const ambiguities: Array<[LocationZone, LocationZone]> = [];
  for (let leftIndex = 0; leftIndex < locations.length; leftIndex += 1) {
    const left = locations[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < locations.length; rightIndex += 1) {
      const right = locations[rightIndex]!;
      if (left.priority !== right.priority) continue;
      if (!aabbsIntersectInclusively(left.bounds, right.bounds)) continue;
      ambiguities.push([left, right]);
    }
  }
  return ambiguities;
}
