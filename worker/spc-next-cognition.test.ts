import { describe, expect, it } from "vitest";
import { sanitizeSpcNextContext } from "./spc-next-cognition";

function validContext(): Record<string, unknown> {
  return {
    version: 1,
    resident: { id: "resident.mira", name: "Mira" },
    tick: 120,
    currentRegionId: "hearth",
    reasons: [{
      id: "reason:heard:1",
      tick: 120,
      kind: "heard_speech",
      salience: 1,
      summary: "Jozz addressed Mira.",
      evidenceIds: ["percept:heard:1"],
    }],
    currentActivity: {
      id: "activity:mira:travel",
      kind: "travel",
      targetActorId: null,
      targetPosition: { x: 900, y: 700 },
      text: null,
      speed: 90,
      reason: "walk through hearth",
      routeWaypoints: [{ x: 800, y: 700 }],
    },
    recentPercepts: [{
      id: "percept:heard:1",
      occurrenceId: "occurrence:speech:1",
      tick: 120,
      modality: "hearing",
      actorId: "player.jozz",
      subjectId: null,
      spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
      summary: "speech",
      text: "Mira, chodź tutaj",
      addressed: true,
    }],
    concerns: [],
    beliefs: [],
    knownActors: [{
      id: "player.jozz",
      label: "Jozz",
      lastKnownPosition: { x: 620, y: 620 },
      lastObservedTick: 110,
      lastHeardDirection: { x: 1, y: 0 },
      lastHeardDistanceBand: "near",
      lastHeardTick: 120,
    }],
    knownRegions: [
      { id: "hearth", label: "Hearth", knowledge: "visited", lastVisitedTick: 119 },
      { id: "workshop", label: "Workshop", knowledge: "familiar", lastVisitedTick: null },
    ],
  };
}

describe("SPC Next cognition private-context trust boundary", () => {
  it("accepts a causally coherent private context and strips mechanical route details", () => {
    const parsed = sanitizeSpcNextContext(validContext());
    expect(parsed).not.toBeNull();
    expect(parsed?.currentRegionId).toBe("hearth");
    expect(parsed?.knownRegions).toEqual([
      { id: "hearth", label: "Hearth", knowledge: "visited", lastVisitedTick: 119 },
      { id: "workshop", label: "Workshop", knowledge: "familiar", lastVisitedTick: null },
    ]);
    expect(parsed?.currentActivity).not.toHaveProperty("routeWaypoints");
  });

  it("rejects exact coordinates smuggled through hearing", () => {
    const context = validContext();
    const percept = (context.recentPercepts as Array<Record<string, unknown>>)[0]!;
    percept.spatial = { kind: "exact", position: { x: 620, y: 620 } };
    expect(sanitizeSpcNextContext(context)).toBeNull();
  });

  it("rejects impossible familiar-versus-visited region histories", () => {
    const visitedWithoutVisit = validContext();
    (visitedWithoutVisit.knownRegions as Array<Record<string, unknown>>)[0]!.lastVisitedTick = null;
    expect(sanitizeSpcNextContext(visitedWithoutVisit)).toBeNull();

    const familiarWithVisit = validContext();
    (familiarWithVisit.knownRegions as Array<Record<string, unknown>>)[1]!.lastVisitedTick = 80;
    expect(sanitizeSpcNextContext(familiarWithVisit)).toBeNull();
  });

  it("rejects a current region that is not privately known as visited", () => {
    const unknownCurrent = validContext();
    unknownCurrent.currentRegionId = "ruins";
    expect(sanitizeSpcNextContext(unknownCurrent)).toBeNull();

    const merelyFamiliarCurrent = validContext();
    merelyFamiliarCurrent.currentRegionId = "workshop";
    expect(sanitizeSpcNextContext(merelyFamiliarCurrent)).toBeNull();
  });

  it("rejects causal evidence and memory timestamps from the future", () => {
    const futurePercept = validContext();
    (futurePercept.recentPercepts as Array<Record<string, unknown>>)[0]!.tick = 121;
    expect(sanitizeSpcNextContext(futurePercept)).toBeNull();

    const futureActorMemory = validContext();
    (futureActorMemory.knownActors as Array<Record<string, unknown>>)[0]!.lastObservedTick = 121;
    expect(sanitizeSpcNextContext(futureActorMemory)).toBeNull();

    const futureVisit = validContext();
    (futureVisit.knownRegions as Array<Record<string, unknown>>)[0]!.lastVisitedTick = 121;
    expect(sanitizeSpcNextContext(futureVisit)).toBeNull();
  });

  it("rejects half-formed exact or hearing memories", () => {
    const exactWithoutTick = validContext();
    (exactWithoutTick.knownActors as Array<Record<string, unknown>>)[0]!.lastObservedTick = null;
    expect(sanitizeSpcNextContext(exactWithoutTick)).toBeNull();

    const partialHearing = validContext();
    (partialHearing.knownActors as Array<Record<string, unknown>>)[0]!.lastHeardTick = null;
    expect(sanitizeSpcNextContext(partialHearing)).toBeNull();
  });
});
