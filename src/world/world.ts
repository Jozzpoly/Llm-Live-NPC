import type {
  Aabb,
  ActorControlInput,
  ActorEntity,
  EntityId,
  InteractionValidation,
  ItemEntity,
  LocationId,
  PlacementSite,
  PlacementTargetValidation,
  PlayerEntity,
  Vec2,
  WorldActionRequest,
  WorldActionResult,
  WorldEntity,
  WorldEvent,
  WorldInput,
  WorldSnapshot,
  WorldSpecimen
} from "./types";
import { heldItemAttachmentPosition, validateWorldSpecimen } from "./specimen-validation";

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

function sweepHorizontalMovement(
  start: Vec2,
  targetX: number,
  radius: number,
  blockers: WorldSpecimen["blockers"]
): number {
  if (targetX === start.x) return targetX;

  let resolvedX = targetX;
  for (const blocker of blockers) {
    const minY = blocker.bounds.y - radius;
    const maxY = blocker.bounds.y + blocker.bounds.height + radius;
    if (start.y <= minY || start.y >= maxY) continue;

    const minX = blocker.bounds.x - radius;
    const maxX = blocker.bounds.x + blocker.bounds.width + radius;
    if (targetX > start.x) {
      if (start.x <= minX && resolvedX > minX) resolvedX = Math.min(resolvedX, minX);
    } else if (start.x >= maxX && resolvedX < maxX) {
      resolvedX = Math.max(resolvedX, maxX);
    }
  }
  return resolvedX;
}

