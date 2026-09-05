import type { EntityId, WorldEntity } from "../world/types";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export interface WorldExtent {
  width: number;
  height: number;
}

export interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ScreenToWorldMapper = (x: number, y: number) => WorldPoint;

export interface PointerTargetSample {
  screen: ScreenPoint;
  world: WorldPoint;
  insideWorld: boolean;
}

export function resolvePointerTarget(
  mapScreenToWorld: ScreenToWorldMapper,
  screen: ScreenPoint,
  extent: WorldExtent
): PointerTargetSample {
  const world = mapScreenToWorld(screen.x, screen.y);
  const insideWorld =
    Number.isFinite(world.x) &&
    Number.isFinite(world.y) &&
    world.x >= 0 &&
    world.y >= 0 &&
    world.x <= extent.width &&
    world.y <= extent.height;

  return {
    screen: { x: screen.x, y: screen.y },
    world: { x: world.x, y: world.y },
    insideWorld
  };
}

export function clientPointToScreen(
  client: ScreenPoint,
  rect: ClientRectLike,
  screenExtent: WorldExtent
): ScreenPoint | null {
  if (
    ![
      client.x,
      client.y,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      screenExtent.width,
      screenExtent.height
    ].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    screenExtent.width <= 0 ||
    screenExtent.height <= 0
  ) {
    return null;
  }

  return {
    x: ((client.x - rect.left) / rect.width) * screenExtent.width,
    y: ((client.y - rect.top) / rect.height) * screenExtent.height
  };
}

export function resolveDirectInteractionTarget(
  entities: readonly WorldEntity[],
  renderedPositions: ReadonlyMap<EntityId, WorldPoint>,
  worldPoint: WorldPoint,
  zoom: number,
  minimumScreenRadiusPx: number
): EntityId | null {
  if (
    !Number.isFinite(worldPoint.x) ||
    !Number.isFinite(worldPoint.y) ||
    !Number.isFinite(zoom) ||
    zoom <= 0 ||
    !Number.isFinite(minimumScreenRadiusPx) ||
    minimumScreenRadiusPx < 0
  ) {
    return null;
  }

  return (
    entities
      .filter((entity) => entity.kind === "item" || entity.kind === "npc")
      .map((entity) => {
        const rendered = renderedPositions.get(entity.id) ?? entity.position;
        const screenDistance = Math.hypot(worldPoint.x - rendered.x, worldPoint.y - rendered.y) * zoom;
        const screenRadius = Math.max(entity.radius * zoom, minimumScreenRadiusPx);
        return { id: entity.id, screenDistance, screenRadius };
      })
      .filter((candidate) => candidate.screenDistance <= candidate.screenRadius)
      .sort((a, b) => a.screenDistance - b.screenDistance || a.id.localeCompare(b.id))[0]?.id ?? null
  );
}
