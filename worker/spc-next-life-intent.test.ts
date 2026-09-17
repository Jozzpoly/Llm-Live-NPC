import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractSpcNextLifeIntentProposal,
  handleSpcNextLifeIntent,
  sanitizeSpcNextLifeIntentContext,
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
      id: "matter.mira.a",
      status: "active",
      semanticRevision: 1,
      semanticCourse: "finish the current hearth errand",
      suspendedByMatterId: null,
      originEvidence: { id: "evidence:a", tick: 80, kind: "accepted_commitment", summary: "Mira accepted A" },
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

function proposal(targetRegionId = "fields") {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: "accept the addressed request as a possible continuing commitment",
      activity: {
        kind: "travel",
        goal: "check the fields later without erasing the current matter",
        targetActorId: null,
        targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}

function responseBody(value: unknown) {
  return {
    id: "resp_life_intent_1",
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

function configuredEnv(): SpcNextLifeIntentEnv {
  return {
    OPENAI_API_KEY: "test-key",
    SPC_NEXT_LIFE_INTENT_MODEL: "gpt-5.6-luna",
    SPC_NEXT_LIFE_INTENT_REASONING: "low",
    SPC_NEXT_LIFE_INTENT_MAX_OUTPUT_TOKENS: "1024",
    HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  };
}

function requestForContext(value: unknown = context) {
  return new Request("https://example.test/api/spc-next/life-intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("SPC Next resident-life intent Worker", () => {
  it("accepts truthful life context while another recovered run already owns the body", () => {
    const sanitized = sanitizeSpcNextLifeIntentContext(context);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.localActivity.kind).toBe("idle");
    expect(sanitized?.life.body).toEqual({ focusedRunId: "run.mira.a", deferredRunIds: [] });
  });

  it("extracts only proposals grounded in the same frozen private evidence and knowledge", () => {
    expect(extractSpcNextLifeIntentProposal(responseBody(proposal()), context)).toEqual(proposal());
    expect(extractSpcNextLifeIntentProposal(responseBody(proposal("hidden-global-region")), context)).toBeNull();
    expect(extractSpcNextLifeIntentProposal(responseBody({ ...proposal(), completed: true }), context)).toBeNull();
  });

  it("sends full resident-life truth upstream without granting execution semantics to the transport", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-5.6-luna",
        store: false,
        text: { format: { type: "json_schema", name: "spc_next_resident_life_intent", strict: true } },
      });
      const modelInput = JSON.parse(body.input[0].content);
      expect(modelInput.contract).toBe("resident_life_cognition_v1");
      expect(modelInput.localActivity.kind).toBe("idle");
      expect(modelInput).not.toHaveProperty("currentActivity");
      expect(modelInput.life.body.focusedRunId).toBe("run.mira.a");
      expect(body.instructions).toContain("does not cancel, replace or complete any recovered matter");
      expect(body.instructions).toContain("local admission");
      return new Response(JSON.stringify(responseBody(proposal())), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleSpcNextLifeIntent(requestForContext(), configuredEnv());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      proposal: proposal(),
      usage: {
        model: "gpt-5.6-luna",
        inputTokens: 180,
        outputTokens: 44,
        totalTokens: 224,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves durable structured matter meaning in model input without leaking a concrete execution method", async () => {
    const structured = structuredClone(context) as any;
    structured.life.matters[0].semanticIntent = {
      kind: "travel_region",
      goal: "return to the familiar hearth after the current obligation",
      targetRegionId: "hearth",
    };

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const modelInput = JSON.parse(body.input[0].content);
      expect(modelInput.life.matters[0].semanticIntent).toEqual({
        kind: "travel_region",
        goal: "return to the familiar hearth after the current obligation",
        targetRegionId: "hearth",
      });
      expect(modelInput.life.matters[0]).not.toHaveProperty("routeRegionIds");
      expect(modelInput.life.matters[0]).not.toHaveProperty("destination");
      return new Response(JSON.stringify(responseBody(proposal())), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleSpcNextLifeIntent(requestForContext(structured), configuredEnv());
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports semantic grounding rejection without exposing raw provider output", async () => {
    const invalid = proposal("hidden-global-region");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responseBody(invalid)), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const response = await handleSpcNextLifeIntent(requestForContext(), configuredEnv());
    expect(response.status).toBe(502);
    const body = await response.json() as any;
    expect(body).toMatchObject({
      ok: false,
      code: "invalid_life_intent_output",
      diagnostic: { stage: "proposal_validation", code: "schema_or_grounding" },
      usage: { model: "gpt-5.6-luna", inputTokens: 180, outputTokens: 44, totalTokens: 224 },
    });
    expect(body).not.toHaveProperty("output");
    expect(body).not.toHaveProperty("raw");
    expect(JSON.stringify(body)).not.toContain("hidden-global-region");
  });

  it("distinguishes the stricter life-intent envelope from shared semantic validation", async () => {
    const strictOnlyFailure = { ...proposal(), completed: true };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responseBody(strictOnlyFailure)), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const response = await handleSpcNextLifeIntent(requestForContext(), configuredEnv());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "invalid_life_intent_output",
      diagnostic: { stage: "proposal_validation", code: "strict_shape" },
    });
  });

  it("fails closed before upstream inference for malformed or unconfigured life context", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const configured: SpcNextLifeIntentEnv = {
      OPENAI_API_KEY: "test-key",
      HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    };
    const malformed = structuredClone(context) as any;
    malformed.life.body.focusedRunId = "run.hidden.not-in-context";

    const invalid = await handleSpcNextLifeIntent(new Request("https://example.test/api/spc-next/life-intent", {
      method: "POST",
      body: JSON.stringify(malformed),
    }), configured);
    expect(invalid.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    const unconfigured = await handleSpcNextLifeIntent(new Request("https://example.test/api/spc-next/life-intent", {
      method: "POST",
      body: JSON.stringify(context),
    }), {});
    expect(unconfigured.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
