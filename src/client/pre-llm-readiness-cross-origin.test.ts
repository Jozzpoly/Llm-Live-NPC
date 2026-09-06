import { describe, expect, it } from "vitest";
import { handleE1AgentDecision, type E1AgentEnv } from "../../worker/e1-agent";

function validCycleRequest() {
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
    previousExperience: null
  };
}

function waitToolCall() {
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

describe("pre-LLM cross-origin inference boundary characterization", () => {
  it("shows that a foreign-origin text/plain POST reaches the model even though the response is not CORS-readable", async () => {
    let modelCalls = 0;
    const env: E1AgentEnv = {
      AI: {
        aiGatewayLogId: "cross-origin-probe-log",
        async run() {
          modelCalls += 1;
          return waitToolCall();
        }
      },
      AI_PROBE_LIMITER: {
        async limit() {
          return { success: true };
        }
      }
    };

    const response = await handleE1AgentDecision(
      new Request("https://llm-live-npc.example/api/agent/e1/decide", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "https://attacker.example"
        },
        body: JSON.stringify(validCycleRequest())
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(modelCalls).toBe(1);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toMatchObject({ ok: true, decision: { kind: "wait" } });
  });
});
