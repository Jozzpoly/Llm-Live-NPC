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

function snapshotWithItem(
  tick: number,
  item: { position: { x: number; y: number }; held: boolean }
): WorldSnapshot {
  const playerPosition = { x: 50, y: 60 };
  return {
    tick,
    width: 100,
    height: 100,
    entities: [
      {
        id: "player.test",
        kind: "player",
        label: "Player",
        position: playerPosition,
        radius: 10,
        heldItemId: item.held ? "item.test" : null,
        facing: { x: 1, y: 0 }
      },
      {
        id: "item.test",
        kind: "item",
        label: "Item",
        position: { ...item.position },
        radius: 5,
        heldBy: item.held ? "player.test" : null
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

  it("derives the old carry offset only for held-item presentation", () => {
    const held = snapshotWithItem(1, { position: { x: 50, y: 60 }, held: true });
    const rendered = resolveInterpolatedEntityPositions(held, held, 1);

    expect(rendered.get("player.test")).toEqual({ x: 50, y: 60 });
    expect(rendered.get("item.test")).toEqual({ x: 50, y: 40 });
    expect(held.entities.find((entity) => entity.id === "item.test")?.position).toEqual({ x: 50, y: 60 });
  });

  it("interpolates pickup from the free-item position to the derived held presentation offset", () => {
    const previous = snapshotWithItem(1, { position: { x: 30, y: 70 }, held: false });
    const current = snapshotWithItem(2, { position: { x: 50, y: 60 }, held: true });

    expect(resolveInterpolatedEntityPositions(previous, current, 0).get("item.test")).toEqual({ x: 30, y: 70 });
    expect(resolveInterpolatedEntityPositions(previous, current, 0.5).get("item.test")).toEqual({ x: 40, y: 55 });
    expect(resolveInterpolatedEntityPositions(previous, current, 1).get("item.test")).toEqual({ x: 50, y: 40 });
  });

  it("interpolates drop from the derived held presentation offset to the new free-item position", () => {
    const previous = snapshotWithItem(1, { position: { x: 50, y: 60 }, held: true });
    const current = snapshotWithItem(2, { position: { x: 80, y: 60 }, held: false });

    expect(resolveInterpolatedEntityPositions(previous, current, 0).get("item.test")).toEqual({ x: 50, y: 40 });
    expect(resolveInterpolatedEntityPositions(previous, current, 1).get("item.test")).toEqual({ x: 80, y: 60 });
  });
});
