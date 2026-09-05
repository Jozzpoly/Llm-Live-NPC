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
