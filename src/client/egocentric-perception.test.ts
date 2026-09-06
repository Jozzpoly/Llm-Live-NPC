import { describe, expect, it } from "vitest";
import { e1WakeFingerprint, projectE1Perception } from "../agent/e1-grounding";
import type { Vec2, WorldSnapshot } from "../world/types";

function snapshot(facing: Vec2): WorldSnapshot {
  return {
    tick: 1,
    width: 1000,
    height: 1000,
    entities: [
      {
        id: "npc.001",
        kind: "npc",
        label: "NPC-001",
        position: { x: 400, y: 400 },
        radius: 16,
        heldItemId: null,
        facing
      },
      {
        id: "item.east",
        kind: "item",
        label: "East item",
        position: { x: 500, y: 400 },
        radius: 9,
        heldBy: null
      }
    ],
    blockers: [],
    locations: [],
    placementSites: [],
    playerLocationId: null
  };
}

function perceivedDirection(facing: Vec2): Vec2 {
  const perception = projectE1Perception(snapshot(facing), "npc.001", () => true);
  const entity = perception.visibleEntities.find((entry) => entry.id === "item.east");
  if (!entity) throw new Error("Missing egocentric direction fixture.");
  return entity.direction;
}

describe("R6a egocentric perception direction", () => {
  it("expresses direction in observer-body axes: x forward/back, y right/left", () => {
    expect(perceivedDirection({ x: 1, y: 0 })).toEqual({ x: 1, y: 0 });
    expect(perceivedDirection({ x: 0, y: -1 })).toEqual({ x: 0, y: 1 });
    expect(perceivedDirection({ x: -1, y: 0 })).toEqual({ x: -1, y: 0 });
    expect(perceivedDirection({ x: 0, y: 1 })).toEqual({ x: 0, y: -1 });
  });

  it("changes perceived direction when only observer facing changes", () => {
    const east = projectE1Perception(snapshot({ x: 1, y: 0 }), "npc.001", () => true);
    const north = projectE1Perception(snapshot({ x: 0, y: -1 }), "npc.001", () => true);

    expect(east.visibleEntities[0]?.direction).toEqual({ x: 1, y: 0 });
    expect(north.visibleEntities[0]?.direction).toEqual({ x: 0, y: 1 });
  });

  it("does not broaden the bounded E1 wake surface merely because body-relative direction changed", () => {
    const east = projectE1Perception(snapshot({ x: 1, y: 0 }), "npc.001", () => true);
    const north = projectE1Perception(snapshot({ x: 0, y: -1 }), "npc.001", () => true);

    expect(east.visibleEntities[0]?.direction).not.toEqual(north.visibleEntities[0]?.direction);
    expect(e1WakeFingerprint(east)).toBe(e1WakeFingerprint(north));
  });
});
