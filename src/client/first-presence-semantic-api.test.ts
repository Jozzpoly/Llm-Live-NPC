import { describe, expect, it } from "vitest";
import type { P2E5ModelSemanticInput } from "../research/p2-e5-semantic-provider-authority-membrane";
import {
  requestFirstPresenceSemanticProposal,
  type FirstPresenceSemanticFetch
} from "./first-presence-semantic-api";

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

describe("First Presence semantic browser transport", () => {
  it("posts exactly the serializable P2-E5 model input and returns bounded output plus diagnostics", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const request: FirstPresenceSemanticFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          ok: true,
          output: { semanticCourse: " fetch Blue mug " },
          model: "@cf/ibm-granite/granite-4.0-h-micro",
          gatewayLogId: "gateway-log-1",
          latencyMs: 37,
          usage: { total_tokens: 19 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const input = semanticInput();
    const result = await requestFirstPresenceSemanticProposal(input, request);

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe("/api/first-presence/semantic/propose");
    expect(calls[0].init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" }
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(input);
    expect(result).toEqual({
      output: { semanticCourse: "fetch Blue mug" },
      model: "@cf/ibm-granite/granite-4.0-h-micro",
      gatewayLogId: "gateway-log-1",
      latencyMs: 37,
      usage: { total_tokens: 19 }
    });
  });

  it("turns a non-success HTTP response into a transport exception rather than semantic output", async () => {
    const request: FirstPresenceSemanticFetch = async () =>
      new Response(JSON.stringify({ ok: false, error: "First Presence semantic rate limit exceeded" }), {
        status: 429,
        headers: { "content-type": "application/json" }
      });

    await expect(requestFirstPresenceSemanticProposal(semanticInput(), request)).rejects.toThrow(
      "First Presence semantic rate limit exceeded"
    );
  });

  it("rejects malformed success envelopes instead of manufacturing provider output", async () => {
    const request: FirstPresenceSemanticFetch = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          output: { semanticCourse: "fetch Blue mug", action: "teleport" },
          model: null
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    await expect(requestFirstPresenceSemanticProposal(semanticInput(), request)).rejects.toThrow(
      "invalid success envelope"
    );
  });
});
