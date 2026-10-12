/**
 * Pure visual annotations for material objects in the Owner's actual World.
 * Input anchors are already determined by immutable World material positions.
 * Never mutates source geometry, actor position, World knowledge or object IDs.
 */
export interface MaterialLabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectanglesOverlap(a: MaterialLabelRect, b: MaterialLabelRect): boolean {
  return a.x < b.x + b.width + 4
    && a.x + a.width + 4 > b.x
    && a.y - a.height / 2 < b.y + b.height / 2 + 4
    && a.y + a.height / 2 + 4 > b.y - b.height / 2;
}

/** Coordinates correspond to Phaser Text origin (0, 0.5). */
export function placeNonOverlappingMaterialLabel(
  label: MaterialLabelRect,
  prior: readonly MaterialLabelRect[],
): MaterialLabelRect {
  if (![label.x, label.y, label.width, label.height].every(Number.isFinite)
    || label.width <= 0 || label.height <= 0) {
    throw new Error("material label dimensions must be positive and finite");
  }
  const stride = Math.max(label.height + 9, 25);
  for (let lane = 0; lane < 16; lane++) {
    const delta = lane === 0
      ? 0
      : (lane % 2 === 1 ? -1 : 1) * Math.ceil(lane / 2) * stride;
    const candidate = { ...label, y: label.y + delta };
    if (!prior.some(placed => rectanglesOverlap(candidate, placed))) {
      return candidate;
    }
  }
  // With an overfull place, shift only text (not material or actors).
  // Every candidate is bounded, deterministic and requires no hidden truth.
  return {
    ...label,
    x: label.x + Math.max(...prior.map(r => r.width), label.width) + 12,
  };
}
