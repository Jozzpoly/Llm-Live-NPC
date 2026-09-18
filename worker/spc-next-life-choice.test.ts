import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractSpcNextLifeChoiceDecision,
  handleSpcNextLifeChoice,
  sanitizeSpcNextLifeChoiceContext,
  type SpcNextLifeChoiceEnv,
} from "./spc-next-life-choice";

const B = "matter.mira.b";
const C = "matter.mira.c";

const context = {
  contract: "resident_life_cognition_v1",
  resident: { id: "resident.mira", name: "Mira" },
  tick: 120,
  currentRegionId: "hearth",
  reasons: [{
    id: "reason:mira:review:120",
    tick: 120,
    kind: "quiet_review",
    salience: 0.2,
    summary: "review continuing resident life",
    evidenceIds: [],
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
  recentPercepts: [],
  concerns: [],
  beliefs: [],
  knownActors: [],
  knownRegions: [{ id: "hearth", label: "Hearth", knowledge: "visited", lastVisitedTick: 100 }],
  life: {
    version: 1,
    matters: [
      {
        id: B,
        status: "active",
        semanticRevision: 1,
        semanticCourse: "return to the hearth before evening",
        suspendedByMatterId: null,
        originEvidence: { id: "evidence:b", tick: 80, kind: "life_context", summary: "B matters to Mira" },
        semanticEvidence: { id: "evidence:b", tick: 80, kind: "life_context", summary: "B matters to Mira" },
        lastOutcomeEvidence: null,
        activeRun: {
          runId: "run.mira.b",
          taskId: "task.mira.b",
          semanticRevision: 1,
          canMutateWorld: true,
          bodyState: "deferred",
        },
      },
      {
        id: C,
        status: "active",
        semanticRevision: 2,
        semanticCourse: "check the fields after recent settlement changes",
        suspendedByMatterId: null,
        originEvidence: { id: "evidence:c:origin", tick: 70, kind: "life_context", summary: "C originated earlier" },
        semanticEvidence: { id: "evidence:c:revision", tick: 110, kind: "life_context", summary: "C has newer pressure" },
        lastOutcomeEvidence: null,
        activeRun: {
          runId: "run.mira.c",
          taskId: "task.mira.c",
          semanticRevision: 2,
          canMutateWorld: true,
          bodyState: "deferred",
        },
      },
    ],
    body: { focusedRunId: null, deferredRunIds: ["run.mira.b", "run.mira.c"] },
  },
} as const;

function responseBody(decision: unknown) {
  return {
    id: "resp_life_choice_1",
    status: "completed",
    output: [
      { type: "reasoning" },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify({ version: 1, decision }) }],
      },
    ],
    usage: { input_tokens: 140, output_tokens: 22, total_tokens: 162 },
  };
}

