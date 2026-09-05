import { describe, expect, it } from "vitest";
import {
  E1CognitionGate,
  deriveE1ObservedChanges,
  e1WakeFingerprint,
  projectE1Perception,
  validateE1Decision
} from "../agent/e1-grounding";
import type { WorldSnapshot } from "../world/types";

function fixture(): WorldSnapshot {
  return {
    tick: 1,
    width: 1000,
    height: 1000,
    entities: [
      {
        id: "npc.001",
        kind: "npc",
        label: "NPC-001",
        position: { x: 100, y: 100 },
        radius: 16,
        heldItemId: null,
        facing: { x: 1, y: 0 }
      },
      {
        id: "player.jozz",
        kind: "player",
        label: "Jozz",
        position: { x: 150, y: 100 },
        radius: 16,
        heldItemId: "item.mug",
        facing: { x: 1, y: 0 }
      },
      {
        id: "item.mug",
        kind: "item",
        label: "Red mug",
        position: { x: 150, y: 80 },
        radius: 9,
        heldBy: "player.jozz"
      },
      {
        id: "item.hidden",
        kind: "item",
        label: "Hidden item",
        position: { x: 700, y: 700 },
        radius: 9,
        heldBy: null
      }
    ],
    blockers: [],
    locations: [{ id: "yard", label: "Yard", bounds: { x: 0, y: 0, width: 300, height: 300 } }],
    placementSites: [],
    playerLocationId: "yard"
  };
}

describe("E1 bounded perception", () => {
  it("projects only local observable relations and never raw absolute positions", () => {
    const perception = projectE1Perception(fixture(), "npc.001", () => true);

    expect(perception.visibleEntities.map((entity) => entity.id)).toEqual(["item.mug", "player.jozz"]);
    expect(perception.fetchableItemIds).toEqual([]);
    expect(perception.observer.locationId).toBe("yard");
    expect("position" in (perception.visibleEntities[0] as unknown as Record<string, unknown>)).toBe(false);
    expect("blockers" in (perception as unknown as Record<string, unknown>)).toBe(false);
  });

  it("excludes out-of-range and geometrically occluded entities", () => {
    const snapshot = fixture();
    const perception = projectE1Perception(
      snapshot,
      "npc.001",
      (_start, end) => !(end.x === 150 && end.y === 80)
    );

    expect(perception.visibleEntities.some((entity) => entity.id === "item.mug")).toBe(false);
    expect(perception.visibleEntities.some((entity) => entity.id === "item.hidden")).toBe(false);
  });

  it("wakes on held-to-free item semantics, derives the observed holder transition and ignores pure actor drift", () => {
    const held = projectE1Perception(fixture(), "npc.001", () => true);
    const movedActor = structuredClone(held);
    const player = movedActor.visibleEntities.find((entity) => entity.id === "player.jozz");
    if (!player) throw new Error("Missing player fixture.");
    player.distance = 180;
    player.direction = { x: -1, y: 0 };
    expect(e1WakeFingerprint(movedActor)).toBe(e1WakeFingerprint(held));

    const droppedSnapshot = fixture();
    const mug = droppedSnapshot.entities.find((entity) => entity.id === "item.mug");
    const playerEntity = droppedSnapshot.entities.find((entity) => entity.id === "player.jozz");
    if (!mug || mug.kind !== "item" || !playerEntity || playerEntity.kind !== "player") {
      throw new Error("Invalid drop fixture.");
    }
    mug.heldBy = null;
    playerEntity.heldItemId = null;
    const dropped = projectE1Perception(droppedSnapshot, "npc.001", () => true);

    expect(e1WakeFingerprint(dropped)).not.toBe(e1WakeFingerprint(held));
    expect(deriveE1ObservedChanges(held, dropped)).toContainEqual({
      kind: "item_holder_changed",
      itemId: "item.mug",
      previousHolderId: "player.jozz",
      holderId: null
    });
    expect(dropped.fetchableItemIds).toEqual(["item.mug"]);
    expect(validateE1Decision({ kind: "fetch", targetId: "item.mug" }, dropped)).toEqual({
      status: "accepted",
      decision: { kind: "fetch", targetId: "item.mug" }
    });
    expect(validateE1Decision({ kind: "fetch", targetId: "item.hidden" }, dropped)).toEqual({
      status: "rejected",
      code: "target_not_fetchable",
      targetId: "item.hidden"
    });
  });
});

describe("E1 cognition gate", () => {
  it("arms as a baseline and emits the bounded temporal delta on a later semantic change", () => {
    const held = projectE1Perception(fixture(), "npc.001", () => true);
    const droppedSnapshot = fixture();
    const mug = droppedSnapshot.entities.find((entity) => entity.id === "item.mug");
    const player = droppedSnapshot.entities.find((entity) => entity.id === "player.jozz");
    if (!mug || mug.kind !== "item" || !player || player.kind !== "player") {
      throw new Error("Invalid gate fixture.");
    }
    mug.heldBy = null;
    player.heldItemId = null;
    const dropped = projectE1Perception(droppedSnapshot, "npc.001", () => true);

    const gate = new E1CognitionGate(3, 750);
    gate.arm(held, null);
    expect(gate.consider(held, null, false, 0)).toBeNull();

    const request = gate.consider(dropped, null, false, 100);
    expect(request?.cycleId).toBe(1);
    expect(request?.trigger).toBe("perception_changed");
    expect(request?.observedChanges).toContainEqual({
      kind: "item_holder_changed",
      itemId: "item.mug",
      previousHolderId: "player.jozz",
      holderId: null
    });
    expect(gate.consider(dropped, null, false, 1000)).toBeNull();
    expect(gate.finish(1)).toBe(true);
    expect(gate.state().cyclesUsed).toBe(1);
  });
});
