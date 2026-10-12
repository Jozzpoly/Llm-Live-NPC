import { describe, expect, it } from "vitest";
import { FIVE_RESIDENT_ANCHORS } from "../spc-next/five-resident-region";
import {
  SPC_ART_PREVIEW_MAX_BYTES,
  groundVisualPlacement,
  validateLocalGroundImageSource,
  validateLocalGroundImageSignature,
} from "./spc-next-local-art-contract";

describe("owner-supplied visual-only SPC World ground reference", () => {
  it("derives World-aligned size from an existing real anchor and the decoded image", () => {
    const before = structuredClone(FIVE_RESIDENT_ANCHORS);
    const result = groundVisualPlacement(
      FIVE_RESIDENT_ANCHORS, "anchor.workshop.bench", 512, 256, 480, 0.7,
    );
    expect(result).toEqual({
      kind: "visual-only-ground-reference",
      anchorId: "anchor.workshop.bench",
      x: 1900, y: 760, width: 480, height: 240, opacity: 0.7,
    });
    expect(FIVE_RESIDENT_ANCHORS).toEqual(before);
  });
  it("rejects unknown anchors, invalid sizes, oversized decoded bitmaps and opacity", () => {
    expect(() => groundVisualPlacement(
      FIVE_RESIDENT_ANCHORS, "anchor.invented.tree", 512, 256, 480, 0.7,
    )).toThrow(/nie istnieje/);
    expect(() => groundVisualPlacement(
      FIVE_RESIDENT_ANCHORS, "anchor.workshop.bench", 8192, 8192, 480, 0.7,
    )).toThrow(/zbyt duże/);
    expect(() => groundVisualPlacement(
      FIVE_RESIDENT_ANCHORS, "anchor.workshop.bench", 512, 256, 1700, 0.7,
    )).toThrow(/Rozmiar/);
    expect(() => groundVisualPlacement(
      FIVE_RESIDENT_ANCHORS, "anchor.workshop.bench", 512, 256, 480, 0,
    )).toThrow(/Przezroczystość/);
    expect(() => groundVisualPlacement(
      FIVE_RESIDENT_ANCHORS, "anchor.workshop.bench", 0, 256, 480, 0.7,
    )).toThrow(/Wymiary/);
  });
  it("rejects fake MIME-labelled files with missing or mismatched PNG/WebP signatures", () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0]);
    const webp = Uint8Array.from([82, 73, 70, 70, 12, 0, 0, 0, 87, 69, 66, 80]);
    expect(() => validateLocalGroundImageSignature("image/png", png)).not.toThrow();
    expect(() => validateLocalGroundImageSignature("image/webp", webp)).not.toThrow();
    expect(() => validateLocalGroundImageSignature("image/png", webp)).toThrow();
    expect(() => validateLocalGroundImageSignature("image/webp", png)).toThrow();
    expect(() => validateLocalGroundImageSignature("image/png", Uint8Array.of(60,115,118,103,62))).toThrow();
  });

  it("accepts only local PNG/WebP with a bounded byte size", () => {
    expect(() => validateLocalGroundImageSource({ type: "image/png", size: 2345 })).not.toThrow();
    expect(() => validateLocalGroundImageSource({ type: "image/webp", size: SPC_ART_PREVIEW_MAX_BYTES })).not.toThrow();
    expect(() => validateLocalGroundImageSource({ type: "image/svg+xml", size: 100 })).toThrow();
    expect(() => validateLocalGroundImageSource({ type: "text/html", size: 100 })).toThrow();
    expect(() => validateLocalGroundImageSource({ type: "image/png", size: SPC_ART_PREVIEW_MAX_BYTES + 1 })).toThrow();
  });
});
