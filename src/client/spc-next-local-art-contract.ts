import type { WorldAnchor } from "../spc-next/contracts";

/**
 * TEMPORARY, HUMAN-CHOSEN GROUND IMAGE, with no world authority.
 * This is an art-judgement instrument, not an SPC terrain format.
 *
 * No map labels, rendered pixels or alpha masks may be consumed by World,
 * resident vision, collision, material inventory, navigation or cognition.
 */
export const SPC_ART_PREVIEW_MAX_BYTES = 4 * 1024 * 1024;
export const SPC_ART_PREVIEW_MAX_PIXELS = 16 * 1024 * 1024;

export interface LocalGroundImageSource {
  type: string;
  size: number;
}

export interface LocalGroundVisualPlacement {
  kind: "visual-only-ground-reference";
  anchorId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export function validateLocalGroundImageSource(file: LocalGroundImageSource): void {
  if (!["image/png", "image/webp"].includes(file.type)) {
    throw new Error("Dozwolony jest wyłącznie lokalny PNG lub WebP.");
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0
    || file.size > SPC_ART_PREVIEW_MAX_BYTES) {
    throw new Error("Plik jest pusty lub przekracza limit 4 MB.");
  }
}

/**
 * Reject mismatched file signatures: a File.type or extension alone is not
 * evidence of image content. Browser image decoding still checks the data.
 */
export function validateLocalGroundImageSignature(
  mime: string, bytes: Uint8Array,
): void {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  const isPng = bytes.length >= png.length
    && png.every((byte, index) => bytes[index] === byte);
  const isWebp = bytes.length >= 12
    && [82, 73, 70, 70].every((byte, index) => bytes[index] === byte)
    && [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte);
  if ((mime === "image/png" && !isPng)
    || (mime === "image/webp" && !isWebp)
    || (mime !== "image/png" && mime !== "image/webp")) {
    throw new Error("Zawartość pliku nie odpowiada deklarowanemu PNG/WebP.");
  }
}

export function groundVisualPlacement(
  anchors: readonly WorldAnchor[],
  anchorId: string,
  imageWidth: number,
  imageHeight: number,
  worldWidth: number,
  opacity: number,
): LocalGroundVisualPlacement {
  const anchor = anchors.find(item => item.id === anchorId);
  if (!anchor) throw new Error("Wybrane miejsce nie istnieje w aktualnym World.");
  if (![imageWidth, imageHeight].every(v => Number.isSafeInteger(v) && v > 0)
    || imageWidth * imageHeight > SPC_ART_PREVIEW_MAX_PIXELS) {
    throw new Error("Wymiary obrazu są nieprawidłowe lub zbyt duże.");
  }
  if (!Number.isFinite(worldWidth) || worldWidth < 64 || worldWidth > 1_600) {
    throw new Error("Rozmiar podglądu musi mieścić się w 64–1600 jednostek World.");
  }
  if (!Number.isFinite(opacity) || opacity < 0.1 || opacity > 1) {
    throw new Error("Przezroczystość poza bezpiecznym zakresem.");
  }
  return {
    kind: "visual-only-ground-reference",
    anchorId: anchor.id,
    x: anchor.position.x,
    y: anchor.position.y,
    width: worldWidth,
    height: worldWidth * (imageHeight / imageWidth),
    opacity,
  };
}
