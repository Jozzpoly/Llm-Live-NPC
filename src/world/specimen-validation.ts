import { equalPriorityLocationAmbiguities } from "./location-membership";
import type { Aabb, ActorEntity, ItemEntity, Vec2, WorldEntity, WorldSpecimen } from "./types";

const FACING_EPSILON = 1e-6;

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
}

function assertFinitePoint(point: Vec2, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} must be finite.`);
  }
}

function assertFiniteAabb(bounds: Aabb, label: string): void {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
    throw new Error(`${label} origin must be finite.`);
  }
  assertFinitePositive(bounds.width, `${label} width`);
  assertFinitePositive(bounds.height, `${label} height`);
}

function assertUniqueIds(entries: readonly { id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) throw new Error(`Duplicate ${label} id: ${entry.id}`);
    seen.add(entry.id);
  }
}

function isActor(entity: WorldEntity | undefined): entity is ActorEntity {
  return entity?.kind === "player" || entity?.kind === "npc";
}

function circleFitsWorld(position: Vec2, radius: number, width: number, height: number): boolean {
  return (
    position.x - radius >= 0 &&
    position.x + radius <= width &&
    position.y - radius >= 0 &&
    position.y + radius <= height
  );
}

function circleHitsExpandedAabb(position: Vec2, radius: number, bounds: Aabb): boolean {
  return (
    position.x > bounds.x - radius &&
    position.x < bounds.x + bounds.width + radius &&
    position.y > bounds.y - radius &&
    position.y < bounds.y + bounds.height + radius
  );
}

function aabbContainsAabb(outer: Aabb, inner: Aabb): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * A held item has no independent collision placement while carried. Its
 * canonical World locality is the holder's locality. Any visual carry offset is
 * presentation-derived and must not change World/perception geometry.
 */
export function heldItemAttachmentPosition(actor: ActorEntity): Vec2 {
  return { ...actor.position };
}

function assertLegalSpawn(
  entity: WorldEntity,
  position: Vec2,
  specimen: WorldSpecimen,
  label: string
): void {
  if (!circleFitsWorld(position, entity.radius, specimen.width, specimen.height)) {
    throw new Error(`${label} footprint must start inside world bounds.`);
  }
  const blocker = specimen.blockers.find((candidate) =>
    circleHitsExpandedAabb(position, entity.radius, candidate.bounds)
  );
  if (blocker) throw new Error(`${label} must not start inside blocker: ${blocker.id}`);
}

export function validateWorldSpecimen(specimen: WorldSpecimen): void {
  assertFinitePositive(specimen.width, "World width");
  assertFinitePositive(specimen.height, "World height");
  assertFinitePositive(specimen.actorSpeed, "World actorSpeed");

  assertUniqueIds(specimen.entities, "entity");
  assertUniqueIds(specimen.blockers, "blocker");
  assertUniqueIds(specimen.locations, "location");
  assertUniqueIds(specimen.placementSites, "placement site");

  const players = specimen.entities.filter((entity) => entity.kind === "player");
  if (players.length !== 1) {
    throw new Error(`World specimen requires exactly one player entity; received ${players.length}.`);
  }

  for (const entity of specimen.entities) {
    assertFinitePoint(entity.position, `Entity ${entity.id} position`);
    assertFinitePositive(entity.radius, `Entity ${entity.id} radius`);
    if (isActor(entity)) {
      assertFinitePoint(entity.facing, `Actor ${entity.id} facing`);
      if (Math.abs(Math.hypot(entity.facing.x, entity.facing.y) - 1) > FACING_EPSILON) {
        throw new Error(`Actor ${entity.id} requires a finite unit facing vector.`);
      }
    }
  }

  for (const blocker of specimen.blockers) assertFiniteAabb(blocker.bounds, `Blocker ${blocker.id}`);
  for (const location of specimen.locations) {
    assertFiniteAabb(location.bounds, `Location ${location.id}`);
    if (!Number.isFinite(location.priority)) {
      throw new Error(`Location ${location.id} priority must be finite.`);
    }
  }
  for (const site of specimen.placementSites) assertFiniteAabb(site.bounds, `Placement site ${site.id}`);

  const ambiguousLocations = equalPriorityLocationAmbiguities(specimen.locations);
  if (ambiguousLocations.length > 0) {
    const [left, right] = ambiguousLocations[0]!;
    throw new Error(
      `Location zones ${left.id} and ${right.id} overlap at equal priority ${left.priority}.`
    );
  }

  const entities = new Map(specimen.entities.map((entity) => [entity.id, entity] as const));
  const actors = specimen.entities.filter(isActor);
  const items = specimen.entities.filter((entity): entity is ItemEntity => entity.kind === "item");
  const heldItemIds = new Set<string>();

  for (const actor of actors) {
    if (!actor.heldItemId) continue;
    if (heldItemIds.has(actor.heldItemId)) {
      throw new Error(`Held item is referenced by more than one actor: ${actor.heldItemId}`);
    }
    heldItemIds.add(actor.heldItemId);

    const item = entities.get(actor.heldItemId);
    if (!item || item.kind !== "item") {
      throw new Error(`Actor ${actor.id} references missing or non-item held entity: ${actor.heldItemId}`);
    }
    if (item.heldBy !== actor.id) {
      throw new Error(`Held ownership mismatch: ${actor.id} -> ${item.id}, but item heldBy is ${item.heldBy ?? "none"}.`);
    }
  }

  for (const item of items) {
    if (!item.heldBy) continue;
    const holder = entities.get(item.heldBy);
    if (!isActor(holder)) {
      throw new Error(`Item ${item.id} references missing or non-actor holder: ${item.heldBy}`);
    }
    if (holder.heldItemId !== item.id) {
      throw new Error(`Held ownership mismatch: ${item.id} -> ${holder.id}, but actor heldItemId is ${holder.heldItemId ?? "none"}.`);
    }
  }

  const blockers = new Map(specimen.blockers.map((blocker) => [blocker.id, blocker] as const));
  for (const site of specimen.placementSites) {
    if (!site.supportBlockerId) continue;
    const support = blockers.get(site.supportBlockerId);
    if (!support) {
      throw new Error(`Placement site ${site.id} references missing support blocker: ${site.supportBlockerId}`);
    }
    if (!aabbContainsAabb(support.bounds, site.bounds)) {
      throw new Error(`Placement site ${site.id} must fit within support blocker: ${site.supportBlockerId}`);
    }
  }

  for (const actor of actors) assertLegalSpawn(actor, actor.position, specimen, `Actor ${actor.id}`);
  for (const item of items) {
    if (!item.heldBy) assertLegalSpawn(item, item.position, specimen, `Free item ${item.id}`);
  }
}
