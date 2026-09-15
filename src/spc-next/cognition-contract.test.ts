import { describe, expect, it } from "vitest";
import type { ResidentCognitionContext } from "./cognition-contract";
import { parseResidentCognitionProposal } from "./cognition-contract";

function context(): ResidentCognitionContext {
  return {
    version: 1,
    resident: { id: "resident.mira", name: "Mira" },
    tick: 120,
    currentRegionId: "hearth",
    reasons: [{
      id: "reason:1",
      tick: 120,
      kind: "heard_speech",
      salience: 1,
      summary: "Jozz asked Mira to go to the ruins",
      evidenceIds: ["percept:1"],
    }],
    currentActivity: {
      id: "activity:old",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "between local activities",
    },
    recentPercepts: [{
      id: "percept:1",
      occurrenceId: "occurrence:1",
      tick: 120,
      modality: "hearing",
      actorId: "player.jozz",
      subjectId: null,
      spatial: { kind: "directional", direction: { x: -1, y: 0 }, distanceBand: "near" },
      summary: "speech",
      text: "Mira, sprawdź ruiny",
      addressed: true,
    }],
    concerns: [],
    beliefs: [],
    knownActors: [{
      id: "player.jozz",
      label: "Jozz",
      lastKnownPosition: null,
      lastObservedTick: null,
      lastHeardDirection: { x: -1, y: 0 },
      lastHeardDistanceBand: "near",
      lastHeardTick: 120,
    }],
    knownRegions: [
      { id: "hearth", label: "Hearth", knowledge: "visited", lastVisitedTick: 120 },
      { id: "ruins", label: "Ruins", knowledge: "familiar", lastVisitedTick: null },
    ],
  };
}

describe("SPC Next cognition contract", () => {
  it("accepts one unambiguous replacement directive grounded in resident-known geography", () => {
    const parsed = parseResidentCognitionProposal({
      version: 1,
      activityDirective: {
        kind: "replace",
        reason: "I will inspect the place Jozz named.",
        activity: {
          kind: "investigate",
          goal: "inspect the ruins and learn what is there",
          targetActorId: null,
          targetRegionId: "ruins",
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [{
        id: "belief:request",
        statement: "Jozz wants the ruins inspected.",
        confidence: 1,
        evidenceIds: ["percept:1"],
      }],
      concerns: [{
        id: "concern:ruins",
        summary: "Inspect the ruins for Jozz.",
        priority: 0.8,
        status: "open",
        evidenceIds: ["percept:1"],
      }],
      reviewAfterSeconds: 8,
    }, context());

    expect(parsed?.activityDirective.kind).toBe("replace");
  });

  it("accepts the visible cognition reason itself as bounded semantic evidence", () => {
    const parsed = parseResidentCognitionProposal({
      version: 1,
      activityDirective: { kind: "keep", reason: "keep listening" },
      beliefs: [{
        id: "belief:attention",
        statement: "A direct request needs consideration.",
        confidence: 0.8,
        evidenceIds: ["reason:1"],
      }],
      concerns: [],
      reviewAfterSeconds: 5,
    }, context());
    expect(parsed?.beliefs[0]?.evidenceIds).toEqual(["reason:1"]);
  });

  it("rejects unknown actors, unknown regions and fabricated evidence", () => {
    const unknownActor = {
      version: 1,
      activityDirective: {
        kind: "replace",
        reason: "go",
        activity: {
          kind: "communicate",
          goal: "tell somebody",
          targetActorId: "resident.unknown",
          targetRegionId: null,
          targetPosition: null,
          text: "hello",
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 3,
    };
    expect(parseResidentCognitionProposal(unknownActor, context())).toBeNull();

    const unknownRegion = {
      version: 1,
      activityDirective: {
        kind: "replace",
        reason: "go",
        activity: {
          kind: "travel",
          goal: "travel to a place I do not know",
          targetActorId: null,
          targetRegionId: "moon",
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 3,
    };
    expect(parseResidentCognitionProposal(unknownRegion, context())).toBeNull();

    const fabricatedEvidence = {
      version: 1,
      activityDirective: { kind: "keep", reason: "continue" },
      beliefs: [{ id: "b", statement: "invented", confidence: 1, evidenceIds: ["secret-world-truth"] }],
      concerns: [],
      reviewAfterSeconds: 3,
    };
    expect(parseResidentCognitionProposal(fabricatedEvidence, context())).toBeNull();
  });

  it("rejects model-invented coordinates and refuses to turn hearing direction into exact position", () => {
    const investigate = (targetPosition: { x: number; y: number }) => ({
      version: 1,
      activityDirective: {
        kind: "replace",
        reason: "walk to a coordinate",
        activity: {
          kind: "investigate",
          goal: "inspect there",
          targetActorId: null,
          targetRegionId: null,
          targetPosition,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 5,
    });

    expect(parseResidentCognitionProposal(investigate({ x: 7_777, y: 7_777 }), context())).toBeNull();
    expect(parseResidentCognitionProposal(investigate({ x: 500, y: 500 }), context())).toBeNull();

    const withSight = context();
    withSight.recentPercepts = [
      ...withSight.recentPercepts,
      {
        id: "percept:sight",
        occurrenceId: "sight-entry:mira:jozz:121",
        tick: 121,
        modality: "sight",
        actorId: "player.jozz",
        subjectId: "player.jozz",
        spatial: { kind: "exact", position: { x: 500, y: 500 } },
        summary: "actor player.jozz entered sight",
        text: null,
        addressed: false,
      },
    ];
    expect(parseResidentCognitionProposal(investigate({ x: 500, y: 500 }), withSight)?.activityDirective.kind).toBe("replace");
  });

  it("does not expose fake generic work as a supported cognition activity", () => {
    expect(parseResidentCognitionProposal({
      version: 1,
      activityDirective: {
        kind: "replace",
        reason: "pretend",
        activity: {
          kind: "work",
          goal: "do unspecified work",
          targetActorId: null,
          targetRegionId: null,
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    }, context())).toBeNull();
  });

  it("does not reproduce the old continue-plus-plan ambiguity: keep cannot carry a replacement activity", () => {
    expect(parseResidentCognitionProposal({
      version: 1,
      activityDirective: {
        kind: "keep",
        reason: "same concern",
        activity: {
          kind: "travel",
          goal: "silently replace the bodily method",
          targetActorId: null,
          targetRegionId: "ruins",
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 4,
    }, context())).toBeNull();
  });

  it("keeps immediate speech embodied by representing it as communicate activity rather than a side-channel reply", () => {
    const parsed = parseResidentCognitionProposal({
      version: 1,
      activityDirective: {
        kind: "replace",
        reason: "go tell Jozz in the shared world",
        activity: {
          kind: "communicate",
          goal: "tell Jozz the result",
          targetActorId: "player.jozz",
          targetRegionId: null,
          targetPosition: null,
          text: "Znalazłam ślady przy ruinach.",
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 15,
    }, context());

    expect(parsed?.activityDirective.kind).toBe("replace");
    if (parsed?.activityDirective.kind === "replace") {
      expect(parsed.activityDirective.activity.kind).toBe("communicate");
    }
  });
});
