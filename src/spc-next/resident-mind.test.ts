import { describe, expect, it } from "vitest";
import type { ResidentCognitionProposal } from "./cognition-contract";
import type { ResidentActivity, ResidentPercept } from "./contracts";
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

function heardPercept(): ResidentPercept {
  return {
    id: "percept:heard:1",
    occurrenceId: "occurrence:heard:1",
    tick: 20,
    modality: "hearing",
    actorId: "player.jozz",
    subjectId: null,
    position: { x: 100, y: 100 },
    summary: "speech",
    text: "Mira, idź do ruin",
    addressed: true,
  };
}

describe("ResidentMind", () => {
  it("learns only from the resident's own percept stream and physically discovered regions", () => {
    const mind = new ResidentMind({ id: "resident.mira", name: "Mira" });
    mind.observe([heardPercept()]);
    mind.discoverRegion({ id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 200, maxY: 200 }, 20);

    const context = mind.context(20, [], idle, [heardPercept()]);
    expect(context.knownActors).toEqual([{
      id: "player.jozz",
      label: "player.jozz",
      lastKnownPosition: { x: 100, y: 100 },
      lastObservedTick: 20,
    }]);
    expect(context.knownRegions).toEqual([{ id: "hearth", label: "Hearth" }]);
    expect(context.knownRegions.some((region) => region.id === "ruins")).toBe(false);
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
    mind.observe([heardPercept()]);
    const context = mind.context(20, [], idle, [heardPercept()]);
    context.knownActors[0]!.lastKnownPosition!.x = 9999;

    expect(mind.context(20, [], idle, [heardPercept()]).knownActors[0]!.lastKnownPosition!.x).toBe(100);
  });
});
