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
  radius: 12
};

const item: WorldEntity = {
  id: "item.test",
  kind: "item",
  label: "Item",
  position: { x: 50, y: 60 },
  radius: 8,
  heldBy: null
};

describe("presentation seam", () => {
  it("keeps visual strata in a stable front-to-back order", () => {
    expect(PRESENTATION_DEPTH.ground).toBeLessThan(PRESENTATION_DEPTH.scenery);
    expect(PRESENTATION_DEPTH.scenery).toBeLessThan(PRESENTATION_DEPTH.actors);
    expect(PRESENTATION_DEPTH.actors).toBeLessThan(PRESENTATION_DEPTH.overhead);
    expect(PRESENTATION_DEPTH.overhead).toBeLessThan(PRESENTATION_DEPTH.effects);
    expect(PRESENTATION_DEPTH.effects).toBeLessThan(PRESENTATION_DEPTH.debug);
  });

  it("resolves current entity fallback visuals outside WorldScene", () => {
    expect(resolveEntityVisual(player).fillColor).toBe(0x79d8ff);
    expect(resolveEntityVisual(npc).fillColor).toBe(0xffc46b);
    expect(resolveEntityVisual(item).fillColor).toBe(0xece6cf);
    expect(resolveEntityVisual(item).depth).toBeGreaterThan(PRESENTATION_DEPTH.scenery);
  });

  it("keeps blocker appearance derived from semantic blocker state", () => {
    const opaque: Blocker = {
      id: "wall",
      label: "Wall",
      bounds: { x: 0, y: 0, width: 20, height: 20 },
      occludesVision: true
    };
    const nonOpaque: Blocker = { ...opaque, id: "rail", occludesVision: false };

    expect(resolveBlockerVisual(opaque).fillColor).not.toBe(resolveBlockerVisual(nonOpaque).fillColor);
    expect(resolveBlockerVisual(opaque).strokeAlpha).toBeGreaterThan(resolveBlockerVisual(nonOpaque).strokeAlpha);
  });

  it("provides a deterministic fallback for authored locations without a bespoke visual", () => {
    expect(resolveLocationVisual("workshop").fillColor).toBe(0x5e7080);
    expect(resolveLocationVisual("future-location").fillColor).toBe(0x536c61);
  });
});
