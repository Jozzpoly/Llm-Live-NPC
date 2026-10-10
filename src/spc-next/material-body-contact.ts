import type { Vec2 } from "./contracts";
import type { MaterialObjectState } from "./material-world-state";

/**
 * Experimental, opt-in physical contact with World-owned material objects.
 * The circle radius is the collision envelope of a resident/player body in the
 * pre-Luna workshop slice; this is NOT a global simulation of body morphology.
 * Free objects obstruct; held objects travel with their holder and do not.
 */
export const MATERIAL_BODY_RADIUS = 18;

/** Opt-in rough embodied burden: carrying a real crate reduces resolved speed. */
export const MATERIAL_CARRY_SPEED_FACTOR = 0.68;

/**
 * UI-side placement suggestion along the actor's PHYSICAL facing.
 * This is not permission to place: World still validates range, sight,
 * other bodies and material. A rejected placement leaves possession intact.
 */
export function facingRelativePlacement(
  position: Vec2,
  facing: Vec2,
  offset: number,
): Vec2 {
  if (![position.x, position.y, facing.x, facing.y, offset].every(Number.isFinite)
    || offset <= 0) throw new Error("invalid facing-relative placement");
  const length = Math.hypot(facing.x, facing.y);
  if (length <= 1e-9) throw new Error("cannot place relative to zero facing");
  return {
    x: position.x + offset * facing.x / length,
    y: position.y + offset * facing.y / length,
  };
}

/**
 * The player-facing proposal must clear the holder's physical body even for
 * large objects. The World still adjudicates the range, line of sight and
 * occupancy; this only chooses a geometrically plausible candidate.
 */
export function suggestBodyClearMaterialPlacement(
  position: Vec2,
  facing: Vec2,
  objectRadius: number,
  minimumOffset = 42,
): Vec2 {
  if (!Number.isFinite(objectRadius) || objectRadius <= 0
    || !Number.isFinite(minimumOffset) || minimumOffset <= 0)
    throw new Error("invalid material clearance");
  return facingRelativePlacement(
    position, facing, Math.max(minimumOffset, objectRadius + MATERIAL_BODY_RADIUS + 6),
  );
}

const EPSILON = 1e-5;
const BACKOFF = 1e-4;

export interface MaterialMotionResult {
  position: Vec2;
  blockedByObjectId: string | null;
}

/**
 * Swept circle contact in World coordinates with one conservative tangent
 * adjustment. This prevents tunnelling even under a high-speed test impulse.
 * No physical impulse is invented and no material object is pushed implicitly.
 */
export function resolveMaterialBodyMotion(
  before: Vec2,
  desired: Vec2,
  objects: readonly MaterialObjectState[],
  bodyRadius = MATERIAL_BODY_RADIUS,
): MaterialMotionResult {
  if (![before.x, before.y, desired.x, desired.y, bodyRadius].every(Number.isFinite)
    || bodyRadius < 0) throw new Error("invalid material body motion");
  const free = objects.filter((object) => object.location.kind === "free");
  const first = earliestContact(before, desired, free, bodyRadius);
  if (!first) return { position: { ...desired }, blockedByObjectId: null };

  const delta = subtract(desired, before);
  const position = add(before, scale(delta, Math.max(0, first.time - BACKOFF)));
  const remainder = subtract(desired, position);
  const normal = unit(subtract(position, first.center));
  const inward = Math.min(0, dot(remainder, normal));
  const slide = subtract(remainder, scale(normal, inward));
  const slideTarget = add(position, slide);
  const second = earliestContact(position, slideTarget, free, bodyRadius);
  const finalPosition = second
    ? add(position, scale(slide, Math.max(0, second.time - BACKOFF)))
    : slideTarget;
  return { position: finalPosition, blockedByObjectId: first.objectId };
}

function earliestContact(
  before: Vec2,
  desired: Vec2,
  free: readonly MaterialObjectState[],
  bodyRadius: number,
): { time: number; objectId: string; center: Vec2 } | null {
  const delta = subtract(desired, before);
  const a = dot(delta, delta);
  if (a < EPSILON * EPSILON) return null;
  let best: { time: number; objectId: string; center: Vec2 } | null = null;
  for (const object of free) {
    if (object.location.kind !== "free") continue;
    const center = object.location.position;
    const relative = subtract(before, center);
    const radius = object.radius + bodyRadius;
    const c = dot(relative, relative) - radius * radius;
    // No entrapment due to stale/legacy overlapping geometry; outward escape
    // is allowed. New opt-in placement rejects overlap before it happens.
    if (c < -EPSILON) continue;
    const b = 2 * dot(relative, delta);
    if (c <= EPSILON && b >= -EPSILON) continue;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) continue;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (t < -EPSILON || t > 1) continue;
    const time = Math.max(0, t);
    if (!best || time < best.time - EPSILON
      || Math.abs(time - best.time) <= EPSILON && object.id < best.objectId) {
      best = { time, objectId: object.id, center: { ...center } };
    }
  }
  return best;
}

/** Authoritative placement must not materialize an object inside a body. */
export function materialPlacementOverlapsBody(
  position: Vec2,
  radius: number,
  actorPositions: readonly Vec2[],
  bodyRadius = MATERIAL_BODY_RADIUS,
): boolean {
  return actorPositions.some((actor) => squaredDistance(position, actor) <
    (radius + bodyRadius) ** 2 - EPSILON);
}

/** Authoritative placement must not stack two nominally solid free objects. */
export function materialPlacementOverlapsObject(
  position: Vec2,
  radius: number,
  objects: readonly MaterialObjectState[],
  excludingObjectId: string,
): boolean {
  return objects.some((other) =>
    other.id !== excludingObjectId
    && other.location.kind === "free"
    && squaredDistance(position, other.location.position) <
       (radius + other.radius) ** 2 - EPSILON);
}

function squaredDistance(a: Vec2, b: Vec2): number {
  const x = a.x - b.x, y = a.y - b.y;
  return x * x + y * y;
}
function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
function subtract(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
function scale(a: Vec2, scalar: number): Vec2 { return { x: a.x * scalar, y: a.y * scalar }; }
function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
function unit(a: Vec2): Vec2 {
  const len = Math.hypot(a.x, a.y);
  if (len < EPSILON) return { x: 1, y: 0 };
  return scale(a, 1 / len);
}
