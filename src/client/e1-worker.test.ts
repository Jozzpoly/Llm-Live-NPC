import { describe, expect, it } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { handleE1AgentDecision, type E1AgentEnv } from "../../worker/e1-agent";

function requestFixture(fetchableItemIds: string[] = ["item.mug"]): E1CycleRequest {
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
          distance: 41,
          direction: { x: -1, y: 0 },
          heldBy: null
        }
      ],
      fetchableItemIds
    },
    observedChanges: [
      {
        kind: "item_holder_changed",
        itemId: "item.mug",
        previousHolderId: "player.jozz",
        holderId: null
      }
    ],
    previousExperience: null
  };
}

function nestedToolCall(name: string, args: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          tool_calls: [
            {
              type: "function",
              function: {
                name,
                arguments: JSON.stringify(args)
              }
            }
          ]
        }
      }
    ]
  };
}

function makeEnv(result: unknown, captured: unknown[]): E1AgentEnv {
  return {
    AI: {
      aiGatewayLogId: "test-gateway-log",
      async run(_model: string, input: unknown) {
        captured.push(input);
        return result;
      }
    },
    AI_PROBE_LIMITER: {
      async limit() {
        return { success: true };
      }
    }
  };
}

describe("E1 Worker cognition boundary", () => {
  it("uses the live-proven function wrapper, accepts nested Granite tool output and forwards bounded temporal change", async () => {
    const captured: unknown[] = [];
    const env = makeEnv(
      {
        ...nestedToolCall("fetch", { targetId: "item.mug" }),
        usage: { total_tokens: 12 }
      },
      captured
    );

    const response = await handleE1AgentDecision(
      new Request("https://example.test/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...requestFixture(), secretGlobalState: { item: "hidden" } })
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      cycleId: 1,
      decision: { kind: "fetch", targetId: "item.mug" },
      gatewayLogId: "test-gateway-log"
    });

    const input = captured[0] as {
      messages?: Array<{ role?: string; content?: string }>;
      tools?: Array<{
        type?: string;
        function?: {
          name?: string;
          parameters?: {
            type?: string;
            properties?: { targetId?: { type?: string; description?: string } };
            required?: string[];
            additionalProperties?: unknown;
          };
        };
      }>;
    };
    expect(input.tools?.map((tool) => tool.type)).toEqual(["function", "function"]);
    expect(input.tools?.map((tool) => tool.function?.name)).toEqual(["wait", "fetch"]);
    const fetchTool = input.tools?.find((tool) => tool.function?.name === "fetch");
    expect(fetchTool?.function?.parameters).toMatchObject({
      type: "object",
      required: ["targetId"],
      properties: { targetId: { type: "string" } }
    });
    expect(fetchTool?.function?.parameters?.properties?.targetId?.description).toContain("item.mug");
    expect(fetchTool?.function?.parameters?.additionalProperties).toBeUndefined();

    const userContent = input.messages?.find((message) => message.role === "user")?.content ?? "";
    expect(userContent).toContain("item_holder_changed");
    expect(userContent).toContain("player.jozz");
    expect(userContent).not.toContain("secretGlobalState");
    expect(userContent).not.toContain("hidden");
  });

  it("rejects a nested model tool call for a target outside the request allow-list", async () => {
    const captured: unknown[] = [];
    const env = makeEnv(nestedToolCall("fetch", { targetId: "item.hidden" }), captured);

    const response = await handleE1AgentDecision(
      new Request("https://example.test/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestFixture())
      }),
      env
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Model did not return exactly one valid bounded intention tool call");
  });

  it("does not expose fetch at all when perception has no legal item target", async () => {
    const captured: unknown[] = [];
    const env = makeEnv(nestedToolCall("wait"), captured);
    const request = requestFixture([]);
    request.observedChanges = [];

    const response = await handleE1AgentDecision(
      new Request("https://example.test/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      }),
      env
    );

    expect(response.status).toBe(200);
    const input = captured[0] as {
      tools?: Array<{ type?: string; function?: { name?: string } }>;
    };
    expect(input.tools?.map((tool) => tool.type)).toEqual(["function"]);
    expect(input.tools?.map((tool) => tool.function?.name)).toEqual(["wait"]);
  });

  it("rejects a forged fetch allow-list that is not backed by a visible free item", async () => {
    const captured: unknown[] = [];
    const env = makeEnv(nestedToolCall("wait"), captured);
    const forged = requestFixture(["item.hidden"]);

    const response = await handleE1AgentDecision(
      new Request("https://example.test/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(forged)
      }),
      env
    );

    expect(response.status).toBe(400);
    expect(captured).toHaveLength(0);
  });

  it("rejects multiple nested tool calls instead of silently taking the first", async () => {
    const captured: unknown[] = [];
    const env = makeEnv(
      {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: "function",
                  function: { name: "fetch", arguments: JSON.stringify({ targetId: "item.mug" }) }
                },
                {
                  type: "function",
                  function: { name: "wait", arguments: "{}" }
                }
              ]
            }
          }
        ]
      },
      captured
    );

    const response = await handleE1AgentDecision(
      new Request("https://example.test/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestFixture())
      }),
      env
    );

    expect(response.status).toBe(502);
  });

  it("keeps the legacy top-level result parser as a compatibility fallback", async () => {
    const captured: unknown[] = [];
    const env = makeEnv(
      { tool_calls: [{ name: "fetch", arguments: { targetId: "item.mug" } }] },
      captured
    );

    const response = await handleE1AgentDecision(
      new Request("https://example.test/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestFixture())
      }),
      env
    );

    expect(response.status).toBe(200);
  });
});
