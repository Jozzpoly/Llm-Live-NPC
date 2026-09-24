import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleSpcNextLifeIntent,
  type SpcNextLifeIntentEnv,
} from "./spc-next-life-intent";

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
      id: "matter.mira.workshop",
      status: "active",
      semanticRevision: 1,
      semanticCourse: "finish the current workshop errand",
      suspendedByMatterId: null,
      originEvidence: null,
      semanticEvidence: null,
      lastOutcomeEvidence: null,
      activeRun: {
        runId: "run.mira.workshop",
        taskId: "task.mira.workshop",
        semanticRevision: 1,
        canMutateWorld: true,
        bodyState: "focused",
      },
    }],
    body: { focusedRunId: "run.mira.workshop", deferredRunIds: [] },
  },
} as const;

const acceptedFieldsProposal = {
  version: 1,
  commitmentDecision: {
    kind: "accept",
    reason: "accept this as a later commitment without taking body authority from Workshop",
    intent: {
      kind: "travel",
      goal: "visit the familiar fields later",
      targetActorId: null,
      targetRegionId: "fields",
      targetPosition: null,
      text: null,
    },
  },
  beliefs: [{
    id: "belief:mira:fields-request:120",
    statement: "Mira heard a request to check the fields later.",
    confidence: 1,
    evidenceIds: ["percept:speech:120"],
  }],
  concerns: [],
  reviewAfterSeconds: 30,
} as const;

function providerResponse(value: unknown) {
  return {
    id: "resp_life_commitment_handler_1",
    status: "completed",
    output: [{
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: JSON.stringify(value) }],
    }],
    usage: { input_tokens: 200, output_tokens: 60, total_tokens: 260 },
  };
}

function env(): SpcNextLifeIntentEnv {
  return {
    OPENAI_API_KEY: "test-key",
    SPC_NEXT_LIFE_INTENT_MODEL: "gpt-5.6-luna",
    SPC_NEXT_LIFE_INTENT_REASONING: "low",
    SPC_NEXT_LIFE_INTENT_MAX_OUTPUT_TOKENS: "1024",
    HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("SPC Next life-intent endpoint commitment contract", () => {
  it("asks the provider for commitment decisions instead of body activity replacement", async () => {
    let upstreamRequest: any = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      upstreamRequest = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(providerResponse({
        originReasonId: "reason:mira:speech:120",
        proposal: acceptedFieldsProposal,
      })), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    const response = await handleSpcNextLifeIntent(new Request("https://example.test/api/spc-next/life-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context),
    }), env());

    expect(upstreamRequest.text.format).toMatchObject({
      type: "json_schema",
      name: "spc_next_resident_life_commitment",
      strict: true,
    });
    expect(upstreamRequest.text.format.schema.properties).toHaveProperty("originReasonId");
    expect(upstreamRequest.text.format.schema.properties).toHaveProperty("proposal");
    expect(upstreamRequest.text.format.schema.properties.proposal.properties).toHaveProperty("commitmentDecision");
    expect(upstreamRequest.text.format.schema.properties.proposal.properties).not.toHaveProperty("activityDirective");
    const commitmentVariants = upstreamRequest.text.format.schema.properties.proposal
      .properties.commitmentDecision.anyOf;
    const standingVariant = commitmentVariants.find((variant: any) => (
      variant.properties?.standingSocialCommitment
    ));
    expect(standingVariant).toBeTruthy();
    expect(Object.keys(standingVariant.properties.standingSocialCommitment.properties))
      .toEqual(["goal"]);
    expect(upstreamRequest.instructions).toContain("commitmentDecision");
    expect(upstreamRequest.instructions).toContain("does not seize the body");
    expect(upstreamRequest.instructions).toContain("standingSocialCommitment");
    const releaseVariant = commitmentVariants.find((variant: any) => (
      variant.properties?.kind?.enum?.includes("release_standing")
    ));
    expect(releaseVariant).toBeTruthy();
    expect(Object.keys(releaseVariant.properties)).toEqual([
      "kind",
      "reason",
      "matterId",
    ]);
    expect(upstreamRequest.instructions).toContain("release_standing");
    expect(upstreamRequest.instructions).toContain(
      "sole bounded lifecycle exception is release_standing",
    );
    expect(upstreamRequest.instructions).toContain(
      "does not replace or complete recovered matters by implication",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      originReasonId: "reason:mira:speech:120",
      proposal: acceptedFieldsProposal,
      usage: { model: "gpt-5.6-luna", inputTokens: 200, outputTokens: 60, totalTokens: 260 },
    });
  });
});
