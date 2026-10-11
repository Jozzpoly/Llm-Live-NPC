import { describe, expect, it } from "vitest";
import worker from "./index";

function env() {
  return {
    AI: {
      async run() { return {}; },
    },
    AI_PROBE_LIMITER: {
      async limit() { return { success: true }; },
    },
  };
}

function authorizedEnv() {
  return { ...env(), SPC_RESEARCH_OPERATOR_TOKEN: "test-high-entropy-operator-key-0123456789-EXPERIMENT" };
}

function authorizedHeaders() {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${authorizedEnv().SPC_RESEARCH_OPERATOR_TOKEN}`,
  };
}

describe("Worker SPC Next routing", () => {
  it("denies all model-spending POST routes before provider parsing or network even when API key exists", async () => {
    const protectedRoutes = [
      "/api/agent/e1/decide",
      "/api/first-presence/semantic/propose",
      "/api/resident/converse",
      "/api/hearth/cognition",
      "/api/spc-next/cognition",
      "/api/spc-next/life-intent",
      "/api/spc-next/life-choice",
      "/api/spc-next/semantic",
      "/api/ai/qualify",
    ];
    for (const pathname of protectedRoutes) {
      const request = () => new Request(`https://example.test${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const closed = await worker.fetch(request(), {
        ...env(), OPENAI_API_KEY: "test-not-real",
      });
      expect(closed.status, pathname).toBe(403);
      await expect(closed.json()).resolves.toMatchObject({
        code: "research_operator_access_required",
      });
      // An armed Worker may still NOT authorize absent, wrong or short tokens.
      for (const value of ["", "Bearer wrong-secret-012345678901234567890", "Bearer abc"]) {
        const missing = new Request(`https://example.test${pathname}`, {
          method: "POST",
          headers: { authorization: value, "content-type": "application/json" },
          body: "{}",
        });
        const rejected = await worker.fetch(missing, authorizedEnv());
        expect(rejected.status, pathname).toBe(403);
      }
    }
    // Fail closed for FUTURE API routes too; otherwise a new paid handler
    // could silently become publicly callable when added to the Worker.
    const future = await worker.fetch(new Request("https://example.test/api/future-model-spend", {
      method: "POST",
    }), { ...env(), OPENAI_API_KEY: "test-not-real" });
    expect(future.status).toBe(403);
  });

  it("health remains read-only while reporting gate status without disclosing its token", async () => {
    const publicHealth = await worker.fetch(new Request("https://example.test/api/health"), env());
    const publicBody = await publicHealth.json();
    expect(publicBody).toMatchObject({ providerResearchOperatorGateConfigured: false });
    const guardedHealth = await worker.fetch(new Request("https://example.test/api/health"), authorizedEnv());
    const guardedBody = await guardedHealth.json();
    expect(guardedBody).toMatchObject({ providerResearchOperatorGateConfigured: true });
    expect(JSON.stringify(guardedBody)).not.toContain(authorizedEnv().SPC_RESEARCH_OPERATOR_TOKEN);
  });
  it("makes public health read-only even when an anonymous caller uses POST", async () => {
    const result = await worker.fetch(new Request("https://example.test/api/health", {
      method: "POST", body: "{}", headers: { "content-type": "application/json" },
    }), env());
    expect(result.status).toBe(405);
    await expect(result.json()).resolves.toMatchObject({ code: "method_not_allowed" });
  });

  it("advertises resident cognition, resident-life intent/choice and matter semantic endpoints", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/health"), env());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      spcNextCognitionEndpoint: "/api/spc-next/cognition",
      spcNextCognitionModelConfigured: "gpt-5.6-luna",
      spcNextLifeIntentEndpoint: "/api/spc-next/life-intent",
      spcNextLifeIntentModelConfigured: "gpt-5.6-luna",
      spcNextLifeChoiceEndpoint: "/api/spc-next/life-choice",
      spcNextLifeChoiceModelConfigured: "gpt-5.6-luna",
      spcNextSemanticEndpoint: "/api/spc-next/semantic",
      spcNextSemanticModelConfigured: "gpt-5.6-luna",
    });
  });

  it("routes resident-level cognition to its handler instead of falling through to 404", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/spc-next/cognition", {
      method: "POST",
      headers: authorizedHeaders(),
      body: JSON.stringify({}),
    }), authorizedEnv());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      diagnostic: {
        stage: "request_validation",
        code: "cognition_not_configured",
      },
    });
  });

  it("routes resident-life intent to its dedicated life-aware semantic handler", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/spc-next/life-intent", {
      method: "POST",
      headers: authorizedHeaders(),
      body: JSON.stringify({}),
    }), authorizedEnv());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "life_intent_not_configured",
    });
  });

  it("routes resident-life choice to its dedicated handler instead of legacy activity cognition", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/spc-next/life-choice", {
      method: "POST",
      headers: authorizedHeaders(),
      body: JSON.stringify({}),
    }), authorizedEnv());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "life_choice_not_configured",
    });
  });
});
