import type { Aabb, Vec2, WorldSnapshot } from "../world/types";

type NavigationWorld = Pick<WorldSnapshot, "width" | "height" | "blockers">;
const CLEARANCE = 0.5;
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function contains(box: Aabb, p: Vec2): boolean {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

function crossesBox(a: Vec2, b: Vec2, box: Aabb): boolean {
  let enter = 0;
  let leave = 1;
  for (const [origin, delta, lo, hi] of [
    [a.x, b.x - a.x, box.x, box.x + box.width],
    [a.y, b.y - a.y, box.y, box.y + box.height]
  ]) {
    if (Math.abs(delta) < 1e-10) {
      if (origin < lo || origin > hi) return false;
      continue;
    }
    const t1 = (lo - origin) / delta;
    const t2 = (hi - origin) / delta;
    enter = Math.max(enter, Math.min(t1, t2));
    leave = Math.min(leave, Math.max(t1, t2));
    if (enter > leave) return false;
  }
  return true;
}

/**
 * Route for an actor's centre through the existing rectangular World geometry.
 * Returns waypoints excluding start, including goal, or null for no legal route.
 * This only plans geometry: movement, timing and outcomes remain owned by World.
 * Plan on a new destination or changed obstacle layout, not every render frame.
 */
export function findNavigationPath(world: NavigationWorld, start: Vec2, goal: Vec2, radius: number): Vec2[] | null {
  if (![start.x, start.y, goal.x, goal.y, radius].every(Number.isFinite) || radius < 0) return null;
  const boxes = world.blockers.map(({ bounds: b }) => ({
    x: b.x - radius, y: b.y - radius,
    width: b.width + 2 * radius, height: b.height + 2 * radius
  }));
  const legal = (p: Vec2) => p.x >= radius && p.y >= radius &&
    p.x <= world.width - radius && p.y <= world.height - radius && !boxes.some(b => contains(b, p));
  const visible = (a: Vec2, b: Vec2) => !boxes.some(box => crossesBox(a, b, box));
  if (!legal(start) || !legal(goal)) return null;
  if (visible(start, goal)) return [{ ...goal }];

  // A visibility graph is small for the authored World. Inflated obstacles keep
  // the actor's full footprint outside walls; the extra clearance avoids grazing.
  const nodes: Vec2[] = [{ ...start }, { ...goal }];
  for (const b of boxes) {
    for (const x of [b.x - CLEARANCE, b.x + b.width + CLEARANCE]) {
      for (const y of [b.y - CLEARANCE, b.y + b.height + CLEARANCE]) {
        const p = { x, y };
        if (legal(p)) nodes.push(p);
      }
    }
  }
  const costs = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const closed = new Set<number>();
  costs[0] = 0;
  while (closed.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (!closed.has(i) && (current === -1 || costs[i] < costs[current])) current = i;
    }
    if (current === -1 || !Number.isFinite(costs[current])) return null;
    if (current === 1) {
      const route: Vec2[] = [];
      for (let i = 1; i !== 0; i = previous[i]) route.unshift({ ...nodes[i] });
      return route;
    }
    closed.add(current);
    for (let next = 0; next < nodes.length; next++) {
      if (closed.has(next) || !visible(nodes[current], nodes[next])) continue;
      const candidate = costs[current] + distance(nodes[current], nodes[next]);
      if (candidate < costs[next]) { costs[next] = candidate; previous[next] = current; }
    }
  }
  return null;
}
