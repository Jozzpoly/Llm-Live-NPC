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

const hearth = { id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 200, maxY: 200 };
const ruins = { id: "ruins", label: "Ruins", minX: 500, minY: 0, maxX: 700, maxY: 200 };

function heardPercept(id = "percept:heard:1", tick = 20): ResidentPercept {
  return {
    id,
    occurrenceId: `occurrence:${id}`,
    tick,
    phenomenon: "speech",
    modality: "hearing",
    actorId: "player.jozz",
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "mid" },
    summary: "speech",
    text: "Mira, idź do ruin",
    addressed: true,
  };
}

function sightPercept(
  id = "percept:sight:1",
  tick = 21,
  phenomenon: "actor_sight_enter" | "actor_sight_update" = "actor_sight_enter",
  x = 100,
): ResidentPercept {
  return {
    id,
    occurrenceId: `${phenomenon}:${id}`,
    tick,
    phenomenon,
    modality: "sight",
    actorId: "player.jozz",
    subjectId: "player.jozz",
    spatial: { kind: "exact", position: { x, y: 100 } },
    summary: `actor player.jozz ${phenomenon}`,
    text: null,
    addressed: false,
  };
}

function sightExit(id = "percept:sight:exit", tick = 30): ResidentPercept {
  return {
    id,
    occurrenceId: `actor_sight_exit:${id}`,
    tick,
    phenomenon: "actor_sight_exit",
    modality: "sight",
    actorId: "player.jozz",
    subjectId: "player.jozz",
    spatial: { kind: "none" },
    summary: "actor player.jozz left sight",
    text: null,
    addressed: false,
  };
}

function keepProposal(
  beliefs: ResidentCognitionProposal["beliefs"],
  concerns: ResidentCognitionProposal["concerns"] = [],
): ResidentCognitionProposal {
  return {
    version: 1,
    activityDirective: { kind: "keep", reason: "continue" },
    beliefs,
    concerns,
    reviewAfterSeconds: 10,
  };
}

