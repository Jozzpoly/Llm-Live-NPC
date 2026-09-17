import { describe, expect, it } from "vitest";
import { extractSpcNextLifeCommitmentProposal } from "./spc-next-life-intent";

const context = {
  contract: "resident_life_cognition_v1",
  resident: { id: "resident.mira", name: "Mira" },
  tick: 120,
  currentRegionId: "hearth",
  reasons: [{
    id: "reason:mira:speech:120",
    tick: 120,
    kind: "heard_speech",
    salience: 0.8,
    summary: "Mira heard a new addressed request while another matter owns the body",
    evidenceIds: ["percept:speech:120"],
  }],
  localActivity: {
    id: "activity:resident.mira:idle:1",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "legacy local projection is idle",
  },
  recentPercepts: [{
    id: "percept:speech:120",
    occurrenceId: "occurrence:speech:120",
    tick: 120,
    phenomenon: "speech",
    modality: "hearing",
    actorId: null,
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "Mira heard an addressed request",
    text: "Mira, sprawdzisz też później pola?",
    addressed: true,
  }],
  concerns: [],
  beliefs: [],
  knownActors: [],
  knownRegions: [
    { id: "hearth", label: "Hearth", knowledge: "visited", lastVisitedTick: 100 },
    { id: "fields", label: "Fields", knowledge: "familiar", lastVisitedTick: null },
  ],
  life: {
    version: 1,
    matters: [{
      id: "matter.mira.a",
      status: "active",
      semanticRevision: 1,
      semanticCourse: "finish the current workshop errand",
      suspendedByMatterId: null,
      originEvidence: null,
      semanticEvidence: null,
      lastOutcomeEvidence: null,
      activeRun: {
        runId: "run.mira.a",
        taskId: "task.mira.a",
        semanticRevision: 1,
        canMutateWorld: true,
        bodyState: "focused",
      },
    }],
    body: { focusedRunId: "run.mira.a", deferredRunIds: [] },
  },
} as const;

function acceptedFieldsProposal(targetRegionId = "fields") {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "accept this as a later commitment without replacing the current focused run",
      intent: {
        kind: "travel",
        goal: "visit the familiar fields later",
        targetActorId: null,
        targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [{
      id: "belief:mira:fields-request:120",
      statement: "Jozz asked Mira to check the fields later.",
      confidence: 1,
      evidenceIds: ["percept:speech:120"],
    }],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}

function responseBody(value: unknown) {
  return {
    id: "resp_life_commitment_1",
    status: "completed",
    output: [
      { type: "reasoning" },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
    usage: { input_tokens: 180, output_tokens: 44, total_tokens: 224 },
  };
}

describe("SPC Next resident-life commitment proposal extraction", () => {
  it("accepts a strict commitment decision grounded in the same private known-world frame", () => {
    expect(extractSpcNextLifeCommitmentProposal(responseBody(acceptedFieldsProposal()), context))
      .toEqual(acceptedFieldsProposal());
  });

  it("rejects hidden targets and execution-method leakage", () => {
    expect(extractSpcNextLifeCommitmentProposal(
      responseBody(acceptedFieldsProposal("hidden-global-region")),
      context,
    )).toBeNull();

    const leaked = structuredClone(acceptedFieldsProposal()) as any;
    leaked.commitmentDecision.intent.routeRegionIds = ["hearth", "fields"];
    expect(extractSpcNextLifeCommitmentProposal(responseBody(leaked), context)).toBeNull();
  });

  it("accepts explicit decline, defer and clarification without inventing body directives", () => {
    for (const commitmentDecision of [
      { kind: "decline", reason: "do not accept this request" },
      { kind: "defer", reason: "keep the request undecided until later review" },
      { kind: "clarify", reason: "the request is ambiguous", question: "Które pola masz na myśli?" },
    ]) {
      const proposal = {
        version: 1,
        commitmentDecision,
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      };
      expect(extractSpcNextLifeCommitmentProposal(responseBody(proposal), context)).toEqual(proposal);
    }
  });
});
