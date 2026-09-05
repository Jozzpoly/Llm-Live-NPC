export interface ControlMovement {
  x: number;
  y: number;
}

export interface QueuedPlayerActions {
  interactPressed: boolean;
  dropPressed: boolean;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizeToUnitCircle(x: number, y: number): ControlMovement {
  const safeX = finiteOrZero(x);
  const safeY = finiteOrZero(y);
  const magnitude = Math.hypot(safeX, safeY);
  if (magnitude <= 1) return { x: safeX, y: safeY };
  return { x: safeX / magnitude, y: safeY / magnitude };
}

export function combineControlMovement(a: ControlMovement, b: ControlMovement): ControlMovement {
  return normalizeToUnitCircle(a.x + b.x, a.y + b.y);
}

export class PlayerControlBuffer {
  private movementValue: ControlMovement = { x: 0, y: 0 };
  private interactQueued = false;
  private dropQueued = false;

  setMovement(x: number, y: number): void {
    this.movementValue = normalizeToUnitCircle(x, y);
  }

  clearMovement(): void {
    this.movementValue = { x: 0, y: 0 };
  }

  movement(): ControlMovement {
    return { ...this.movementValue };
  }

  queueInteract(): void {
    this.interactQueued = true;
  }

  queueDrop(): void {
    this.dropQueued = true;
  }

  consumeActions(): QueuedPlayerActions {
    const actions = {
      interactPressed: this.interactQueued,
      dropPressed: this.dropQueued
    };
    this.interactQueued = false;
    this.dropQueued = false;
    return actions;
  }
}
