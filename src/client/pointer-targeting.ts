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

export interface CameraWorldMapper {
  getWorldPoint(x: number, y: number, output?: WorldPoint): WorldPoint;
}

export interface PointerTargetSample {
  screen: ScreenPoint;
  world: WorldPoint;
  insideWorld: boolean;
}

export function resolvePointerTarget(
  camera: CameraWorldMapper,
  screen: ScreenPoint,
  extent: WorldExtent
): PointerTargetSample {
  const world = camera.getWorldPoint(screen.x, screen.y, { x: 0, y: 0 });
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