function focusB() {
  return {
    kind: "focus_matter",
    matterId: B,
    reason: "finish the nearer settlement commitment first",
    reviewAfterSeconds: 12,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("SPC Next resident-life choice Worker", () => {
  it("sanitizes a truthful free-body multi-matter context and derives candidates from exact deferred runs", () => {
    const sanitized = sanitizeSpcNextLifeChoiceContext(context);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.candidateMatterIds).toEqual([B, C]);
    expect(sanitized?.context.localActivity.kind).toBe("idle");
    expect(sanitized?.context.life.body).toEqual(context.life.body);

    expect(sanitizeSpcNextLifeChoiceContext({
      ...context,
      life: { ...context.life, body: { ...context.life.body, focusedRunId: "run.mira.b" } },
    })).toBeNull();
    expect(sanitizeSpcNextLifeChoiceContext({
      ...context,
      life: { ...context.life, body: { ...context.life.body, deferredRunIds: ["run.mira.b"] } },
    })).toBeNull();
    expect(sanitizeSpcNextLifeChoiceContext({
      ...context,
      life: { ...context.life, matters: [context.life.matters[0], context.life.matters[0]] },
    })).toBeNull();
    expect(sanitizeSpcNextLifeChoiceContext({ ...context, currentRegionId: "hidden-global-region" })).toBeNull();
  });

  it("preserves shared structured matter intent and rejects execution-method leakage instead of maintaining a second life schema", () => {
    const structured = structuredClone(context) as any;
    structured.life.matters[0].semanticIntent = {
      kind: "travel_region",
      goal: "return to the familiar hearth before evening",
      targetRegionId: "hearth",
    };
    structured.life.matters[1].semanticIntent = {
      kind: "travel_region",
      goal: "check the familiar fields after the current work",
      targetRegionId: "fields",
    };

    const sanitized = sanitizeSpcNextLifeChoiceContext(structured);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.candidateMatterIds).toEqual([B, C]);
    expect(sanitized?.context.life.matters.map((matter) => matter.semanticIntent)).toEqual([
      { kind: "travel_region", goal: "return to the familiar hearth before evening", targetRegionId: "hearth" },
      { kind: "travel_region", goal: "check the familiar fields after the current work", targetRegionId: "fields" },
    ]);

    const leakedMethod = structuredClone(structured);
    leakedMethod.life.matters[1].semanticIntent.routeRegionIds = ["hearth", "fields"];
    expect(sanitizeSpcNextLifeChoiceContext(leakedMethod)).toBeNull();
  });

  it("extracts only a bounded choice among supplied matters or an explicit defer-all", () => {
    expect(extractSpcNextLifeChoiceDecision(responseBody(focusB()), [B, C])).toEqual(focusB());
    expect(extractSpcNextLifeChoiceDecision(responseBody({
      kind: "defer_all",
      reason: "the available evidence does not justify choosing yet",
      reviewAfterSeconds: 3,
    }), [B, C])).toEqual({
      kind: "defer_all",
      reason: "the available evidence does not justify choosing yet",
      reviewAfterSeconds: 3,
    });
    expect(extractSpcNextLifeChoiceDecision(responseBody({ ...focusB(), matterId: "matter.mira.fabricated" }), [B, C])).toBeNull();
    expect(extractSpcNextLifeChoiceDecision(responseBody({ ...focusB(), completed: true }), [B, C])).toBeNull();
  });

  it("sends the resident-life contract upstream with a dynamic candidate-only schema", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-5.6-luna",
        store: false,
        text: { format: { type: "json_schema", name: "spc_next_resident_life_choice", strict: true } },
      });
      const modelInput = JSON.parse(body.input[0].content);
      expect(modelInput.contract).toBe("resident_life_cognition_v1");
      expect(modelInput.localActivity.kind).toBe("idle");
      expect(modelInput.life.body).toEqual(context.life.body);
      expect(body.text.format.schema.properties.decision.anyOf[0].properties.matterId.enum).toEqual([B, C]);
      return new Response(JSON.stringify(responseBody(focusB())), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env: SpcNextLifeChoiceEnv = {
      OPENAI_API_KEY: "test-key",
      SPC_NEXT_LIFE_CHOICE_MODEL: "gpt-5.6-luna",
      SPC_NEXT_LIFE_CHOICE_REASONING: "low",
      SPC_NEXT_LIFE_CHOICE_MAX_OUTPUT_TOKENS: "512",
      HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    };

    const response = await handleSpcNextLifeChoice(new Request("https://example.test/api/spc-next/life-choice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context),
    }), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      proposal: { version: 1, decision: focusB() },
      usage: {
        model: "gpt-5.6-luna",
        inputTokens: 140,
        outputTokens: 22,
        totalTokens: 162,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed before upstream inference for malformed or unconfigured choice context", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const configured: SpcNextLifeChoiceEnv = {
      OPENAI_API_KEY: "test-key",
      HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    };
    const malformed = structuredClone(context) as any;
    malformed.life.body.deferredRunIds.push("run.hidden.not-in-context");

    const invalid = await handleSpcNextLifeChoice(new Request("https://example.test/api/spc-next/life-choice", {
      method: "POST",
      body: JSON.stringify(malformed),
    }), configured);
    expect(invalid.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    const unconfigured = await handleSpcNextLifeChoice(new Request("https://example.test/api/spc-next/life-choice", {
      method: "POST",
      body: JSON.stringify(context),
    }), {});
    expect(unconfigured.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
