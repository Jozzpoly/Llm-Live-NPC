import { describe, expect, it } from "vitest";
import type { ResidentCognitionProposal } from "./cognition-contract";
import type { CognitionReason, ResidentActivity, ResidentPercept } from "./contracts";
import { ResidentMind } from "./resident-mind";

const idle: ResidentActivity = {
  id: "activity:mira:idle",
  kind: "idle",
  targetActorId: null,
  targetPosition: null,
  text: null,
  speed: null,
  reason: "test",
};

function heardPercept(id = "percept:heard:1", tick = 20): ResidentPercept {
  return {
    id,
    occurrenceId: `occurrence:${id}`,
    tick,
    modality: "hearing",
    actorId: "player.jozz",
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "mid" },
    summary: "speech",
    text: "Mira, idź do ruin",
    addressed: true,
  };
}

function sightPercept(id = "percept:sight:1", tick = 21): ResidentPercept {
  return {
    id,
    occurrenceId: `sight-entry:${id}`,
    tick,
    modality: "sight",
    actorId: "player.jozz",
    subjectId: "player.jozz",
    spatial: { kind: "exact", position: { x: 100, y: 100 } },
    summary: "actor player.jozz entered sight",
    text: null,
    addressed: false,
  };
}

describe("ResidentMind", () => {
  it("learns direction but not hidden exact position from hearing alone", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.observe([heardPercept()]);
    mind.discoverRegion({ id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 200, maxY: 200 }, 20);

    const context = mind.context(20, [], idle, [heardPercept()]);
    expect(context.knownActors).toEqual([{
      id: "player.jozz",
      label: "player.jozz",
      lastKnownPosition: null,
      lastObservedTick: null,
      lastHeardDirection: { x: 1, y: 0 },
      lastHeardDistanceBand: "mid",
      lastHeardTick: 20,
    }]);
    expect(context.knownRegions).toEqual([{ id: "hearth", label: "Hearth" }]);
    expect(context.knownRegions.some((region) => region.id === "ruins")).toBe(false);
  });

  it("upgrades actor location only after exact visual evidence", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.observe([heardPercept(), sightPercept()]);
    const actor = mind.context(21, [], idle, [heardPercept(), sightPercept()]).knownActors[0]!;

    expect(actor.lastKnownPosition).toEqual({ x: 100, y: 100 });
    expect(actor.lastObservedTick).toBe(21);
    expect(actor.lastHeardDirection).toEqual({ x: 1, y: 0 });
  });

  it("does not fabricate a subject location from an interaction source position", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.observe([{
      id: "percept:interaction",
      occurrenceId: "occurrence:interaction",
      tick: 30,
      modality: "sight",
      actorId: "resident.janek",
      subjectId: "item.hammer",
      spatial: { kind: "exact", position: { x: 300, y: 200 } },
      summary: "Janek interacted with a hammer",
      text: null,
      addressed: false,
    }]);

    const actors = mind.context(30, [], idle, []).knownActors;
    expect(actors.some((actor) => actor.id === "resident.janek" && actor.lastKnownPosition?.x === 300)).toBe(true);
    expect(actors.some((actor) => actor.id === "item.hammer")).toBe(false);
  });

  it("keeps causal percept evidence available after it rotates out of the short recent window", () => {
    const mind = new ResidentMind(
      { id: "resident.mira", name: "Mira" },
      { maxBeliefs: 4, maxConcerns: 4, maxKnownActors: 4, maxKnownRegions: 4, maxPerceptEvidence: 64 },
    );
    const source = heardPercept("percept:source", 1);
    mind.observe([source]);
    for (let tick = 2; tick <= 40; tick += 1) {
      mind.observe([{
        ...sightPercept(`percept:filler:${tick}`, tick),
        actorId: `resident.filler${tick % 3}`,
        subjectId: `resident.filler${tick % 3}`,
      }]);
    }
    const reason: CognitionReason = {
      id: "reason:source",
      tick: 1,
      kind: "heard_speech",
      salience: 1,
      summary: "source must remain inspectable",
      evidenceIds: [source.id],
    };

    const context = mind.context(40, [reason], idle, []);
    expect(context.recentPercepts.some((percept) => percept.id === source.id)).toBe(true);
  });

  it("keeps semantic beliefs and concerns private and bounded instead of turning them into World truth", () => {
    const mind = new ResidentMind(
      { id: "resident.mira", name: "Mira" },
      { maxBeliefs: 2, maxConcerns: 2, maxKnownActors: 4, maxKnownRegions: 4 },
    );

    for (let i = 0; i < 3; i += 1) {
      const proposal: ResidentCognitionProposal = {
        version: 1,
        activityDirective: { kind: "keep", reason: "continue" },
        beliefs: [{ id: `belief:${i}`, statement: `belief ${i}`, confidence: 0.5, evidenceIds: [] }],
        concerns: [{ id: `concern:${i}`, summary: `concern ${i}`, priority: i / 3, status: "open", evidenceIds: [] }],
        reviewAfterSeconds: 10,
      };
      mind.applySemanticUpdates(proposal, 100 + i);
    }

    const snapshot = mind.snapshot();
    expect(snapshot.beliefs.map((belief) => belief.id).sort()).toEqual(["belief:1", "belief:2"]);
    expect(snapshot.concerns).toHaveLength(2);
    expect(snapshot.concerns.some((concern) => concern.id === "concern:0")).toBe(false);
  });

  it("context copies cannot mutate the continuing resident mind", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.observe([sightPercept()]);
    const context = mind.context(21, [], idle, [sightPercept()]);
    context.knownActors[0]!.lastKnownPosition!.x = 9999;

    expect(mind.context(21, [], idle, [sightPercept()]).knownActors[0]!.lastKnownPosition!.x).toBe(100);
  });
});
