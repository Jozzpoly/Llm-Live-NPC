import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractSpcNextSemanticDecision,
  handleSpcNextSemantic,
  sanitizeSpcNextSemanticRun,
  type SpcNextSemanticEnv,
} from "./spc-next-semantic";

const SEARCH_CAPABILITY_ID = "local.search.remembered-workshop-area";
const run = {
  version: 2,
  providerRunId: "semantic-provider:7",
  matter: {
    id: "matter.janek.missing-crate",
    semanticCourse: "go to the last-known workshop crate position and pick it up",
  },
  semanticEvidence: {
    id: "evidence:janek:checked-absence:crate.workshop.01:120",
    tick: 120,
    kind: "checked_absence",
    summary: "Checked the old workshop position; the familiar crate is not visible there now.",
  },
  localCapabilities: [{
    id: SEARCH_CAPABILITY_ID,
    summary: "Search the remembered workshop area using local embodied movement and perception; this does not imply the crate is there.",
  }],
} as const;

function responseBody(semanticCourse: string, localCapabilityId: string | null = null) {
  return {
    id: "resp_semantic_1",
    status: "completed",
    output: [
      { type: "reasoning" },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify({ semanticCourse, localCapabilityId }) }],
      },
    ],
    usage: { input_tokens: 42, output_tokens: 17, total_tokens: 59 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPC Next recovered semantic Worker", () => {
  it("sanitizes matter evidence plus bounded resident-offered capabilities and rejects malformed capability offers", () => {
    expect(sanitizeSpcNextSemanticRun(run)).toEqual(run);
    expect(sanitizeSpcNextSemanticRun({
      ...run,
      semanticEvidence: { ...run.semanticEvidence, tick: -1 },
    })).toBeNull();
    expect(sanitizeSpcNextSemanticRun({
      ...run,
      matter: { ...run.matter, semanticCourse: "" },
    })).toBeNull();
    expect(sanitizeSpcNextSemanticRun({
      ...run,
      localCapabilities: [...run.localCapabilities, { ...run.localCapabilities[0] }],
    })).toBeNull();
    expect(sanitizeSpcNextSemanticRun({
      ...run,
      localCapabilities: [{ id: "bad capability id", summary: "invalid id" }],
    })).toBeNull();
  });

  it("extracts one semantic course plus only an offered local capability and rejects extra authority-shaped fields", () => {
    expect(extractSpcNextSemanticDecision(
      responseBody("search the nearby workshop area", SEARCH_CAPABILITY_ID),
      [SEARCH_CAPABILITY_ID],
    )).toEqual({
      semanticCourse: "search the nearby workshop area",
      localCapabilityId: SEARCH_CAPABILITY_ID,
    });
    expect(extractSpcNextSemanticDecision(
      responseBody("wait and reconsider", null),
      [SEARCH_CAPABILITY_ID],
    )).toEqual({
      semanticCourse: "wait and reconsider",
      localCapabilityId: null,
    });
    expect(extractSpcNextSemanticDecision(
      responseBody("teleport there", "local.teleport.hidden-object"),
      [SEARCH_CAPABILITY_ID],
    )).toBeNull();

    const extra = responseBody("search nearby", SEARCH_CAPABILITY_ID);
    (extra.output[1] as { content: Array<{ type: string; text: string }> }).content[0]!.text = JSON.stringify({
      semanticCourse: "search nearby",
      localCapabilityId: SEARCH_CAPABILITY_ID,
      activity: { kind: "travel" },
    });
    expect(extractSpcNextSemanticDecision(extra, [SEARCH_CAPABILITY_ID])).toBeNull();
  });

  it("sends only matter, semantic evidence and resident-offered capabilities upstream and returns the selected offer with usage", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-5.6-luna",
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "spc_next_semantic_course",
            strict: true,
          },
        },
      });
      const modelInput = JSON.parse(body.input[0].content);
      expect(modelInput).toEqual({
        matter: run.matter,
        semanticEvidence: run.semanticEvidence,
        localCapabilities: run.localCapabilities,
      });
      expect(JSON.stringify(modelInput)).not.toContain(run.providerRunId);
      expect(body.text.format.schema.properties).toEqual({
        semanticCourse: { type: "string", minLength: 1, maxLength: 2_000 },
        localCapabilityId: {
          type: ["string", "null"],
          enum: [SEARCH_CAPABILITY_ID, null],
        },
      });
      expect(body.text.format.schema.required).toEqual(["semanticCourse", "localCapabilityId"]);
      return new Response(JSON.stringify(responseBody(
        "search the nearby workshop area before escalating",
        SEARCH_CAPABILITY_ID,
      )), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env: SpcNextSemanticEnv = {
      OPENAI_API_KEY: "test-key",
      SPC_NEXT_SEMANTIC_MODEL: "gpt-5.6-luna",
      SPC_NEXT_SEMANTIC_REASONING: "low",
      SPC_NEXT_SEMANTIC_MAX_OUTPUT_TOKENS: "512",
      HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    };
    const response = await handleSpcNextSemantic(new Request("https://example.test/api/spc-next/semantic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(run),
    }), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      providerRunId: run.providerRunId,
      decision: {
        semanticCourse: "search the nearby workshop area before escalating",
        localCapabilityId: SEARCH_CAPABILITY_ID,
      },
      usage: {
        model: "gpt-5.6-luna",
        inputTokens: 42,
        outputTokens: 17,
        totalTokens: 59,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the semantic provider is not configured", async () => {
    const response = await handleSpcNextSemantic(new Request("https://example.test/api/spc-next/semantic", {
      method: "POST",
      body: JSON.stringify(run),
    }), {});
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "semantic_not_configured" });
  });
});
