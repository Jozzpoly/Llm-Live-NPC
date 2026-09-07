import type { LocationZone, Vec2 } from "./types";

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
 * Returns the current singular primary-location projection without treating
 * overlapping zones as exclusive membership. Authored primaryPriority is the
 * semantic discriminator; ID is only a deterministic total fallback for ties.
 * Array order never carries semantic meaning.
 */
export function resolvePrimaryLocation(
  locations: readonly LocationZone[],
  point: Vec2
): LocationZone | null {
  let selected: LocationZone | null = null;

  for (const location of locations) {
    if (!locationContainsPoint(location, point)) continue;
    if (
      selected === null ||
      location.primaryPriority > selected.primaryPriority ||
      (location.primaryPriority === selected.primaryPriority && location.id.localeCompare(selected.id) < 0)
    ) {
      selected = location;
    }
  }

  return selected;
}
