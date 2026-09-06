import { describe, expect, it } from "vitest";
import { E1CognitionGate, type E1Perception } from "../agent/e1-grounding";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

function makePerception(fetchableItemIds: string[], tick = 1): E1Perception {
  return {
    tick,
    observer: {
      id: "npc.001",
      label: "NPC-001",
      locationId: "yard",
      locationLabel: "Common Yard",
      heldItemId: null
    },
    visibleEntities: fetchableItemIds.map((id, index) => ({
      id,
      kind: "item" as const,
      label: id,
      distance: 20 + index,
      direction: { x: 1, y: 0 },
      heldBy: null
    })),
    fetchableItemIds: [...fetchableItemIds]
  };
}

describe("pre-LLM readiness characterization", () => {
  it("shows that cycle IDs are reused across arm sessions, so an old completion can match a fresh pending cycle", () => {
    const gate = new E1CognitionGate(3, 0);
    const baseline = makePerception([], 1);
    const oldChange = makePerception(["item.mug"], 2);
    const freshChange = makePerception(["item.hammer"], 3);

    gate.arm(baseline, null);
    const oldCycle = gate.consider(oldChange, null, false, 1000);
    expect(oldCycle?.cycleId).toBe(1);

    gate.disarm();
    gate.arm(baseline, null);
    const freshCycle = gate.consider(freshChange, null, false, 2000);
    expect(freshCycle?.cycleId).toBe(1);
    expect(gate.state()).toMatchObject({ inFlight: true, pendingCycleId: 1 });

    // Characterization of the ABA gap: finish() has no session identity, so the
    // stale session-A cycle ID is accepted as the pending session-B cycle ID.
    expect(gate.finish(oldCycle!.cycleId)).toBe(true);
    expect(gate.state()).toMatchObject({ inFlight: false, pendingCycleId: null });
  });

  it("shows that a transient perception change can disappear completely while cognition is in flight", () => {
    const gate = new E1CognitionGate(3, 0);
    const baseline = makePerception([], 1);
    const requestedState = makePerception(["item.mug"], 2);
    const transientState = makePerception(["item.hammer"], 3);

    gate.arm(baseline, null);
    const cycle = gate.consider(requestedState, null, false, 1000);
    expect(cycle).not.toBeNull();

    // The transient state is visible to consider(), but the gate refuses a new
    // cycle while in flight and does not journal the observation.
    expect(gate.consider(transientState, null, false, 1100)).toBeNull();
    expect(gate.finish(cycle!.cycleId)).toBe(true);

    // By the time cognition is available again the world returned to the state
    // that initiated the request, so no later cycle can reveal the transient.
    expect(gate.consider(requestedState, null, false, 2000)).toBeNull();
  });

  it("shows that location lifecycle is player-only even when NPC-001 crosses into another authored location", () => {
    const world = new World(createP1Specimen());

    for (let step = 0; step < 36; step += 1) {
      world.stepWithActorControls(
        { moveX: 0, moveY: 0 },
        [{ actorId: "npc.001", moveX: 0, moveY: -1 }]
      );
    }

    const npc = world.snapshot().entities.find((entity) => entity.id === "npc.001");
    expect(npc?.position.y).toBeLessThan(180);
    expect(world.recentEvents(128).filter((event) => event.actorId === "npc.001" && event.type.startsWith("location."))).toEqual([]);
    expect(world.snapshot().playerLocationId).toBe("yard");
  });

  it("shows that World construction currently accepts inconsistent actor/item ownership", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !mug || mug.kind !== "item") {
      throw new Error("Missing readiness-audit inventory fixture.");
    }

    player.heldItemId = mug.id;
    mug.heldBy = null;

    const world = new World(specimen);
    const snapshot = world.snapshot();
    expect(snapshot.entities.find((entity) => entity.id === player.id)).toMatchObject({ heldItemId: mug.id });
    expect(snapshot.entities.find((entity) => entity.id === mug.id)).toMatchObject({ heldBy: null });
  });

  it("shows that NPC interaction is currently a placeholder success without a semantic World event", () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc") {
      throw new Error("Missing readiness-audit NPC interaction fixture.");
    }

    player.position = { x: 730, y: 390 };
    npc.position = { x: 760, y: 390 };
    const world = new World(specimen);
    const eventsBefore = world.recentEvents(128);

    const result = world.attemptAction({
      action: "interact",
      actorId: player.id,
      targetId: npc.id
    });

    expect(result).toMatchObject({
      status: "succeeded",
      code: "npc_interaction_requested",
      targetId: npc.id
    });
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });
});
