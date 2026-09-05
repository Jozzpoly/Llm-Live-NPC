import type {
  Aabb,
  EntityId,
  ItemEntity,
  LocationId,
  PlacementSite,
  PlacementTargetValidation,
  PlayerEntity,
  Vec2,
  WorldActionResult,
  WorldEntity,
  WorldEvent,
  WorldInput,
  WorldSnapshot,
  WorldSpecimen
} from "./types";

const DEFAULT_STEP_SECONDS = 1 / 30;
const INTERACTION_RANGE = 54;
const EVENT_LIMIT = 128;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function containsPoint(bounds: Aabb, point: Vec2): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function circleFitsWithinAabb(point: Vec2, radius: number, bounds: Aabb): boolean {
  return (
    point.x - radius >= bounds.x &&
    point.x + radius <= bounds.x + bounds.width &&
    point.y - radius >= bounds.y &&
    point.y + radius <= bounds.y + bounds.height
  );
}

function pointHitsExpandedAabb(point: Vec2, radius: number, bounds: Aabb): boolean {
  return (
    point.x > bounds.x - radius &&
    point.x < bounds.x + bounds.width + radius &&
    point.y > bounds.y - radius &&
    point.y < bounds.y + bounds.height + radius
  );
}

function segmentIntersectsAabb(start: Vec2, end: Vec2, bounds: Aabb): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let tMin = 0;
  let tMax = 1;

  const checks: Array<[number, number]> = [
    [-dx, start.x - bounds.x],
    [dx, bounds.x + bounds.width - start.x],
    [-dy, start.y - bounds.y],
    [dy, bounds.y + bounds.height - start.y]
  ];

  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }

    const ratio = q / p;
    if (p < 0) {
      if (ratio > tMax) return false;
      tMin = Math.max(tMin, ratio);
    } else {
      if (ratio < tMin) return false;
      tMax = Math.min(tMax, ratio);
    }
  }

  return tMin <= tMax;
}

export class World {
  readonly width: number;
  readonly height: number;
  readonly playerSpeed: number;

  private readonly entities = new Map<EntityId, WorldEntity>();
  private readonly blockers: WorldSpecimen["blockers"];
  private readonly locations: WorldSpecimen["locations"];
  private readonly placementSites: WorldSpecimen["placementSites"];
  private readonly eventLog: WorldEvent[] = [];
  private tickValue = 0;
  private eventSequence = 0;
  private actionSequence = 0;
  private lastActionResultValue: WorldActionResult | null = null;
  private playerLocationIdValue: LocationId | null = null;

  constructor(specimen: WorldSpecimen) {
    this.width = specimen.width;
    this.height = specimen.height;
    this.playerSpeed = specimen.playerSpeed;
    this.blockers = structuredClone(specimen.blockers);
    this.locations = structuredClone(specimen.locations);
    this.placementSites = structuredClone(specimen.placementSites);

    const blockerIds = new Set(this.blockers.map((blocker) => blocker.id));
    for (const site of this.placementSites) {
      if (site.supportBlockerId && !blockerIds.has(site.supportBlockerId)) {
        throw new Error(`Placement site ${site.id} references missing support blocker: ${site.supportBlockerId}`);
      }
    }

    for (const entity of structuredClone(specimen.entities)) {
      if (this.entities.has(entity.id)) throw new Error(`Duplicate entity id: ${entity.id}`);
      this.entities.set(entity.id, entity);
    }

    this.player();
    this.emit({ type: "world.started", message: "P1 world specimen initialized." });
    const initialLocation = this.resolveLocation(this.player().position);
    this.playerLocationIdValue = initialLocation?.id ?? null;
    if (initialLocation) {
      this.emit({
        type: "location.entered",
        actorId: this.player().id,
        locationId: initialLocation.id,
        message: `${this.player().label} entered ${initialLocation.label}.`
      });
    }
  }

  get tick(): number {
    return this.tickValue;
  }

