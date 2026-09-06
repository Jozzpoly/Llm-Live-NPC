import { afterEach, describe, expect, it, vi } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { requestE1Decision } from "./e1-agent-api";
import { handleE1AgentDecision, type E1AgentEnv } from "../../worker/e1-agent";
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
      visibleEntities: [
        {
          id: "item.mug",
          kind: "item",
          label: "Red mug",
          distance: 40,
          direction: { x: 1, y: 0 },
          heldBy: null
        }
      ],
      fetchableItemIds: ["item.mug"]
    },
    observedChanges: [
      {
        kind: "item_holder_changed",
        itemId: "item.mug",
        previousHolderId: "player.jozz",
        holderId: null
      }
    ],
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
    ],
    usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 }
  };
}

function routeEnv(calls: string[]) {
  return {
    AI: {
      aiGatewayLogId: "r7-gateway",
      async run(_model: string, input: unknown) {
        calls.push("ai");
        const shaped = input as { tools?: unknown[] };
        return shaped.tools ? waitToolResult() : "transport probe ok";
      }
    },
    AI_PROBE_LIMITER: {
      async limit() {
        calls.push("limit");
        return { success: true };
      }
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("R7 Worker/public inference boundary characterization", () => {
  it("shows that a cross-origin simple text/plain POST can invoke E1 inference without an auth or CORS preflight gate", async () => {
    const calls: string[] = [];
    const response = await worker.fetch(
      new Request("https://lab.example/api/agent/e1/decide", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "content-type": "text/plain"
        },
        body: JSON.stringify(requestFixture())
      }),
      routeEnv(calls)
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual(["limit", "ai"]);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("shows that the historical qualification route can still invoke two model calls from one cross-origin simple POST", async () => {
    const calls: string[] = [];
    const response = await worker.fetch(
      new Request("https://lab.example/api/ai/qualify", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "content-type": "text/plain"
        },
        body: "probe"
      }),
      routeEnv(calls)
    );

    expect(response.status).toBe(200);
    expect(calls.filter((entry) => entry === "limit")).toHaveLength(1);
    expect(calls.filter((entry) => entry === "ai")).toHaveLength(2);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("shows that E1 consumes/parses request JSON before invoking the rate limiter", async () => {
    const callOrder: string[] = [];
    const request = {
      method: "POST",
      async json() {
        callOrder.push("json");
        return requestFixture();
      }
    } as unknown as Request;
    const env: E1AgentEnv = {
      AI: {
        async run() {
          throw new Error("AI must not run after limiter rejection.");
        }
      },
      AI_PROBE_LIMITER: {
        async limit() {
          callOrder.push("limit");
          return { success: false };
        }
      }
    };

    const response = await handleE1AgentDecision(request, env);
    expect(response.status).toBe(429);
    expect(callOrder).toEqual(["json", "limit"]);
  });

  it("shows that a large unknown raw JSON field is parsed and discarded before inference instead of being rejected by a small body gate", async () => {
    const calls: string[] = [];
    const body = {
      ...requestFixture(),
      ignoredPadding: "x".repeat(256 * 1024)
    };
    const response = await worker.fetch(
      new Request("https://lab.example/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }),
      routeEnv(calls)
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual(["limit", "ai"]);
  });

  it("shows that a provider exception message is returned verbatim through the public E1 error envelope", async () => {
    const env: E1AgentEnv = {
      AI: {
        async run() {
          throw new Error("r7-sensitive-provider-detail");
        }
      },
      AI_PROBE_LIMITER: {
        async limit() {
          return { success: true };
        }
      }
    };

    const response = await handleE1AgentDecision(
      new Request("https://lab.example/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestFixture())
      }),
      env
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(payload.error).toBe("r7-sensitive-provider-detail");
  });

  it("shows that Worker usage provenance is returned by the endpoint but discarded by the browser decision envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            cycleId: 1,
            decision: { kind: "wait" },
            model: "test-model",
            gatewayLogId: "gateway-log",
            latencyMs: 7,
            usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const envelope = await requestE1Decision(requestFixture());
    expect(envelope).toMatchObject({
      cycleId: 1,
      decision: { kind: "wait" },
      model: "test-model",
      gatewayLogId: "gateway-log",
      latencyMs: 7
    });
    expect("usage" in envelope).toBe(false);
  });
});
