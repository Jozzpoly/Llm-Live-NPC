import { describe, expect, it } from "vitest";
import { placeNonOverlappingMaterialLabel } from "./spc-next-material-label-layout";

describe("visual-only World material labels", () => {
  it("separates names of adjacent carried/loose real objects without moving the actual objects", () => {
    const bundle = { x: 735, y: 495, width: 92, height: 17 };
    const timber = { x: 785, y: 493, width: 118, height: 17 };
    const placedBundle = placeNonOverlappingMaterialLabel(bundle, []);
    const placedTimber = placeNonOverlappingMaterialLabel(timber, [placedBundle]);
    expect(placedBundle).toEqual(bundle);
    expect(placedTimber.y).not.toBe(timber.y);
    expect(placedTimber.x).toBe(timber.x);
    expect(timber).toEqual({ x: 785, y: 493, width: 118, height: 17 });
    expect(placeNonOverlappingMaterialLabel(timber, [placedBundle])).toEqual(placedTimber);
  });

  it("keeps isolated labels in their original anchored visual position", () => {
    const label = { x: 1_000, y: 400, width: 70, height: 16 };
    expect(placeNonOverlappingMaterialLabel(label, [
      { x: 100, y: 100, width: 150, height: 35 },
    ])).toEqual(label);
  });
});
