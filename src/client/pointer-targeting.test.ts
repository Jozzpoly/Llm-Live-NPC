import { describe, expect, it, vi } from "vitest";
import type { WorldEntity } from "../world/types";
import {
  clientPointToScreen,
  resolveDirectInteractionTarget,
  resolvePointerTarget
} from "./pointer-targeting";

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

describe("clientPointToScreen", () => {
  it("maps browser client coordinates into the canvas logical coordinate space", () => {
    expect(
      clientPointToScreen(
        { x: 350, y: 220 },
        { left: 110, top: 60, width: 480, height: 320 },
        { width: 960, height: 640 }
      )
    ).toEqual({ x: 480, y: 320 });
  });

  it("rejects degenerate client rectangles instead of inventing coordinates", () => {
    expect(
      clientPointToScreen(
        { x: 100, y: 100 },
        { left: 0, top: 0, width: 0, height: 100 },
        { width: 960, height: 640 }
      )
    ).toBeNull();
  });
});

describe("resolveDirectInteractionTarget", () => {
  const entities: WorldEntity[] = [
    {
      id: "player.jozz",
      kind: "player",
      label: "Jozz",
      position: { x: 100, y: 100 },
      radius: 16,
      heldItemId: null,
      facing: { x: 1, y: 0 }
    },
    {
      id: "npc.001",
      kind: "npc",
      label: "NPC",
      position: { x: 200, y: 100 },
      radius: 16,
      heldItemId: null,
      facing: { x: -1, y: 0 }
    },
    {
      id: "item.mug",
      kind: "item",
      label: "Mug",
      position: { x: 300, y: 100 },
      radius: 9,
      heldBy: null
    }
  ];

  it("targets the entity where it is rendered rather than its stale canonical position", () => {
    const rendered = new Map([
      ["npc.001", { x: 215, y: 100 }],
      ["item.mug", { x: 340, y: 100 }]
    ]);

    expect(resolveDirectInteractionTarget(entities, rendered, { x: 340, y: 100 }, 1, 16)).toBe("item.mug");
    expect(resolveDirectInteractionTarget(entities, rendered, { x: 300, y: 100 }, 1, 16)).toBeNull();
  });

  it("never turns clicking the player into an interaction target", () => {
    expect(resolveDirectInteractionTarget(entities, new Map(), { x: 100, y: 100 }, 1, 24)).toBeNull();
  });

  it("keeps ergonomic hit radius in screen pixels across zoom levels", () => {
    expect(resolveDirectInteractionTarget(entities, new Map(), { x: 340, y: 100 }, 0.5, 24)).toBe("item.mug");
    expect(resolveDirectInteractionTarget(entities, new Map(), { x: 350, y: 100 }, 0.5, 24)).toBeNull();
  });

  it("chooses the visually nearest eligible entity deterministically", () => {
    const overlapping: WorldEntity[] = [
      { ...entities[1]!, id: "npc.b", position: { x: 205, y: 100 } },
      { ...entities[1]!, id: "npc.a", position: { x: 195, y: 100 } }
    ];

    expect(resolveDirectInteractionTarget(overlapping, new Map(), { x: 200, y: 100 }, 1, 20)).toBe("npc.a");
  });
});