function sweepVerticalMovement(
  startY: number,
  targetY: number,
  resolvedX: number,
  radius: number,
  blockers: WorldSpecimen["blockers"]
): number {
  if (targetY === startY) return targetY;

  let resolvedY = targetY;
  for (const blocker of blockers) {
    const minX = blocker.bounds.x - radius;
    const maxX = blocker.bounds.x + blocker.bounds.width + radius;
    if (resolvedX <= minX || resolvedX >= maxX) continue;

    const minY = blocker.bounds.y - radius;
    const maxY = blocker.bounds.y + blocker.bounds.height + radius;
    if (targetY > startY) {
      if (startY <= minY && resolvedY > minY) resolvedY = Math.min(resolvedY, minY);
    } else if (startY >= maxY && resolvedY < maxY) {
      resolvedY = Math.max(resolvedY, maxY);
    }
  }
  return resolvedY;
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

function isActor(entity: WorldEntity | undefined): entity is ActorEntity {
  return entity?.kind === "player" || entity?.kind === "npc";
}

function assertFiniteMovement(input: WorldInput, label: string): void {
  if (!Number.isFinite(input.moveX) || !Number.isFinite(input.moveY)) {
    throw new Error(`${label} requires a finite movement vector.`);
  }
}

export class World {
  readonly width: number;
  readonly height: number;
  readonly actorSpeed: number;

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
    validateWorldSpecimen(specimen);

    this.width = specimen.width;
    this.height = specimen.height;
    this.actorSpeed = specimen.actorSpeed;
    this.blockers = structuredClone(specimen.blockers);
    this.locations = structuredClone(specimen.locations);
    this.placementSites = structuredClone(specimen.placementSites);

    for (const entity of structuredClone(specimen.entities)) this.entities.set(entity.id, entity);

    this.followHeldItems();
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

  get playerId(): EntityId {
    return this.player().id;
  }

  step(input: WorldInput, seconds = DEFAULT_STEP_SECONDS): void {
    this.stepWithActorControls(input, [], seconds);
  }

  stepWithActorControls(
    input: WorldInput,
    actorControls: readonly ActorControlInput[],
    seconds = DEFAULT_STEP_SECONDS
  ): void {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 0.25) {
      throw new Error(`Invalid world step duration: ${seconds}`);
    }

    const player = this.player();
    assertFiniteMovement(input, "Player control");

    const seenActorIds = new Set<EntityId>();
    const validatedControls: Array<{ actor: ActorEntity; control: ActorControlInput }> = [];
    for (const control of [...actorControls].sort((a, b) => a.actorId.localeCompare(b.actorId))) {
      if (control.actorId === player.id) {
        throw new Error(`Actor controls must not duplicate player control: ${control.actorId}`);
      }
      if (seenActorIds.has(control.actorId)) {
        throw new Error(`Duplicate actor control: ${control.actorId}`);
      }
      seenActorIds.add(control.actorId);

      const actor = this.entities.get(control.actorId);
      if (!isActor(actor)) throw new Error(`Actor control target not found: ${control.actorId}`);
      assertFiniteMovement(control, `Actor control ${control.actorId}`);
      validatedControls.push({ actor, control });
    }

    this.tickValue += 1;
    this.moveActor(player, input, seconds);
    for (const { actor, control } of validatedControls) this.moveActor(actor, control, seconds);

    this.followHeldItems();
    this.updatePlayerLocation();
  }

  attemptAction(request: WorldActionRequest): WorldActionResult {
    const actor = this.entities.get(request.actorId);
    if (!isActor(actor)) {
      return this.recordAction({
        actorId: request.actorId,
        action: request.action,
        status: "rejected",
        code: "actor_not_found",
        message: `Actor not found: ${request.actorId}.`
      });
    }

    if (request.action === "drop") return this.dropHeldItem(actor);
    return this.interact(actor, request.targetId);
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

  validateInteraction(actorId: EntityId, targetId: EntityId): InteractionValidation {
    const actor = this.entities.get(actorId);
    if (!isActor(actor)) {
      return {
        status: "rejected",
        actorId,
        targetId,
        code: "actor_not_found",
        message: `Actor not found: ${actorId}.`
      };
    }

    const target = this.entities.get(targetId);
    if (!target) {
      return {
        status: "rejected",
        actorId,
        targetId,
        code: "target_not_found",
        message: `Interaction target not found: ${targetId}.`
      };
    }

    if (target.id === actor.id || target.kind === "player") {
      return {
        status: "rejected",
        actorId,
        targetId,
        code: "target_not_interactable",
        message: `${target.label} is not interactable through this action.`
      };
    }

    if (target.kind === "item") {
      if (actor.heldItemId) {
        return {
          status: "rejected",
          actorId,
          targetId,
          code: "already_holding_item",
          message: `${actor.label} is already holding an item.`
        };
      }
      if (target.heldBy !== null) {
        return {
          status: "rejected",
          actorId,
          targetId,
          code: "target_unavailable",
          message: `${target.label} is already held.`
        };
      }
    }

    const rangeSq = INTERACTION_RANGE * INTERACTION_RANGE;
    if (distanceSquared(actor.position, target.position) > rangeSq) {
      return {
        status: "rejected",
        actorId,
        targetId,
        code: "target_out_of_range",
        message: `${target.label} is outside interaction range.`
      };
    }

    if (!this.hasLineOfSight(actor.position, target.position)) {
      return {
        status: "rejected",
        actorId,
        targetId,
        code: "target_occluded",
        message: `${target.label} is occluded from ${actor.label}.`
      };
    }

    return { status: "accepted", actorId, targetId, targetKind: target.kind };
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

  private moveActor(actor: ActorEntity, input: WorldInput, seconds: number): void {
    const magnitude = Math.hypot(input.moveX, input.moveY);
    if (magnitude <= 0) return;

    actor.facing = { x: input.moveX / magnitude, y: input.moveY / magnitude };

    const movementScale = Math.max(1, magnitude);
    const movementX = input.moveX / movementScale;
    const movementY = input.moveY / movementScale;
    const dx = movementX * this.actorSpeed * seconds;
    const dy = movementY * this.actorSpeed * seconds;

    const targetX = clamp(actor.position.x + dx, actor.radius, this.width - actor.radius);
    const x = sweepHorizontalMovement(actor.position, targetX, actor.radius, this.blockers);
    const targetY = clamp(actor.position.y + dy, actor.radius, this.height - actor.radius);
    const y = sweepVerticalMovement(actor.position.y, targetY, x, actor.radius, this.blockers);

    actor.position.x = x;
    actor.position.y = y;
  }

  private followHeldItems(): void {
    for (const entity of this.entities.values()) {
      if (isActor(entity)) this.followHeldItem(entity);
    }
  }

  private followHeldItem(actor: ActorEntity): void {
    if (!actor.heldItemId) return;
    const item = this.entities.get(actor.heldItemId);
    if (!item || item.kind !== "item") throw new Error(`Held item missing: ${actor.heldItemId}`);
    item.position = heldItemAttachmentPosition(actor);
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

  private interact(actor: ActorEntity, explicitTargetId?: EntityId): WorldActionResult {
    if (explicitTargetId !== undefined) return this.interactWithTarget(actor, explicitTargetId);

    const targetId = this.resolveContextInteractionTarget(actor);
    if (targetId) return this.interactWithTarget(actor, targetId);

    return this.recordAction({
      actorId: actor.id,
      action: "interact",
      status: "rejected",
      code: "no_interactable",
      message: "Nothing interactable is in range and line of sight."
    });
  }

  private resolveContextInteractionTarget(actor: ActorEntity): EntityId | null {
    const rangeSq = INTERACTION_RANGE * INTERACTION_RANGE;

    if (!actor.heldItemId) {
      const nearestItem = [...this.entities.values()]
        .filter((entity): entity is ItemEntity => entity.kind === "item" && entity.heldBy === null)
        .filter((item) => distanceSquared(actor.position, item.position) <= rangeSq)
        .filter((item) => this.hasLineOfSight(actor.position, item.position))
        .sort(
          (a, b) =>
            distanceSquared(actor.position, a.position) - distanceSquared(actor.position, b.position) ||
            a.id.localeCompare(b.id)
        )[0];
      if (nearestItem) return nearestItem.id;
    }

    const nearestNpc = [...this.entities.values()]
      .filter((entity): entity is ActorEntity => entity.kind === "npc" && entity.id !== actor.id)
      .filter((npc) => distanceSquared(actor.position, npc.position) <= rangeSq)
      .filter((npc) => this.hasLineOfSight(actor.position, npc.position))
      .sort(
        (a, b) =>
          distanceSquared(actor.position, a.position) - distanceSquared(actor.position, b.position) ||
          a.id.localeCompare(b.id)
      )[0];

    return nearestNpc?.id ?? null;
  }

  private interactWithTarget(actor: ActorEntity, targetId: EntityId): WorldActionResult {
    const validation = this.validateInteraction(actor.id, targetId);
    if (validation.status === "rejected") {
      return this.recordAction({
        actorId: actor.id,
        action: "interact",
        status: "rejected",
        code: validation.code,
        targetId,
        message: validation.message
      });
    }

    const target = this.entities.get(targetId);
    if (!target || (target.kind !== "item" && target.kind !== "npc")) {
      throw new Error(`Accepted interaction target became invalid: ${targetId}`);
    }

    if (target.kind === "item") {
      actor.heldItemId = target.id;
      target.heldBy = actor.id;
      this.followHeldItem(actor);
      this.emit({
        type: "item.picked_up",
        actorId: actor.id,
        entityId: target.id,
        message: `${actor.label} picked up ${target.label}.`
      });
      return this.recordAction({
        actorId: actor.id,
        action: "interact",
        status: "succeeded",
        code: "picked_up_item",
        targetId: target.id,
        message: `Picked up ${target.label}.`
      });
    }

    return this.recordAction({
      actorId: actor.id,
      action: "interact",
      status: "succeeded",
      code: "npc_interaction_requested",
      targetId: target.id,
      message: `Interaction requested with ${target.label}; cognition is disabled in P1.`
    });
  }

  private dropHeldItem(actor: ActorEntity): WorldActionResult {
    if (!actor.heldItemId) {
      return this.recordAction({
        actorId: actor.id,
        action: "drop",
        status: "rejected",
        code: "not_holding_item",
        message: "Cannot drop: holding nothing."
      });
    }

    const item = this.entities.get(actor.heldItemId);
    if (!item || item.kind !== "item") throw new Error(`Held item missing: ${actor.heldItemId}`);

    const position = this.findDropPosition(actor.position, actor.radius + item.radius + 14, item.radius);
    item.position = position;
    item.heldBy = null;
    actor.heldItemId = null;

    this.emit({
      type: "item.dropped",
      actorId: actor.id,
      entityId: item.id,
      message: `${actor.label} dropped ${item.label}.`
    });
    return this.recordAction({
      actorId: actor.id,
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

  private recordAction(result: Omit<WorldActionResult, "seq" | "tick">): WorldActionResult {
    this.actionSequence += 1;
    const recorded = { seq: this.actionSequence, tick: this.tickValue, ...result };
    this.lastActionResultValue = recorded;
    return { ...recorded };
  }
}
