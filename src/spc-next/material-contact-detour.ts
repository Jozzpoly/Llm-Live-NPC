import type { Vec2, WorldBounds } from "./contracts";
import { MATERIAL_BODY_RADIUS } from "./material-body-contact";

/**
 * A bounded, motor-level bypass for a body that has ACTUALLY touched an obstacle.
 * The caller provides only the touched circle, never the World material catalog.
 * This changes HOW an already-authorized destination is pursued, not WHY.
 */
export interface TouchedMaterialContact {
  readonly position: Vec2;
  readonly radius: number;
}

export function planTouchedMaterialDetour(
  body: Vec2,
  destination: Vec2,
  contact: TouchedMaterialContact,
  bounds: WorldBounds,
): readonly Vec2[] | null {
  const dx = destination.x - body.x;
  const dy = destination.y - body.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const forward = { x: dx / length, y: dy / length };
  const side = { x: -forward.y, y: forward.x };
  const r = contact.radius + MATERIAL_BODY_RADIUS + 14;
  const clearance = contact.radius + MATERIAL_BODY_RADIUS + 2;

  // The goal is inside the obstructing body's clearance volume. A motor
  // bypass cannot make it reachable and must not claim semantic success.
  if (Math.hypot(destination.x - contact.position.x, destination.y - contact.position.y) < clearance)
    return null;

  const possible: Vec2[][] = [];
  for (const sign of [1, -1]) {
    const offset = (x: number, y: number): Vec2 => ({
      x: contact.position.x + forward.x * x + side.x * y,
      y: contact.position.y + forward.y * x + side.y * y,
    });
    const near = offset(-r, sign * r);
    const far = offset(r, sign * r);
    if (![near, far].every((p) => pointFits(p, bounds, MATERIAL_BODY_RADIUS))) continue;
    // An endpoint on an obstacle can be reached only through physical contact;
    // do not manufacture a path that cuts straight through the touched circle.
    if (!segmentClear(body, near, contact, clearance)
      || !segmentClear(near, far, contact, clearance)
      || !segmentClear(far, destination, contact, clearance)) continue;
    possible.push([near, far]);
  }
  if (!possible.length) return null;
  possible.sort((a, b) => pathLength(body, a, destination) - pathLength(body, b, destination));
  return possible[0]!.map((p) => ({ ...p }));
}

function segmentClear(a: Vec2, b: Vec2, contact: TouchedMaterialContact, clearance: number): boolean {
  const d = { x: b.x - a.x, y: b.y - a.y };
  const denominator = d.x * d.x + d.y * d.y;
  if (denominator < 1e-12) return true;
  const projection = ((contact.position.x - a.x) * d.x
    + (contact.position.y - a.y) * d.y) / denominator;
  const t = Math.min(1, Math.max(0, projection));
  const x = a.x + d.x * t - contact.position.x;
  const y = a.y + d.y * t - contact.position.y;
  return x*x + y*y >= clearance*clearance - 1e-6;
}

function pointFits(p: Vec2, b: WorldBounds, radius: number): boolean {
  return p.x >= b.minX + radius && p.x <= b.maxX - radius
    && p.y >= b.minY + radius && p.y <= b.maxY - radius;
}

function pathLength(body: Vec2, points: readonly Vec2[], destination: Vec2): number {
  let length = 0, last = body;
  for (const p of [...points, destination]) {
    length += Math.hypot(p.x - last.x, p.y - last.y);
    last = p;
  }
  return length;
}
