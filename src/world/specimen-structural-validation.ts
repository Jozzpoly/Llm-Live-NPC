import type { Aabb, ActorEntity, ItemEntity, Vec2, WorldEntity, WorldSpecimen } from "./types";

const FACING_EPSILON = 1e-6;

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative.`);
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
  assertFiniteNonNegative(bounds.width, `${label} width`);
  assertFiniteNonNegative(bounds.height, `${label} height`);
}

function assertUniqueIds(entries: readonly { id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.id.length === 0) {
      throw new Error(`${label[0]!.toUpperCase()}${label.slice(1)} id must not be empty.`);
    }
    if (seen.has(entry.id)) throw new Error(`Duplicate ${label} id: ${entry.id}`);
    seen.add(entry.id);
  }
}

function isActor(entity: WorldEntity | undefined): entity is ActorEntity {
  return entity?.kind === "player" || entity?.kind === "npc";
}

/**
 * Rejects structural corruption relied on by the current World runtime.
 *
 * Deliberately NOT handled here:
 * - whether authored actor/free-item positions are inside legal collision space;
 * - placement-site spatial containment policy;
 * - held-item visual/canonical attachment geometry.
 *
 * Zero-valued speed, radius and AABB extents are admitted deliberately. Recovery
 * evidence showed that the current runtime can represent them coherently; being
 * degenerate or unusual does not by itself make a specimen structurally corrupt.
 *
 * Empty-string IDs/references are rejected because the current runtime uses
 * null/undefined as absence sentinels and also contains truthiness-based guards.
 * Allowing "" would make one value mean both an identifier and "no reference".
 *
 * The current one-player cardinality is a v0 execution-mode constraint because
 * World exposes one singular player-control path. It is not a claim that the
 * future shared-world ontology can contain only one player.
 */
export function validateWorldSpecimenStructure(specimen: WorldSpecimen): void {
  assertFinitePositive(specimen.width, "World width");
  assertFinitePositive(specimen.height, "World height");
  assertFiniteNonNegative(specimen.actorSpeed, "World actorSpeed");

  assertUniqueIds(specimen.entities, "entity");
  assertUniqueIds(specimen.blockers, "blocker");
  assertUniqueIds(specimen.locations, "location");
  assertUniqueIds(specimen.placementSites, "placement site");

  for (const site of specimen.placementSites) {
    if (site.supportBlockerId !== undefined && site.supportBlockerId.length === 0) {
      throw new Error(`Placement site ${site.id} supportBlockerId must not be empty.`);
    }
  }

  const players = specimen.entities.filter((entity) => entity.kind === "player");
  if (players.length !== 1) {
    throw new Error(`Current v0 World runtime requires exactly one player entity; received ${players.length}.`);
  }

  for (const entity of specimen.entities) {
    assertFinitePoint(entity.position, `Entity ${entity.id} position`);
    assertFiniteNonNegative(entity.radius, `Entity ${entity.id} radius`);
    if (isActor(entity)) {
      assertFinitePoint(entity.facing, `Actor ${entity.id} facing`);
      if (Math.abs(Math.hypot(entity.facing.x, entity.facing.y) - 1) > FACING_EPSILON) {
        throw new Error(`Actor ${entity.id} requires a finite unit facing vector.`);
      }
    }
  }

  for (const blocker of specimen.blockers) assertFiniteAabb(blocker.bounds, `Blocker ${blocker.id}`);
  for (const location of specimen.locations) assertFiniteAabb(location.bounds, `Location ${location.id}`);
  for (const site of specimen.placementSites) assertFiniteAabb(site.bounds, `Placement site ${site.id}`);

  const entities = new Map(specimen.entities.map((entity) => [entity.id, entity] as const));
  const actors = specimen.entities.filter(isActor);
  const items = specimen.entities.filter((entity): entity is ItemEntity => entity.kind === "item");
  const claimedItemIds = new Set<string>();

  for (const actor of actors) {
    if (actor.heldItemId === null) continue;

    if (claimedItemIds.has(actor.heldItemId)) {
      throw new Error(`Held item is referenced by more than one actor: ${actor.heldItemId}`);
    }
    claimedItemIds.add(actor.heldItemId);

    const item = entities.get(actor.heldItemId);
    if (!item || item.kind !== "item") {
      throw new Error(`Actor ${actor.id} references missing or non-item held entity: ${actor.heldItemId}`);
    }
    if (item.heldBy !== actor.id) {
      throw new Error(`Held ownership mismatch: ${actor.id} -> ${item.id}, but item heldBy is ${item.heldBy ?? "none"}.`);
    }
  }

  for (const item of items) {
    if (item.heldBy === null) continue;
    const holder = entities.get(item.heldBy);
    if (!isActor(holder)) {
      throw new Error(`Item ${item.id} references missing or non-actor holder: ${item.heldBy}`);
    }
    if (holder.heldItemId !== item.id) {
      throw new Error(`Held ownership mismatch: ${item.id} -> ${holder.id}, but actor heldItemId is ${holder.heldItemId ?? "none"}.`);
    }
  }
}
