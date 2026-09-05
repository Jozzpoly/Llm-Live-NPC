import { describe, expect, it } from "vitest";
import { incrementalPinchScale, isTapGesture, joystickVector } from "./mobile-controls";
import { combineControlMovement, PlayerControlBuffer } from "./player-control-buffer";

describe("mobile Owner-test controls", () => {
  it("normalizes analog movement to the unit circle", () => {
    const controls = new PlayerControlBuffer();
    controls.setMovement(3, 4);
    expect(controls.movement().x).toBeCloseTo(0.6);
    expect(controls.movement().y).toBeCloseTo(0.8);
  });

  it("queues action edges until consumed exactly once", () => {
    const controls = new PlayerControlBuffer();
    controls.queueInteract();
    controls.queueDrop();
    expect(controls.consumeActions()).toEqual({ interactPressed: true, dropPressed: true });
    expect(controls.consumeActions()).toEqual({ interactPressed: false, dropPressed: false });
  });

  it("combines keyboard and touch movement without exceeding unit magnitude", () => {
    const movement = combineControlMovement({ x: 1, y: 0 }, { x: 0.6, y: 0.8 });
    expect(Math.hypot(movement.x, movement.y)).toBeCloseTo(1);
    expect(movement.x).toBeGreaterThan(0);
    expect(movement.y).toBeGreaterThan(0);
  });

  it("maps joystick offsets through a continuous dead zone and clamps full travel", () => {
    expect(joystickVector(3, 2, 40)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(4, 0, 40)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(22, 0, 40).x).toBeCloseTo(0.5);
    expect(joystickVector(80, 0, 40)).toEqual({ x: 1, y: 0 });
  });

  it("preserves joystick direction while remapping magnitude", () => {
    const vector = joystickVector(30, 40, 50, 0.08);
    expect(vector.x / vector.y).toBeCloseTo(0.75);
    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1);
  });

  it("turns pinch distance changes into bounded incremental zoom scale", () => {
    expect(incrementalPinchScale(100, 110)).toBeCloseTo(1.1);
    expect(incrementalPinchScale(100, 200)).toBe(1.15);
    expect(incrementalPinchScale(100, 20)).toBe(0.85);
    expect(incrementalPinchScale(0, 100)).toBe(1);
  });

  it("recognizes a short stable touch as a tap candidate", () => {
    expect(isTapGesture({ x: 100, y: 100 }, { x: 106, y: 104 }, 180)).toBe(true);
  });

  it("rejects drag-like or long touch sequences as taps", () => {
    expect(isTapGesture({ x: 100, y: 100 }, { x: 120, y: 100 }, 180)).toBe(false);
    expect(isTapGesture({ x: 100, y: 100 }, { x: 103, y: 102 }, 700)).toBe(false);
  });
});
