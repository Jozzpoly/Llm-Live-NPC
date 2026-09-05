import { describe, expect, it } from "vitest";
import type { WorldSnapshot } from "../world/types";
import {
  interpolationAlpha,
  interpolatePosition,
  resolveInterpolatedEntityPositions
} from "./motion-interpolation";

function snapshot(position: { x: number; y: number }, tick: number): WorldSnapshot {
  return {
    tick,
    width: 100,
    height: 100,
    entities: [
      {
        id: "player.test",
        kind: "player",
        label: "Player",
        position: { ...position },
        radius: 10,
        heldItemId: null,
        facing: { x: 1, y: 0 }
      }
    ],
    blockers: [],
    locations: [],
    placementSites: [],
    playerLocationId: null
  };
}

describe("presentation motion interpolation", () => {
  it("derives bounded interpolation alpha from fixed-step remainder", () => {
    expect(interpolationAlpha(0, 1000 / 30)).toBe(0);
    expect(interpolationAlpha((1000 / 30) / 2, 1000 / 30)).toBeCloseTo(0.5);
    expect(interpolationAlpha(1000, 1000 / 30)).toBe(1);
    expect(interpolationAlpha(-10, 1000 / 30)).toBe(0);
  });

  it("interpolates between authoritative positions without mutating either sample", () => {
    const previous = { x: 10, y: 20 };
    const current = { x: 20, y: 40 };
    expect(interpolatePosition(previous, current, 0.5)).toEqual({ x: 15, y: 30 });
    expect(previous).toEqual({ x: 10, y: 20 });
    expect(current).toEqual({ x: 20, y: 40 });
  });

  it("resolves entity render positions between previous/current snapshots", () => {
    const positions = resolveInterpolatedEntityPositions(snapshot({ x: 0, y: 0 }, 1), snapshot({ x: 9, y: 6 }, 2), 1 / 3);
    expect(positions.get("player.test")?.x).toBeCloseTo(3);
    expect(positions.get("player.test")?.y).toBeCloseTo(2);
  });

  it("falls back to current position for an entity without a previous sample", () => {
    const previous = snapshot({ x: 0, y: 0 }, 1);
    const current = snapshot({ x: 0, y: 0 }, 2);
    current.entities.push({
      id: "item.new",
      kind: "item",
      label: "New item",
      position: { x: 42, y: 33 },
      radius: 5,
      heldBy: null
    });

    expect(resolveInterpolatedEntityPositions(previous, current, 0.1).get("item.new")).toEqual({ x: 42, y: 33 });
  });
});
