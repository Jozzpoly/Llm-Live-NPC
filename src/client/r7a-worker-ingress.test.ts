import { describe, expect, it } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { handleE1AgentDecision, type E1AgentEnv } from "../../worker/e1-agent";
import { E1_MAX_REQUEST_BODY_BYTES } from "../../worker/e1-ingress";
import worker from "../../worker/index";

function requestFixture(): E1CycleRequest {
  return {
    cycleId: 1,
    trigger: "perception_changed",
    perception: {
      tick: 10,
      observer: {
        id: "npc.001",
        label: "NPC-001",
        locationId: "yard",
        locationLabel: "Common Yard",
        heldItemId: null
      },
      visibleEntities: [],
      fetchableItemIds: []
    },
    observedChanges: [],
    observedChangesDropped: 0,
    previousExperience: null
  };
}

function waitToolResult() {
  return {
    choices: [
      {
        message: {
          tool_calls: [
            {
              type: "function",
              function: { name: "wait", arguments: "{}" }
            }
          ]
        }
      }
    ]
  };
}

function envWithCalls(calls: string[], limiterSuccess = true): E1AgentEnv {
  return {
    AI: {
      aiGatewayLogId: "r7a-gateway",
      async run() {
        calls.push("ai");
        return waitToolResult();
      }
    },
    AI_PROBE_LIMITER: {
      async limit() {
        calls.push("limit");
        return { success: limiterSuccess };
      }
    }
  };
}

describe("R7a bounded Worker inference ingress", () => {
  it("rejects an explicit cross-site browser request before limiter or AI", async () => {
    const calls: string[] = [];
    const response = await handleE1AgentDecision(
      new Request("https://lab.example/api/agent/e1/decide", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          "sec-fetch-site": "cross-site"
        },
        body: JSON.stringify(requestFixture())
      }),
      envWithCalls(calls)
    );

    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("rejects browser-simple text/plain even when Fetch Metadata is unavailable", async () => {
    const calls: string[] = [];
    const response = await handleE1AgentDecision(
      new Request("https://lab.example/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(requestFixture())
      }),
      envWithCalls(calls)
    );

    expect(response.status).toBe(415);
    expect(calls).toEqual([]);
  });

  it("rejects cross-site application/json before limiter as Fetch-Metadata defense in depth", async () => {
    const calls: string[] = [];
    const response = await handleE1AgentDecision(
      new Request("https://lab.example/api/agent/e1/decide", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "cross-site"
        },
        body: JSON.stringify(requestFixture())
      }),
      envWithCalls(calls)
    );

    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("keeps direct/non-browser JSON clients within the rate-limited lab boundary rather than pretending this is auth", async () => {
    const calls: string[] = [];
    const response = await handleE1AgentDecision(
      new Request("https://lab.example/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(requestFixture())
      }),
      envWithCalls(calls)
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual(["limit", "ai"]);
  });

  it("rejects through the limiter before accessing or consuming an undeclared request body", async () => {
    const calls: string[] = [];
    let bodyAccessed = false;
    const request = {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      get body() {
        bodyAccessed = true;
        throw new Error("Body must not be accessed after limiter rejection.");
      }
    } as unknown as Request;

    const response = await handleE1AgentDecision(request, envWithCalls(calls, false));
    expect(response.status).toBe(429);
    expect(calls).toEqual(["limit"]);
    expect(bodyAccessed).toBe(false);
  });

  it("rejects a declared oversized body before consuming limiter budget or body bytes", async () => {
    const calls: string[] = [];
    const response = await handleE1AgentDecision(
      new Request("https://lab.example/api/agent/e1/decide", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(E1_MAX_REQUEST_BODY_BYTES + 1)
        },
        body: "{}"
      }),
      envWithCalls(calls)
    );

    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("bounds an oversized undeclared JSON stream after limiter but before sanitation or AI", async () => {
    const calls: string[] = [];
    const oversized = JSON.stringify({
      ...requestFixture(),
      ignoredPadding: "x".repeat(E1_MAX_REQUEST_BODY_BYTES + 1024)
    });
    const response = await handleE1AgentDecision(
      new Request("https://lab.example/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: oversized
      }),
      envWithCalls(calls)
    );

    expect(response.status).toBe(413);
    expect(calls).toEqual(["limit"]);
  });

  it("retires the historical two-model qualification route without limiter or AI calls", async () => {
    const calls: string[] = [];
    const env = envWithCalls(calls);
    const response = await worker.fetch(
      new Request("https://lab.example/api/ai/qualify", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "probe"
      }),
      env
    );

    expect(response.status).toBe(410);
    expect(calls).toEqual([]);
  });

  it("reports the retired transport qualifier truthfully through health provenance", async () => {
    const calls: string[] = [];
    const response = await worker.fetch(
      new Request("https://lab.example/api/health"),
      envWithCalls(calls)
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.transportQualificationEndpoint).toBeNull();
    expect(payload).not.toHaveProperty("probeCandidates");
    expect(calls).toEqual([]);
  });
});