  get playerLocationId(): LocationId | null {
    return this.playerLocationIdValue;
  }

  step(input: WorldInput, seconds = DEFAULT_STEP_SECONDS): void {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 0.25) {
      throw new Error(`Invalid world step duration: ${seconds}`);
    }

    this.tickValue += 1;
    this.movePlayer(input, seconds);
    this.followHeldItem();
    this.updatePlayerLocation();

    if (input.dropPressed) this.dropHeldItem();
    if (input.interactPressed) this.interact();
  }

  snapshot(): WorldSnapshot {
    return {
      tick: this.tickValue,
      width: this.width,
      height: this.height,
      entities: [...this.entities.values()]
        .map((entity) => structuredClone(entity))
        .sort((a, b) => a.id.localeCompare(b.id)),
      blockers: structuredClone(this.blockers),
      locations: structuredClone(this.locations),
      placementSites: structuredClone(this.placementSites).sort((a, b) => a.id.localeCompare(b.id)),
      playerLocationId: this.playerLocationIdValue
    };
  }

  recentEvents(limit = 12): WorldEvent[] {
    return this.eventLog.slice(-Math.max(0, limit)).map((event) => ({ ...event }));
  }

  lastActionResult(): WorldActionResult | null {
    return this.lastActionResultValue ? { ...this.lastActionResultValue } : null;
  }

  placementSitesAt(position: Vec2): PlacementSite[] {
    return this.placementSites
      .filter((site) => containsPoint(site.bounds, position))
      .map((site) => structuredClone(site))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  validatePlacementTarget(itemId: EntityId, position: Vec2): PlacementTargetValidation {
    const target = { x: position.x, y: position.y };
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      return { status: "rejected", itemId, position: target, code: "invalid_position" };
    }

    const entity = this.entities.get(itemId);
    if (!entity || entity.kind !== "item") {
      return { status: "rejected", itemId, position: target, code: "item_not_found" };
    }

    if (
      target.x - entity.radius < 0 ||
      target.x + entity.radius > this.width ||
      target.y - entity.radius < 0 ||
      target.y + entity.radius > this.height
    ) {
      return { status: "rejected", itemId, position: target, code: "outside_world" };
    }

    const candidateSites = this.placementSitesAt(target);
    if (candidateSites.length > 1) {
      return {
        status: "rejected",
        itemId,
        position: target,
        code: "ambiguous_site",
        candidateSiteIds: candidateSites.map((site) => site.id)
      };
    }

    const site = candidateSites[0];
    if (site) {
      if (!circleFitsWithinAabb(target, entity.radius, site.bounds)) {
        return {
          status: "rejected",
          itemId,
          position: target,
          code: "item_does_not_fit_site",
          candidateSiteIds: [site.id]
        };
      }

      const blockingBlockerIds = this.blockingBlockerIds(target, entity.radius, site.supportBlockerId);
      if (blockingBlockerIds.length > 0) {
        return {
          status: "rejected",
          itemId,
          position: target,
          code: "blocked",
          candidateSiteIds: [site.id],
          blockingBlockerIds
        };
      }

      return {
        status: "accepted",
        itemId,
        position: target,
        support: { kind: "site", siteId: site.id, relation: site.relation }
      };
    }

    const blockingBlockerIds = this.blockingBlockerIds(target, entity.radius);
    if (blockingBlockerIds.length > 0) {
      return {
        status: "rejected",
        itemId,
        position: target,
        code: "blocked",
        blockingBlockerIds
      };
    }

    return {
      status: "accepted",
      itemId,
      position: target,
      support: { kind: "ground", relation: "on" }
    };
  }

  hasLineOfSight(start: Vec2, end: Vec2): boolean {
    return !this.blockers.some(
      (blocker) => blocker.occludesVision && segmentIntersectsAabb(start, end, blocker.bounds)
    );
  }

  private blockingBlockerIds(position: Vec2, radius: number, ignoredBlockerId?: string): string[] {
    return this.blockers
      .filter((blocker) => blocker.id !== ignoredBlockerId)
      .filter((blocker) => pointHitsExpandedAabb(position, radius, blocker.bounds))
      .map((blocker) => blocker.id)
      .sort((a, b) => a.localeCompare(b));
  }

  private player(): PlayerEntity {
    const player = [...this.entities.values()].find((entity): entity is PlayerEntity => entity.kind === "player");
    if (!player) throw new Error("P1 world specimen requires one player entity.");
    return player;
  }

  private movePlayer(input: WorldInput, seconds: number): void {
    const player = this.player();
    const magnitude = Math.hypot(input.moveX, input.moveY);
    if (magnitude <= 0) return;

    const normalizedX = input.moveX / Math.max(1, magnitude);
    const normalizedY = input.moveY / Math.max(1, magnitude);
    const dx = normalizedX * this.playerSpeed * seconds;
    const dy = normalizedY * this.playerSpeed * seconds;

    let x = clamp(player.position.x + dx, player.radius, this.width - player.radius);
    for (const blocker of this.blockers) {
      if (!pointHitsExpandedAabb({ x, y: player.position.y }, player.radius, blocker.bounds)) continue;
      if (dx > 0) x = Math.min(x, blocker.bounds.x - player.radius);
      if (dx < 0) x = Math.max(x, blocker.bounds.x + blocker.bounds.width + player.radius);
    }

    let y = clamp(player.position.y + dy, player.radius, this.height - player.radius);
    for (const blocker of this.blockers) {
      if (!pointHitsExpandedAabb({ x, y }, player.radius, blocker.bounds)) continue;
      if (dy > 0) y = Math.min(y, blocker.bounds.y - player.radius);
      if (dy < 0) y = Math.max(y, blocker.bounds.y + blocker.bounds.height + player.radius);
    }

    player.position.x = clamp(x, player.radius, this.width - player.radius);
    player.position.y = clamp(y, player.radius, this.height - player.radius);
  }

  private followHeldItem(): void {
    const player = this.player();
    if (!player.heldItemId) return;
    const item = this.entities.get(player.heldItemId);
    if (!item || item.kind !== "item") throw new Error(`Held item missing: ${player.heldItemId}`);
    item.position.x = player.position.x;
    item.position.y = player.position.y - player.radius - 10;
  }

  private updatePlayerLocation(): void {
    const player = this.player();
    const nextLocation = this.resolveLocation(player.position);
    const nextId = nextLocation?.id ?? null;
    if (nextId === this.playerLocationIdValue) return;

    if (this.playerLocationIdValue) {
      const previous = this.locations.find((location) => location.id === this.playerLocationIdValue);
      this.emit({
        type: "location.exited",
        actorId: player.id,
        locationId: this.playerLocationIdValue,
        message: `${player.label} left ${previous?.label ?? this.playerLocationIdValue}.`
      });
    }

    this.playerLocationIdValue = nextId;
    if (nextLocation) {
      this.emit({
        type: "location.entered",
        actorId: player.id,
        locationId: nextLocation.id,
        message: `${player.label} entered ${nextLocation.label}.`
      });
    }
  }

  private resolveLocation(position: Vec2) {
    return this.locations.find((location) => containsPoint(location.bounds, position));
  }

  private interact(): void {
    const player = this.player();
    const rangeSq = INTERACTION_RANGE * INTERACTION_RANGE;

    if (!player.heldItemId) {
      const nearestItem = [...this.entities.values()]
        .filter((entity): entity is ItemEntity => entity.kind === "item" && entity.heldBy === null)
        .filter((item) => distanceSquared(player.position, item.position) <= rangeSq)
        .filter((item) => this.hasLineOfSight(player.position, item.position))
        .sort(
          (a, b) =>
            distanceSquared(player.position, a.position) - distanceSquared(player.position, b.position) ||
            a.id.localeCompare(b.id)
        )[0];

      if (nearestItem) {
        player.heldItemId = nearestItem.id;
        nearestItem.heldBy = player.id;
        this.followHeldItem();
        this.emit({
          type: "item.picked_up",
          actorId: player.id,
          entityId: nearestItem.id,
          message: `${player.label} picked up ${nearestItem.label}.`
        });
        this.recordAction({
          actorId: player.id,
          action: "interact",
          status: "succeeded",
          code: "picked_up_item",
          targetId: nearestItem.id,
          message: `Picked up ${nearestItem.label}.`
        });
        return;
      }
    }

    const nearestNpc = [...this.entities.values()]
      .filter((entity) => entity.kind === "npc")
      .filter((npc) => distanceSquared(player.position, npc.position) <= rangeSq)
      .filter((npc) => this.hasLineOfSight(player.position, npc.position))
      .sort(
        (a, b) =>
          distanceSquared(player.position, a.position) - distanceSquared(player.position, b.position) ||
          a.id.localeCompare(b.id)
      )[0];

    if (nearestNpc) {
      this.recordAction({
        actorId: player.id,
        action: "interact",
        status: "succeeded",
        code: "npc_interaction_requested",
        targetId: nearestNpc.id,
        message: `Interaction requested with ${nearestNpc.label}; cognition is disabled in P1.`
      });
      return;
    }

    this.recordAction({
      actorId: player.id,
      action: "interact",
      status: "rejected",
      code: "no_interactable",
      message: "Nothing interactable is in range and line of sight."
    });
  }

  private dropHeldItem(): void {
    const player = this.player();
    if (!player.heldItemId) {
      this.recordAction({
        actorId: player.id,
        action: "drop",
        status: "rejected",
        code: "not_holding_item",
        message: "Cannot drop: holding nothing."
      });
      return;
    }

    const item = this.entities.get(player.heldItemId);
    if (!item || item.kind !== "item") throw new Error(`Held item missing: ${player.heldItemId}`);

    const position = this.findDropPosition(player.position, player.radius + item.radius + 14, item.radius);
    item.position = position;
    item.heldBy = null;
    player.heldItemId = null;

    this.emit({
      type: "item.dropped",
      actorId: player.id,
      entityId: item.id,
      message: `${player.label} dropped ${item.label}.`
    });
    this.recordAction({
      actorId: player.id,
      action: "drop",
      status: "succeeded",
      code: "dropped_item",
      targetId: item.id,
      message: `Dropped ${item.label}.`
    });
  }

  private findDropPosition(origin: Vec2, distance: number, radius: number): Vec2 {
    const candidates: Vec2[] = [
      { x: origin.x + distance, y: origin.y },
      { x: origin.x, y: origin.y + distance },
      { x: origin.x - distance, y: origin.y },
      { x: origin.x, y: origin.y - distance }
    ];

    for (const candidate of candidates) {
      const bounded = {
        x: clamp(candidate.x, radius, this.width - radius),
        y: clamp(candidate.y, radius, this.height - radius)
      };
      if (!this.blockers.some((blocker) => pointHitsExpandedAabb(bounded, radius, blocker.bounds))) {
        return bounded;
      }
    }

    return { ...origin };
  }

  private emit(event: Omit<WorldEvent, "seq" | "tick">): void {
    this.eventSequence += 1;
    this.eventLog.push({ seq: this.eventSequence, tick: this.tickValue, ...event });
    if (this.eventLog.length > EVENT_LIMIT) this.eventLog.splice(0, this.eventLog.length - EVENT_LIMIT);
  }

  private recordAction(result: Omit<WorldActionResult, "seq" | "tick">): void {
    this.actionSequence += 1;
    this.lastActionResultValue = {
      seq: this.actionSequence,
      tick: this.tickValue,
      ...result
    };
  }
}
