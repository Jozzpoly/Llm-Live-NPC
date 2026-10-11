import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { FiveResidentUnifiedLivingRuntime } from "../src/spc-next/five-resident-unified-living-runtime";

const OPERATOR = "test-standalone-operator-secret-32-plus-characters-2026";

function workerEnvironment() {
  return {
    SPC_RESEARCH_OPERATOR_TOKEN: OPERATOR,
    OPENAI_API_KEY: "test-key-never-real",
    SPC_NEXT_LIFE_INTENT_MODEL: "gpt-5.6-luna",
    SPC_NEXT_LIFE_INTENT_REASONING: "low",
    SPC_NEXT_LIFE_INTENT_MAX_OUTPUT_TOKENS: "1024",
    AI: { run: vi.fn(async () => ({})) },
    AI_PROBE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    HEARTH_COGNITION_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  };
}

async function operatorCookie(env: ReturnType<typeof workerEnvironment>): Promise<string> {
  const response = await worker.fetch(new Request("https://spc.test/api/operator/login", {
    method: "POST",
    headers: {
      origin: "https://spc.test",
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ operator: OPERATOR }).toString(),
  }), env);
  expect(response.status).toBe(303);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toMatch(/^__Host-spc-operator=v1\./);
  return cookie!;
}

function upstreamResponse(originReasonId: string, targetRegionId: string): Response {
  const chosen = {
    originReasonId,
    proposal: {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "A bounded resident-owned next step grounded in the previous lived outcome",
        intent: {
          kind: "travel",
          goal: "visit a familiar place for a resident-owned next chapter",
          targetActorId: null,
          targetRegionId,
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    },
  };
  return Response.json({
    id: "mock-provider-never-a-real-luna-call",
    status: "completed",
    output: [
      { type: "reasoning" },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(chosen) }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Full manual SPC browser-session Worker/World research boundary", () => {
  it("retains Worker token usage after mock model output fails semantic validation", async () => {
    const env = workerEnvironment();
    const upstream = vi.fn(async () => Response.json({
      id: "mock-invalid-model-shape", status: "completed",
      output: [{ type: "reasoning" }, {
        type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: "{not a legal commitment}" }],
      }],
      usage: { input_tokens: 74, output_tokens: 33, total_tokens: 107 },
    }));
    vi.stubGlobal("fetch", upstream);
    const cookie = await operatorCookie(env);
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("origin", "https://spc.test");
      headers.set("sec-fetch-site", "same-origin");
      headers.set("cookie", cookie);
      return worker.fetch(new Request(new URL(String(input), "https://spc.test"), { ...init, headers }), env);
    });
    const living = new FiveResidentUnifiedLivingRuntime({
      providerDispatchMode: "manual", maxUpstreamRequests: 1,
      maxConcurrentCognition: 1, fetcher,
    });
    while (living.world.tick < 2_600) living.advanceOneWorldTick();
    expect(living.requestOneResidentCognition("resident.mira")).toBe("started");
    for (let i = 0; i < 40 && living.diagnostics().providerInboxCount === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(living.diagnostics().providerInboxCount).toBe(1);
    const arrived = living.diagnostics().recentProviderEvents.find(e => e.status === "arrival_ready");
    expect(arrived?.detail).toContain("HTTP 502");
    expect(arrived?.detail).toContain("usage 74/33/107 tokens");
    expect(arrived?.usage).toMatchObject({
      model: "gpt-5.6-luna", inputTokens: 74, outputTokens: 33,
      totalTokens: 107, elapsedMs: expect.any(Number),
    });
    living.advanceOneWorldTick();
    const refused = living.diagnostics().recentProviderEvents.find(e => e.status === "provider_error");
    expect(refused?.usage).toMatchObject({ totalTokens: 107 });
    expect(living.life("resident.mira")!.matterScope.matterIds()).toEqual([]);
    for (let step = 0; step < 100; step++) living.advanceOneWorldTick();
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(living.diagnostics().providerHardBudget.upstreamRequestsStarted).toBe(1);
  });

  it("bridges real private World pressure through authenticated Worker to a MOCK model and factual body, with no automatic calls", async () => {
    const env = workerEnvironment();
    const calls: Array<{ residentId: string; originReasonId: string; kind: string }> = [];
    const upstream = vi.fn(async (target: RequestInfo | URL, init?: RequestInit) => {
      expect(String(target)).toBe("https://api.openai.com/v1/responses");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-5.6-luna");
      expect(body.store).toBe(false);
      expect(body.instructions).toContain("five-resident-causal-v1");
      const context = JSON.parse(body.input[0].content);
      expect(context.resident.id).toBe("resident.mira");
      const reason = context.reasons.find((r: { kind: string }) => r.kind === "activity_completed");
      expect(reason?.id).toBeTruthy();
      const nextKnown = context.knownRegions.find(
        (r: { id: string }) => r.id !== context.currentRegionId,
      );
      expect(nextKnown?.id).toBeTruthy();
      calls.push({ residentId: context.resident.id, originReasonId: reason.id, kind: reason.kind });
      return upstreamResponse(reason.id, nextKnown.id);
    });
    vi.stubGlobal("fetch", upstream);

    // Anonymous requests cannot reach model parsing, much less paid transport.
    const anonymous = await worker.fetch(new Request("https://spc.test/api/spc-next/life-intent", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }), env);
    expect(anonymous.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();

    const cookie = await operatorCookie(env);
    const invalid = await worker.fetch(new Request("https://spc.test/api/spc-next/life-intent", {
      method: "POST",
      headers: {
        origin: "https://spc.test",
        "sec-fetch-site": "same-origin",
        cookie,
        "content-type": "application/json",
      },
      body: "{}",
    }), env);
    expect(invalid.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();

    // Production-shaped route, same-origin HttpOnly session cookie, no Bearer in JS.
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("origin", "https://spc.test");
      headers.set("sec-fetch-site", "same-origin");
      headers.set("cookie", cookie);
      return worker.fetch(new Request(new URL(String(input), "https://spc.test"), {
        ...init,
        headers,
      }), env);
    });

    const living = new FiveResidentUnifiedLivingRuntime({
      providerDispatchMode: "manual",
      maxUpstreamRequests: 1,
      maxConcurrentCognition: 1,
      fetcher,
    });
    while (living.world.tick < 2_600) living.advanceOneWorldTick();
    expect(living.lifeRuntime.claimedResidentIds()).toHaveLength(5);
    expect(living.diagnostics().providerRequestCount).toBe(0);
    expect(upstream).not.toHaveBeenCalled();

    const before = living.world.publicSnapshot().actors.find(a => a.id === "resident.mira")!;
    const beforePos = { ...before.position };
    expect(living.requestOneResidentCognition("resident.mira")).toBe("started");
    expect(living.diagnostics().providerHardBudget.upstreamRequestsStarted).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Microtask completion cannot apply a provider reply outside a World tick.
    for (let i = 0; i < 40 && living.diagnostics().providerInboxCount === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(living.diagnostics().providerInboxCount).toBe(1);
    expect(living.life("resident.mira")!.matterScope.matterIds()).toEqual([]);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ residentId: "resident.mira", kind: "activity_completed" });
    const arrivalEvent = living.diagnostics().recentProviderEvents.find(
      e => e.residentId === "resident.mira" && e.status === "arrival_ready",
    );
    expect(arrivalEvent?.detail).toContain("activity_completed");
    expect(arrivalEvent?.detail).toContain("usage 100/50/150 tokens");
    expect(arrivalEvent?.usage).toMatchObject({
      model: "gpt-5.6-luna",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      elapsedMs: expect.any(Number),
    });


    living.advanceOneWorldTick();
    expect(living.diagnostics().recentProviderEvents.some(e =>
      e.residentId === "resident.mira"
      && e.status === "admitted"
      && e.detail.startsWith("applied accept; matter=")
    )).toBe(true);
    expect(living.life("resident.mira")!.matterScope.matterIds().length).toBe(1);

    for (let i = 0; i < 240; i++) living.advanceOneWorldTick();
    const after = living.world.publicSnapshot().actors.find(a => a.id === "resident.mira")!;
    expect(Math.hypot(after.position.x - beforePos.x, after.position.y - beforePos.y)).toBeGreaterThan(10);
    expect(living.diagnostics().providerHardBudget.upstreamRequestsStarted).toBe(1);
    expect(living.requestOneResidentCognition("resident.mira")).toBe("budget_exhausted");
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