describe("ResidentMind", () => {
  it("learns direction but not hidden exact position from hearing alone", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.observe([heardPercept()]);
    mind.discoverRegion(hearth, 20);

    const context = mind.context(20, "hearth", [], idle, [heardPercept()]);
    expect(context.currentRegionId).toBe("hearth");
    expect(context.knownActors).toEqual([{
      id: "player.jozz",
      label: "player.jozz",
      lastKnownPosition: null,
      lastObservedTick: null,
      currentlyVisible: false,
      visibilityChangedTick: null,
      lastHeardDirection: { x: 1, y: 0 },
      lastHeardDistanceBand: "mid",
      lastHeardTick: 20,
    }]);
    expect(context.knownRegions).toEqual([{
      id: "hearth",
      label: "Hearth",
      knowledge: "visited",
      lastVisitedTick: 20,
    }]);
    expect(context.knownRegions.some((region) => region.id === "ruins")).toBe(false);
  });

  it("can know an authored place without pretending to have visited it", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.discoverRegion(hearth, 20);
    mind.familiarizeRegion(ruins, 20);

    const beforeVisit = mind.context(20, "hearth", [], idle, []);
    expect(beforeVisit.knownRegions.find((region) => region.id === "ruins")).toEqual({
      id: "ruins",
      label: "Ruins",
      knowledge: "familiar",
      lastVisitedTick: null,
    });

    mind.discoverRegion(ruins, 80);
    const afterVisit = mind.context(80, "ruins", [], idle, []);
    expect(afterVisit.currentRegionId).toBe("ruins");
    expect(afterVisit.knownRegions.find((region) => region.id === "ruins")?.knowledge).toBe("visited");
    expect(afterVisit.knownRegions.find((region) => region.id === "ruins")?.lastVisitedTick).toBe(80);
  });

  it("upgrades actor location only after exact visual evidence", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.observe([heardPercept(), sightPercept()]);
    const actor = mind.context(21, null, [], idle, [heardPercept(), sightPercept()]).knownActors[0]!;

    expect(actor.lastKnownPosition).toEqual({ x: 100, y: 100 });
    expect(actor.lastObservedTick).toBe(21);
    expect(actor.currentlyVisible).toBe(true);
    expect(actor.visibilityChangedTick).toBe(21);
    expect(actor.lastHeardDirection).toEqual({ x: 1, y: 0 });
  });

  it("keeps last exact location while sight visibility transitions enter -> update -> exit", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.observe([sightPercept("enter", 10, "actor_sight_enter", 100)]);
    mind.observe([sightPercept("update", 20, "actor_sight_update", 140)]);
    let actor = mind.context(20, null, [], idle, []).knownActors[0]!;
    expect(actor.lastKnownPosition).toEqual({ x: 140, y: 100 });
    expect(actor.lastObservedTick).toBe(20);
    expect(actor.currentlyVisible).toBe(true);
    expect(actor.visibilityChangedTick).toBe(10);

    mind.observe([sightExit("exit", 30)]);
    actor = mind.context(30, null, [], idle, []).knownActors[0]!;
    expect(actor.lastKnownPosition).toEqual({ x: 140, y: 100 });
    expect(actor.lastObservedTick).toBe(20);
    expect(actor.currentlyVisible).toBe(false);
    expect(actor.visibilityChangedTick).toBe(30);
  });

  it("does not fabricate a subject location from an interaction source position", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.observe([{
      id: "percept:interaction",
      occurrenceId: "occurrence:interaction",
      tick: 30,
      phenomenon: "interaction",
      modality: "sight",
      actorId: "resident.janek",
      subjectId: "item.hammer",
      spatial: { kind: "exact", position: { x: 300, y: 200 } },
      summary: "Janek interacted with a hammer",
      text: null,
      addressed: false,
    }]);

    const actors = mind.context(30, null, [], idle, []).knownActors;
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
        ...sightPercept(`percept:filler:${tick}`, tick, "actor_sight_update", 100 + tick),
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

    const context = mind.context(40, null, [reason], idle, []);
    expect(context.recentPercepts.some((percept) => percept.id === source.id)).toBe(true);
  });

  it("pins resident percept provenance while retained beliefs or concerns still cite it", () => {
    const mind = new ResidentMind(
      { id: "resident.mira", name: "Mira" },
      { maxBeliefs: 2, maxConcerns: 2, maxKnownActors: 8, maxKnownRegions: 4, maxPerceptEvidence: 2 },
    );
    const source = heardPercept("percept:semantic-source", 1);
    mind.observe([source]);
    mind.applySemanticUpdates(keepProposal(
      [{ id: "belief:source", statement: "Jozz asked something of me.", confidence: 0.8, evidenceIds: [source.id] }],
      [{ id: "concern:source", summary: "Consider Jozz's request.", priority: 0.7, status: "open", evidenceIds: [source.id] }],
    ), 2, [source]);

    mind.observe([sightPercept("filler:3", 3, "actor_sight_update", 103)]);
    mind.observe([sightPercept("filler:4", 4, "actor_sight_update", 104)]);
    mind.observe([sightPercept("filler:5", 5, "actor_sight_update", 105)]);

    const context = mind.context(5, null, [], idle, []);
    expect(context.beliefs[0]?.evidenceIds).toEqual([source.id]);
    expect(context.concerns[0]?.evidenceIds).toEqual([source.id]);
    expect(context.recentPercepts.some((percept) => percept.id === source.id)).toBe(true);
  });

  it("releases semantic evidence pins after no retained semantic state references them", () => {
    const mind = new ResidentMind(
      { id: "resident.mira", name: "Mira" },
      { maxBeliefs: 1, maxConcerns: 1, maxKnownActors: 8, maxKnownRegions: 4, maxPerceptEvidence: 2 },
    );
    const first = heardPercept("percept:first", 1);
    const second = heardPercept("percept:second", 2);
    mind.observe([first, second]);
    mind.applySemanticUpdates(keepProposal([
      { id: "belief:first", statement: "first", confidence: 0.5, evidenceIds: [first.id] },
    ]), 2, [first, second]);
    mind.applySemanticUpdates(keepProposal([
      { id: "belief:second", statement: "second", confidence: 0.5, evidenceIds: [second.id] },
    ]), 3, [first, second]);

    mind.observe([sightPercept("filler:4", 4, "actor_sight_update", 104)]);
    mind.observe([sightPercept("filler:5", 5, "actor_sight_update", 105)]);
    mind.observe([sightPercept("filler:6", 6, "actor_sight_update", 106)]);

    const staleReason: CognitionReason = {
      id: "reason:first",
      tick: 1,
      kind: "heard_speech",
      salience: 0.5,
      summary: "old evidence should no longer be pinned",
      evidenceIds: [first.id],
    };
    const context = mind.context(6, null, [staleReason], idle, []);
    expect(context.beliefs.map((belief) => belief.id)).toEqual(["belief:second"]);
    expect(context.recentPercepts.some((percept) => percept.id === first.id)).toBe(false);
    expect(context.recentPercepts.some((percept) => percept.id === second.id)).toBe(true);
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
    const context = mind.context(21, null, [], idle, [sightPercept()]);
    context.knownActors[0]!.lastKnownPosition!.x = 9999;

    expect(mind.context(21, null, [], idle, [sightPercept()]).knownActors[0]!.lastKnownPosition!.x).toBe(100);
  });
});