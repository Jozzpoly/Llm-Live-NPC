import type { Vec2, WorldSnapshot } from "../world/types";
import type { KnownEntity } from "./types";
import type { HeardCall } from "./perception";

type FamiliarMap = Pick<WorldSnapshot, "width" | "height" | "blockers" | "locations">;
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Candidates depend on remembered evidence and the familiar static map, never live target coordinates. */
export function searchViewpoints(map: FamiliarMap, memory: KnownEntity, radius: number, cue?: HeardCall): Vec2[] {
  const anchor = cue ? {
    x: cue.listenerPosition.x + cue.direction.x * (cue.distanceBand === "near" ? 110 : 280),
    y: cue.listenerPosition.y + cue.direction.y * (cue.distanceBand === "near" ? 110 : 280)
  } : memory.position;
  const candidates: Vec2[] = [{ ...anchor }];
  if (!cue && memory.observedMotion && Math.hypot(memory.observedMotion.x, memory.observedMotion.y) > 0.1) {
    const length = Math.hypot(memory.observedMotion.x, memory.observedMotion.y);
    candidates.push({ x: anchor.x + memory.observedMotion.x / length * 120, y: anchor.y + memory.observedMotion.y / length * 120 });
  }
  const nearby: Vec2[] = [];
  for (const blocker of map.blockers) {
    if (!blocker.occludesVision) continue;
    const b = blocker.bounds, margin = radius + 14;
    for (const x of [b.x - margin, b.x + b.width + margin]) {
      for (const y of [b.y - margin, b.y + b.height + margin]) {
        if (distance(anchor, { x, y }) <= 480) nearby.push({ x, y });
      }
    }
  }
  for (let i = 0; i < 8; i++) nearby.push({ x: anchor.x + Math.cos(i * Math.PI / 4) * 210, y: anchor.y + Math.sin(i * Math.PI / 4) * 210 });
  nearby.sort((a, b) => distance(a, anchor) - distance(b, anchor));
  candidates.push(...nearby);
  for (const place of [...map.locations].sort((a, b) => distance(a.bounds, anchor) - distance(b.bounds, anchor))) {
    candidates.push({ x: place.bounds.x + place.bounds.width / 2, y: place.bounds.y + place.bounds.height / 2 });
  }
  return candidates.filter((p, index) => p.x >= radius && p.y >= radius && p.x <= map.width - radius && p.y <= map.height - radius &&
    !map.blockers.some(({ bounds: b }) => p.x >= b.x - radius && p.x <= b.x + b.width + radius && p.y >= b.y - radius && p.y <= b.y + b.height + radius) &&
    !candidates.slice(0, index).some(previous => distance(previous, p) < 40)).slice(0, 28);
}
