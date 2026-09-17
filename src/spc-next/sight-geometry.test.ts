import { describe, expect, it } from "vitest";
import type { SightBlocker, Vec2 } from "./contracts";
import { hasGeometricLineOfSight, querySightLine, segmentIntersectsAabbInterior } from "./sight-geometry";

const wall = (id: string, minX: number, minY: number, maxX: number, maxY: number): SightBlocker => ({
  id,
  label: id,
  bounds: { minX, minY, maxX, maxY },
});

const box = { minX: 10, minY: 10, maxX: 20, maxY: 20 };

describe("SPC point sight geometry", () => {
  it("blocks an actual interior crossing and keeps an empty line clear", () => {
    expect(segmentIntersectsAabbInterior({ x: 0, y: 15 }, { x: 30, y: 15 }, box)).toBe(true);
    expect(hasGeometricLineOfSight({ x: 0, y: 15 }, { x: 30, y: 15 }, [wall("wall", 10, 10, 20, 20)])).toBe(false);
    expect(hasGeometricLineOfSight({ x: 0, y: 0 }, { x: 30, y: 0 }, [wall("wall", 10, 10, 20, 20)])).toBe(true);
  });

  it("treats pure edge and corner tangency as clear instead of manufacturing occlusion", () => {
    expect(segmentIntersectsAabbInterior({ x: 0, y: 10 }, { x: 30, y: 10 }, box)).toBe(false);
    expect(segmentIntersectsAabbInterior({ x: 0, y: 0 }, { x: 10, y: 10 }, box)).toBe(false);
    expect(segmentIntersectsAabbInterior({ x: 0, y: 20 }, { x: 30, y: 20 }, box)).toBe(false);
  });

  it("distinguishes a boundary endpoint from entering the opaque interior", () => {
    expect(segmentIntersectsAabbInterior({ x: 0, y: 15 }, { x: 10, y: 15 }, box)).toBe(false);
    expect(segmentIntersectsAabbInterior({ x: 0, y: 15 }, { x: 10.001, y: 15 }, box)).toBe(true);
    expect(segmentIntersectsAabbInterior({ x: 10, y: 15 }, { x: 0, y: 15 }, box)).toBe(false);
    expect(segmentIntersectsAabbInterior({ x: 10, y: 15 }, { x: 30, y: 15 }, box)).toBe(true);
  });

  it("fails closed when an observer or target is actually inside opaque geometry", () => {
    expect(segmentIntersectsAabbInterior({ x: 15, y: 15 }, { x: 30, y: 15 }, box)).toBe(true);
    expect(segmentIntersectsAabbInterior({ x: 0, y: 15 }, { x: 15, y: 15 }, box)).toBe(true);
    expect(segmentIntersectsAabbInterior({ x: 15, y: 15 }, { x: 15, y: 15 }, box)).toBe(true);
    expect(segmentIntersectsAabbInterior({ x: 5, y: 5 }, { x: 5, y: 5 }, box)).toBe(false);
  });

  it("keeps doorway topology physical instead of treating nearby wall pieces as one blocker", () => {
    const blockers = [
      wall("wall.top", 10, 0, 20, 12),
      wall("wall.bottom", 10, 18, 20, 30),
    ];
    expect(hasGeometricLineOfSight({ x: 0, y: 15 }, { x: 30, y: 15 }, blockers)).toBe(true);
    expect(hasGeometricLineOfSight({ x: 0, y: 8 }, { x: 30, y: 8 }, blockers)).toBe(false);
    expect(hasGeometricLineOfSight({ x: 0, y: 22 }, { x: 30, y: 22 }, blockers)).toBe(false);
  });

  it("returns all blockers deterministically even when authored input order changes or blockers overlap", () => {
    const blockers = [
      wall("z.wall", 12, 12, 18, 18),
      wall("a.wall", 10, 10, 20, 20),
    ];
    const forward = querySightLine({ x: 0, y: 15 }, { x: 30, y: 15 }, blockers);
    const reversedInput = querySightLine({ x: 0, y: 15 }, { x: 30, y: 15 }, [...blockers].reverse());
    expect(forward).toEqual({ clear: false, blockingIds: ["a.wall", "z.wall"] });
    expect(reversedInput).toEqual(forward);
  });

  it("is symmetric under observer/target reversal for the same static authored geometry", () => {
    const blockers = [
      wall("middle", 10, 10, 20, 20),
      wall("offset", 22, 2, 24, 8),
    ];
    const samples: Array<[Vec2, Vec2]> = [
      [{ x: 0, y: 15 }, { x: 30, y: 15 }],
      [{ x: 0, y: 10 }, { x: 30, y: 10 }],
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      [{ x: 15, y: 15 }, { x: 30, y: 30 }],
      [{ x: 0, y: 4 }, { x: 30, y: 4 }],
    ];
    for (const [a, b] of samples) {
      expect(querySightLine(a, b, blockers)).toEqual(querySightLine(b, a, blockers));
    }
  });

  it("rejects poisoned query data and malformed blocker geometry instead of returning accidental visibility", () => {
    expect(() => querySightLine({ x: Number.NaN, y: 0 }, { x: 1, y: 1 }, [])).toThrow(/finite/);
    expect(() => querySightLine({ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 1 }, [])).toThrow(/finite/);
    expect(() => querySightLine({ x: 0, y: 0 }, { x: 1, y: 1 }, [wall("bad", 10, 10, 10, 20)])).toThrow(/positive area/);
    expect(() => querySightLine({ x: 0, y: 0 }, { x: 1, y: 1 }, [
      wall("same", 10, 10, 20, 20), wall("same", 30, 30, 40, 40),
    ])).toThrow(/duplicate/);
  });
});
