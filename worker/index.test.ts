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

describe("Worker SPC Next routing", () => {
  it("advertises resident cognition, resident-life choice and matter semantic endpoints", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/health"), env());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      spcNextCognitionEndpoint: "/api/spc-next/cognition",
      spcNextCognitionModelConfigured: "gpt-5.6-luna",
      spcNextLifeChoiceEndpoint: "/api/spc-next/life-choice",
      spcNextLifeChoiceModelConfigured: "gpt-5.6-luna",
      spcNextSemanticEndpoint: "/api/spc-next/semantic",
      spcNextSemanticModelConfigured: "gpt-5.6-luna",
    });
  });

  it("routes resident-level cognition to its handler instead of falling through to 404", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/spc-next/cognition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }), env());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      diagnostic: {
        stage: "request_validation",
        code: "cognition_not_configured",
      },
    });
  });

  it("routes resident-life choice to its dedicated handler instead of legacy activity cognition", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/spc-next/life-choice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }), env());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "life_choice_not_configured",
    });
  });
});
