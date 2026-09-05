import { describe, expect, it } from "vitest";
import type { Blocker, WorldEntity } from "../world/types";
import {
  PRESENTATION_DEPTH,
  resolveBlockerVisual,
  resolveEntityVisual,
  resolveLocationVisual
} from "./presentation";

const player: WorldEntity = {
  id: "player.test",
  kind: "player",
  label: "Player",
  position: { x: 10, y: 20 },
  radius: 12,
  heldItemId: null
};

const npc: WorldEntity = {
  id: "npc.test",
  kind: "npc",
  label: "NPC",
  position: { x: 30, y: 40 },
  radius: 12,
  heldItemId: null
};

const item: WorldEntity = {
  id: "item.test",
  kind: "item",
  label: "Item",
  position: { x: 50, y: 60 },
  radius: 8,
  heldBy: null
};

function itemWithId(id: string): WorldEntity {
  return { ...item, id };
}

describe("presentation seam", () => {
  it("keeps visual strata in a stable front-to-back order", () => {
    expect(PRESENTATION_DEPTH.ground).toBeLessThan(PRESENTATION_DEPTH.scenery);
    expect(PRESENTATION_DEPTH.scenery).toBeLessThan(PRESENTATION_DEPTH.actors);
    expect(PRESENTATION_DEPTH.actors).toBeLessThan(PRESENTATION_DEPTH.overhead);
    expect(PRESENTATION_DEPTH.overhead).toBeLessThan(PRESENTATION_DEPTH.effects);
    expect(PRESENTATION_DEPTH.effects).toBeLessThan(PRESENTATION_DEPTH.debug);
  });

  it("resolves actor glyphs outside WorldScene", () => {
    expect(resolveEntityVisual(player)).toMatchObject({ glyph: "player", depth: PRESENTATION_DEPTH.actors });
    expect(resolveEntityVisual(npc)).toMatchObject({ glyph: "npc", depth: PRESENTATION_DEPTH.actors });
  });

  it("supports specimen-specific item glyph evidence without leaking it into World", () => {
    expect(resolveEntityVisual(itemWithId("item.mug")).glyph).toBe("mug");
    expect(resolveEntityVisual(itemWithId("item.hammer")).glyph).toBe("hammer");
    expect(resolveEntityVisual(itemWithId("item.lantern")).glyph).toBe("lantern");
    expect(resolveEntityVisual(item).glyph).toBe("item");
    expect(resolveEntityVisual(item).depth).toBeGreaterThan(PRESENTATION_DEPTH.scenery);
  });

  it("gives the authored yard table a presentation-only table glyph", () => {
    const table: Blocker = {
      id: "yard.table",
      label: "Yard table",
      bounds: { x: 0, y: 0, width: 120, height: 44 },
      occludesVision: false
    };
    expect(resolveBlockerVisual(table).glyph).toBe("table");
  });

  it("keeps generic blocker appearance derived from semantic blocker state", () => {
    const opaque: Blocker = {
      id: "wall",
      label: "Wall",
      bounds: { x: 0, y: 0, width: 20, height: 20 },
      occludesVision: true
    };
    const nonOpaque: Blocker = { ...opaque, id: "rail", occludesVision: false };

    expect(resolveBlockerVisual(opaque).glyph).toBe("wall");
    expect(resolveBlockerVisual(opaque).fillColor).not.toBe(resolveBlockerVisual(nonOpaque).fillColor);
    expect(resolveBlockerVisual(opaque).strokeAlpha).toBeGreaterThan(resolveBlockerVisual(nonOpaque).strokeAlpha);
  });

  it("marks Common Yard as the only current richer location treatment", () => {
    expect(resolveLocationVisual("yard").treatment).toBe("yard");
    expect(resolveLocationVisual("workshop").treatment).toBe("zone");
    expect(resolveLocationVisual("future-location").fillColor).toBe(0x536c61);
  });
});
