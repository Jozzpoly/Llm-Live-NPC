import { describe, expect, it, vi } from "vitest";
import { resolvePointerTarget } from "./pointer-targeting";

describe("resolvePointerTarget", () => {
  it("delegates screen-to-world conversion to the explicit camera mapper", () => {
    const mapper = vi.fn((x: number, y: number) => ({ x: x * 0.5 + 400, y: y * 0.5 + 300 }));

    const target = resolvePointerTarget(mapper, { x: 120, y: 80 }, { width: 1440, height: 900 });

    expect(mapper).toHaveBeenCalledWith(120, 80);
    expect(target).toEqual({
      screen: { x: 120, y: 80 },
      world: { x: 460, y: 340 },
      insideWorld: true
    });
  });

  it("marks converted targets outside authored world bounds without clamping them", () => {
    const target = resolvePointerTarget(
      () => ({ x: 1475, y: -12 }),
      { x: 900, y: 40 },
      { width: 1440, height: 900 }
    );

    expect(target.world).toEqual({ x: 1475, y: -12 });
    expect(target.insideWorld).toBe(false);
  });

  it("rejects non-finite converted coordinates", () => {
    const target = resolvePointerTarget(
      () => ({ x: Number.NaN, y: 10 }),
      { x: 1, y: 2 },
      { width: 1440, height: 900 }
    );

    expect(target.insideWorld).toBe(false);
  });
});
