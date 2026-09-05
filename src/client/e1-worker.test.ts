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
    previousExperience: null
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
  it("offers only wait plus allow-listed fetch and returns the bounded decision", async () => {
    const captured: unknown[] = [];
    const env = makeEnv(
      {
        tool_calls: [{ name: "fetch", arguments: { targetId: "item.mug" } }],
        usage: { total_tokens: 12 }
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

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      cycleId: 1,
      decision: { kind: "fetch", targetId: "item.mug" },
      gatewayLogId: "test-gateway-log"
    });

    const input = captured[0] as { tools?: Array<Record<string, unknown>> };
    expect(input.tools?.map((tool) => tool.name)).toEqual(["wait", "fetch"]);
    const fetchTool = input.tools?.find((tool) => tool.name === "fetch") as
      | { parameters?: { properties?: { targetId?: { enum?: string[] } } } }
      | undefined;
    expect(fetchTool?.parameters?.properties?.targetId?.enum).toEqual(["item.mug"]);
  });

  it("rejects a model tool call for a target outside the request allow-list", async () => {
    const captured: unknown[] = [];
    const env = makeEnv(
      { tool_calls: [{ name: "fetch", arguments: { targetId: "item.hidden" } }] },
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
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Model did not return one valid bounded intention tool call");
  });

  it("does not expose fetch at all when perception has no legal item target", async () => {
    const captured: unknown[] = [];
    const env = makeEnv({ tool_calls: [{ name: "wait", arguments: {} }] }, captured);

    const response = await handleE1AgentDecision(
      new Request("https://example.test/api/agent/e1/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestFixture([]))
      }),
      env
    );

    expect(response.status).toBe(200);
    const input = captured[0] as { tools?: Array<Record<string, unknown>> };
    expect(input.tools?.map((tool) => tool.name)).toEqual(["wait"]);
  });
});
