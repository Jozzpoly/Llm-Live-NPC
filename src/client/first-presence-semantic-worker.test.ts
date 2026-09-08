import { describe, expect, it } from "vitest";
import type { P2E5ModelSemanticInput } from "../research/p2-e5-semantic-provider-authority-membrane";
import {
  handleFirstPresenceSemanticProposal,
  type FirstPresenceSemanticEnv
} from "../../worker/first-presence-semantic";

function semanticInput(): P2E5ModelSemanticInput {
  return {
    currentSemanticCourse: "fetch Red mug",
    semanticEvidence: {
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "player.jozz said: Actually, bring me the blue mug."
    }
  };
}

function semanticToolCall(semanticCourse: string, extra: Record<string, unknown> = {}) {
  const args = JSON.stringify({ semanticCourse, ...extra });
  return {
    choices: [
      {
        message: {
          tool_calls: [
            {
              type: "function",
              function: {
                name: "set_semantic_course",
                arguments: JSON.stringify(args)
              }
            }
          ]
        }
      }
    ],
    usage: { total_tokens: 17 }
  };
}

function makeEnv(
  result: unknown,
  captured: Array<{ model: string; input: unknown; options: unknown }>,
  rateLimitSuccess = true
): FirstPresenceSemanticEnv {
  return {
    AI: {
      aiGatewayLogId: "semantic-gateway-log",
      async run(model: string, input: unknown, options?: unknown) {
        captured.push({ model, input, options });
        return result;
      }
    },
    AI_PROBE_LIMITER: {
      async limit(options) {
        expect(options.key).toBe("first-presence-semantic-proposal");
        return { success: rateLimitSuccess };
      }
    }
  };
}

describe("First Presence semantic Worker transport", () => {
  it("sends only bounded P2-E5 semantic content to Workers AI and returns one normalized proposal", async () => {
    const captured: Array<{ model: string; input: unknown; options: unknown }> = [];
    const env = makeEnv(semanticToolCall("fetch Blue mug"), captured);
    const requestBody = {
      ...semanticInput(),
      secretAuthority: {
        matterId: "matter.presence.1",
        proposalId: 91,
        runId: 42
      }
    };

    const response = await handleFirstPresenceSemanticProposal(
      new Request("https://example.test/api/first-presence/semantic/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody)
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      output: { semanticCourse: "fetch Blue mug" },
      model: "@cf/ibm-granite/granite-4.0-h-micro",
      gatewayLogId: "semantic-gateway-log",
      usage: { total_tokens: 17 }
    });

    expect(captured).toHaveLength(1);
    const call = captured[0];
    expect(call.model).toBe("@cf/ibm-granite/granite-4.0-h-micro");
    const aiInput = call.input as {
      messages?: Array<{ role?: string; content?: string }>;
      tools?: Array<{
        type?: string;
        function?: {
          name?: string;
          parameters?: {
            type?: string;
            properties?: { semanticCourse?: { type?: string } };
            required?: string[];
          };
        };
      }>;
    };
    const userContent = aiInput.messages?.find((message) => message.role === "user")?.content ?? "";
    expect(userContent).toContain("fetch Red mug");
    expect(userContent).toContain("Actually, bring me the blue mug");
    expect(userContent).toContain("player.jozz");
    expect(userContent).not.toContain("secretAuthority");
    expect(userContent).not.toContain("matter.presence.1");
    expect(userContent).not.toContain("proposalId");
    expect(userContent).not.toContain("runId");
    expect(aiInput.tools?.map((tool) => tool.function?.name)).toEqual(["set_semantic_course"]);
    expect(aiInput.tools?.[0]?.function?.parameters).toMatchObject({
      type: "object",
      required: ["semanticCourse"],
      properties: { semanticCourse: { type: "string" } }
    });

    const options = call.options as {
      gateway?: { metadata?: Record<string, string>; skipCache?: boolean; collectLog?: boolean };
    };
    expect(options.gateway).toMatchObject({
      skipCache: true,
      collectLog: true,
      metadata: {
        project: "llm-live-npc",
        stage: "first-presence-semantic-proposal",
        evidenceKind: "heard",
        evidenceSource: "actor"
      }
    });
  });

  it("rejects malformed or over-broad semantic input before inference", async () => {
    const captured: Array<{ model: string; input: unknown; options: unknown }> = [];
    const env = makeEnv(semanticToolCall("fetch Blue mug"), captured);
    const invalid = semanticInput();
    invalid.semanticEvidence.summary = "x".repeat(1025);

    const response = await handleFirstPresenceSemanticProposal(
      new Request("https://example.test/api/first-presence/semantic/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(invalid)
      }),
      env
    );

    expect(response.status).toBe(400);
    expect(captured).toEqual([]);
  });

  it("rejects model output with any field beyond semanticCourse", async () => {
    const captured: Array<{ model: string; input: unknown; options: unknown }> = [];
    const env = makeEnv(semanticToolCall("fetch Blue mug", { action: "teleport" }), captured);

    const response = await handleFirstPresenceSemanticProposal(
      new Request("https://example.test/api/first-presence/semantic/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(semanticInput())
      }),
      env
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Model did not return exactly one valid bounded semantic proposal");
  });

  it("rejects multiple model tool calls instead of selecting one", async () => {
    const captured: Array<{ model: string; input: unknown; options: unknown }> = [];
    const first = semanticToolCall("fetch Blue mug");
    const toolCall = first.choices[0].message.tool_calls[0];
    const env = makeEnv(
      {
        choices: [
          {
            message: {
              tool_calls: [toolCall, toolCall]
            }
          }
        ]
      },
      captured
    );

    const response = await handleFirstPresenceSemanticProposal(
      new Request("https://example.test/api/first-presence/semantic/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(semanticInput())
      }),
      env
    );

    expect(response.status).toBe(502);
  });

  it("rate-limits before invoking Workers AI", async () => {
    const captured: Array<{ model: string; input: unknown; options: unknown }> = [];
    const env = makeEnv(semanticToolCall("fetch Blue mug"), captured, false);

    const response = await handleFirstPresenceSemanticProposal(
      new Request("https://example.test/api/first-presence/semantic/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(semanticInput())
      }),
      env
    );

    expect(response.status).toBe(429);
    expect(captured).toEqual([]);
  });
});
