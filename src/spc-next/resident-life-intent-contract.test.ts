import { describe, expect, it } from "vitest";
import type { ResidentCognitionContext } from "./cognition-contract";
import { parseResidentLifeIntentProposal } from "./resident-life-intent-contract";

const context: ResidentCognitionContext = {
  version: 1,
  resident: { id: "resident.mira", name: "Mira" },
  tick: 120,
  currentRegionId: "hearth",
  reasons: [{
    id: "reason:speech:120",
    tick: 120,
    kind: "heard_speech",
    salience: 1,
    summary: "Jozz addressed Mira",
    evidenceIds: ["percept:speech:120"],
  }],
  currentActivity: {
    id: "activity:mira:legacy-idle",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "legacy local projection is idle while recovered life owns the body",
  },
  recentPercepts: [{
    id: "percept:speech:120",
    occurrenceId: "occurrence:speech:120",
    tick: 120,
    phenomenon: "speech",
    modality: "hearing",
    actorId: "player.jozz",
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "Jozz asks Mira to check the fields later",
    text: "Mira, sprawdzisz później pola?",
    addressed: true,
  }],
  concerns: [],
  beliefs: [],
  knownActors: [],
  knownRegions: [
    { id: "hearth", label: "Hearth", knowledge: "visited", lastVisitedTick: 120 },
    { id: "workshop", label: "Workshop", knowledge: "familiar", lastVisitedTick: null },
    { id: "fields", label: "Fields", knowledge: "familiar", lastVisitedTick: null },
  ],
};

const semanticUpdates = {
  beliefs: [{
    id: "belief:mira:jozz-requested-fields:120",
    statement: "Jozz asked Mira to check the fields later.",
    confidence: 1,
    evidenceIds: ["percept:speech:120"],
  }],
  concerns: [],
  reviewAfterSeconds: 30,
} as const;

describe("ResidentLifeIntentProposal contract", () => {
  it("can accept a new continuing intent without saying that the current body activity is replaced", () => {
    const parsed = parseResidentLifeIntentProposal({
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "accept the addressed request as a later continuing matter while preserving current body authority",
        intent: {
          kind: "travel",
          goal: "visit the familiar fields later",
          targetActorId: null,
          targetRegionId: "fields",
          targetPosition: null,
          text: null,
        },
      },
      ...semanticUpdates,
    }, context);

    expect(parsed).toEqual({
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "accept the addressed request as a later continuing matter while preserving current body authority",
        intent: {
          kind: "travel",
          goal: "visit the familiar fields later",
          targetActorId: null,
          targetRegionId: "fields",
          targetPosition: null,
          text: null,
        },
      },
      beliefs: semanticUpdates.beliefs,
      concerns: [],
      reviewAfterSeconds: 30,
    });
  });

  it("accepts an explicit standing social continuation only on grounded communication", () => {
    const socialContext: ResidentCognitionContext = {
      ...context,
      knownActors: [{
        id: "player.jozz",
        label: "player.jozz",
        lastKnownPosition: { x: 12, y: 4 },
        lastObservedTick: 120,
        currentlyVisible: true,
        visibilityChangedTick: 120,
        lastHeardDirection: { x: 1, y: 0 },
        lastHeardDistanceBand: "near",
        lastHeardTick: 120,
      }],
    };

    const proposal = {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "I choose to make one explicit promise to the person who addressed me.",
        intent: {
          kind: "communicate",
          goal: "tell Jozz that I will remain here for a while",
          targetActorId: "player.jozz",
          targetRegionId: null,
          targetPosition: null,
          text: "Tak, zostanę tu jeszcze chwilę.",
        },
        standingSocialCommitment: {
          goal: "remain available to Jozz for a while",
          commitment: "I committed to remain here with Jozz for a while.",
        },
      },
      ...semanticUpdates,
    } as const;

    expect(parseResidentLifeIntentProposal(proposal, socialContext)?.commitmentDecision)
      .toEqual(proposal.commitmentDecision);

    expect(parseResidentLifeIntentProposal({
      ...proposal,
      commitmentDecision: {
        ...proposal.commitmentDecision,
        intent: {
          kind: "travel",
          goal: "visit the familiar fields later",
          targetActorId: null,
          targetRegionId: "fields",
          targetPosition: null,
          text: null,
        },
      },
    }, socialContext)).toBeNull();
  });

  it("represents decline, defer and clarification independently from body directives", () => {
    expect(parseResidentLifeIntentProposal({
      version: 1,
      commitmentDecision: { kind: "decline", reason: "the resident does not accept this request" },
      ...semanticUpdates,
    }, context)?.commitmentDecision).toEqual({
      kind: "decline",
      reason: "the resident does not accept this request",
    });

    expect(parseResidentLifeIntentProposal({
      version: 1,
      commitmentDecision: { kind: "defer", reason: "keep the request pending until the current matter changes" },
      ...semanticUpdates,
    }, context)?.commitmentDecision).toEqual({
      kind: "defer",
      reason: "keep the request pending until the current matter changes",
    });

    expect(parseResidentLifeIntentProposal({
      version: 1,
      commitmentDecision: {
        kind: "clarify",
        reason: "the requested place is ambiguous",
        question: "Które dokładnie miejsce masz na myśli?",
      },
      ...semanticUpdates,
    }, context)?.commitmentDecision).toEqual({
      kind: "clarify",
      reason: "the requested place is ambiguous",
      question: "Które dokładnie miejsce masz na myśli?",
    });
  });

  it("rejects an accepted target outside the resident's private known-world context", () => {
    expect(parseResidentLifeIntentProposal({
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "invent hidden destination",
        intent: {
          kind: "travel",
          goal: "visit a hidden castle",
          targetActorId: null,
          targetRegionId: "hidden-castle",
          targetPosition: null,
          text: null,
        },
      },
      ...semanticUpdates,
    }, context)).toBeNull();
  });

  it("fails closed on execution-method leakage or malformed decision envelopes", () => {
    expect(parseResidentLifeIntentProposal({
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "smuggle a route",
        intent: {
          kind: "travel",
          goal: "visit the familiar fields later",
          targetActorId: null,
          targetRegionId: "fields",
          targetPosition: null,
          text: null,
          routeRegionIds: ["hearth", "fields"],
        },
      },
      ...semanticUpdates,
    }, context)).toBeNull();

    expect(parseResidentLifeIntentProposal({
      version: 1,
      commitmentDecision: {
        kind: "clarify",
        reason: "ambiguous",
        question: "",
      },
      ...semanticUpdates,
    }, context)).toBeNull();
  });
});
