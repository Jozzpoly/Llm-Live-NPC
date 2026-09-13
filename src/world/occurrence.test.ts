import { describe, expect, it } from "vitest";
import type { SpeechMode, WorldOccurrence, WorldSnapshot, WorldSpecimen } from "./types";
import { World } from "./world";

function fixture(): World {
  const specimen: WorldSpecimen = {
    width: 1400, height: 800, actorSpeed: 400, blockers: [], locations: [], placementSites: [],
    entities: [
      { id: "player", kind: "player", label: "Player", position: { x: 300, y: 300 }, radius: 16,
        facing: { x: 1, y: 0 }, heldItemId: null },
      { id: "resident", kind: "npc", label: "Resident", position: { x: 200, y: 300 }, radius: 16,
        facing: { x: 1, y: 0 }, heldItemId: null },
      { id: "mug", kind: "item", label: "Mug", position: { x: 340, y: 300 }, radius: 9, heldBy: null }
    ]
  };
  return new World(specimen);
}

describe("physical occurrence delivery", () => {
  it("delivers each spoken mode synchronously without a world tick or dialogue history", () => {
    const world = fixture();
    const before = world.snapshot();
    const events = world.recentEvents();
    const received: Array<{ occurrence: WorldOccurrence; snapshot: WorldSnapshot }> = [];
    world.onOccurrence((occurrence, snapshot) => received.push({ occurrence, snapshot }));

    for (const mode of ["quiet", "normal", "call"] as const) {
      world.speak("player", `Words in ${mode}`, mode);
      expect(received.at(-1)?.occurrence).toMatchObject({
        type: "speech.spoken", actorId: "player", tick: 0, mode,
        text: `Words in ${mode}`, position: { x: 300, y: 300 }
      });
      expect(received.at(-1)?.snapshot).toEqual(before);
    }
    world.speak("resident", "Default voice");
    expect(received).toHaveLength(4);
    expect(received.at(-1)?.occurrence).toMatchObject({ mode: "normal", actorId: "resident" });
    expect(world.tick).toBe(0);
    expect(world.snapshot()).toEqual(before);
    expect(world.recentEvents()).toEqual(events);
    expect(world.recentCalls()).toEqual([]);
    expect(world.lastActionResult()).toBeNull();
  });

  it("shares immutable copies at emission time while later world state continues independently", () => {
    const world = fixture();
    const received: Array<{ occurrence: WorldOccurrence; snapshot: WorldSnapshot }> = [];
    const second: WorldSnapshot[] = [];
    world.onOccurrence((occurrence, snapshot) => received.push({ occurrence, snapshot }));
    world.onOccurrence((_occurrence, snapshot) => second.push(snapshot));
    world.speak("player", "Before moving");

    const first = received[0];
    expect(second[0]).toBe(first.snapshot);
    expect(Object.isFrozen(first.occurrence)).toBe(true);
    expect(Object.isFrozen(first.snapshot.entities)).toBe(true);
    expect(Object.isFrozen(first.snapshot.entities[0].position)).toBe(true);
    expect(() => { first.snapshot.entities[0].position.x = 999; }).toThrow();
    const occurrence = first.occurrence;
    if (occurrence.type !== "speech.spoken") throw new Error("Expected speech occurrence");
    expect(() => { occurrence.position.x = 999; }).toThrow();

    world.step({ moveX: 1, moveY: 0 }, 0.25);
    world.speak("player", "After moving");
    expect(first.snapshot.entities.find(e => e.id === "player")?.position).toEqual({ x: 300, y: 300 });
    expect(received[1].snapshot.entities.find(e => e.id === "player")?.position).toEqual({ x: 400, y: 300 });
    expect(received[1].snapshot).not.toBe(first.snapshot);
    expect(received[1].occurrence).toMatchObject({ tick: 1, position: { x: 400, y: 300 } });
  });

  it("never replays old occurrences and supports repeated unsubscribe", () => {
    const world = fixture();
    world.speak("player", "Before subscribing");
    world.callOut("player");
    const received: WorldOccurrence[] = [];
    const unsubscribe = world.onOccurrence(occurrence => received.push(occurrence));
    expect(received).toEqual([]);
    world.speak("player", "While subscribed");
    expect(received).toHaveLength(1);
    unsubscribe();
    unsubscribe();
    world.speak("player", "After unsubscribing");
    world.callOut("player");
    world.attemptAction({ actorId: "player", action: "interact", targetId: "mug" });
    expect(received).toHaveLength(1);
    world.onOccurrence(occurrence => received.push(occurrence));
    expect(received).toHaveLength(1);
  });

  it("rejects invalid speech before emitting or changing the physical world", () => {
    const world = fixture();
    const before = world.snapshot();
    const received: WorldOccurrence[] = [];
    world.onOccurrence(occurrence => received.push(occurrence));
    expect(() => world.speak("missing", "Hello")).toThrow("Speech actor not found");
    expect(() => world.speak("mug", "Hello")).toThrow("Speech actor not found");
    expect(() => world.speak("player", " \n\t ")).toThrow("non-empty words");
    expect(() => world.speak("player", "Hello", "radio" as SpeechMode)).toThrow("Invalid speech mode");
    expect(received).toEqual([]);
    expect(world.snapshot()).toEqual(before);
    expect(world.lastActionResult()).toBeNull();
  });

  it("emits successful pickup and drop separately even when both happen between ticks", () => {
    const world = fixture();
    const received: Array<{ occurrence: WorldOccurrence; snapshot: WorldSnapshot }> = [];
    world.onOccurrence((occurrence, snapshot) => received.push({ occurrence, snapshot }));
    const pickup = world.attemptAction({ actorId: "player", action: "interact", targetId: "mug" });
    expect(received).toHaveLength(1);
    expect(received[0].occurrence).toMatchObject({
      type: "item.picked_up", tick: 0, actorId: "player", entityId: "mug", actionSeq: pickup.seq,
      before: { heldBy: null, position: { x: 340, y: 300 } },
      after: { heldBy: "player", position: { x: 300, y: 300 } }
    });
    expect(received[0].snapshot.entities.find(e => e.id === "mug")).toMatchObject({ heldBy: "player" });
    const drop = world.attemptAction({ actorId: "player", action: "drop" });
    expect(received).toHaveLength(2);
    expect(received[1].occurrence).toMatchObject({
      type: "item.dropped", tick: 0, actorId: "player", entityId: "mug", actionSeq: drop.seq,
      before: { heldBy: "player", position: { x: 300, y: 300 } },
      after: { heldBy: null, position: { x: 339, y: 300 } }
    });
    expect(received[1].snapshot.entities.find(e => e.id === "mug")).toMatchObject({ heldBy: null });
    expect(received[0].snapshot.entities.find(e => e.id === "mug")).toMatchObject({ heldBy: "player" });
    expect(world.tick).toBe(0);
  });

  it("does not project rejected attempts as physical manipulation", () => {
    const world = fixture();
    const received: WorldOccurrence[] = [];
    world.onOccurrence(occurrence => received.push(occurrence));
    expect(world.attemptAction({ actorId: "resident", action: "interact", targetId: "mug" }).status).toBe("rejected");
    expect(world.attemptAction({ actorId: "player", action: "drop" }).status).toBe("rejected");
    expect(world.attemptAction({ actorId: "missing", action: "interact", targetId: "mug" }).status).toBe("rejected");
    expect(received).toEqual([]);
  });

  it("keeps the older callOut return value and bounded copied recentCalls", () => {
    const world = fixture();
    const received: WorldOccurrence[] = [];
    world.onOccurrence(occurrence => received.push(occurrence));
    expect(world.callOut("missing")).toBe(false);
    expect(world.callOut("mug")).toBe(false);
    expect(received).toEqual([]);
    for (let i = 0; i < 35; i++) expect(world.callOut("player")).toBe(true);
    expect(received).toHaveLength(35);
    expect(received.at(-1)).toMatchObject({ type: "call.emitted", actorId: "player", callSeq: 35, tick: 0 });
    const calls = world.recentCalls();
    expect(calls).toHaveLength(32);
    expect(calls[0].seq).toBe(4);
    calls[0].position.x = -999;
    expect(world.recentCalls()[0].position).toEqual({ x: 300, y: 300 });
  });
});
