import { describe, expect, it } from "vitest";
import type { ResidentCognitionContext } from "./cognition-contract";
import { parseResidentCognitionProposal } from "./cognition-contract";

function context(): ResidentCognitionContext {
  return {
    version: 1,
    resident: { id: "resident.mira", name: "Mira" },
    tick: 120,
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
      kind: "work",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "workshop work",
    },
    recentPercepts: [{
      id: "percept:1",
      occurrenceId: "occurrence:1",
      tick: 120,
      modality: "hearing",
      actorId: "player.jozz",
      subjectId: null,
      position: { x: 500, y: 500 },
      summary: "speech",
      text: "Mira, sprawdź ruiny",
      addressed: true,
    }],
    concerns: [],
    beliefs: [],
    knownActors: [{ id: "player.jozz", label: "Jozz", lastKnownPosition: { x: 500, y: 500 }, lastObservedTick: 120 }],
    knownRegions: [
      { id: "hearth", label: "Hearth" },
      { id: "ruins", label: "Ruins" },
    ],
  };
}

describe("SPC Next cognition contract", () => {
  it("accepts one unambiguous replacement directive grounded in known world references", () => {
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

  it("rejects unknown actors, unknown regions and fabricated evidence", () => {
    const base = {
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
    expect(parseResidentCognitionProposal(base, context())).toBeNull();

    const unknownRegion = structuredClone(base);
    unknownRegion.activityDirective.activity.kind = "travel";
    unknownRegion.activityDirective.activity.targetActorId = null;
    unknownRegion.activityDirective.activity.targetRegionId = "moon";
    unknownRegion.activityDirective.activity.text = null;
    expect(parseResidentCognitionProposal(unknownRegion, context())).toBeNull();

    const fabricatedEvidence = {
      ...base,
      activityDirective: { kind: "keep", reason: "continue" },
      beliefs: [{ id: "b", statement: "invented", confidence: 1, evidenceIds: ["secret-world-truth"] }],
    };
    expect(parseResidentCognitionProposal(fabricatedEvidence, context())).toBeNull();
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
