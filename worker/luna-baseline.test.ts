import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResidentModelInput, ResidentReply } from "../src/living/types";
import { handleResidentConversation } from "./living-resident";

function input(): ResidentModelInput {
  return {
    actorId: "npc.mira",
    actorName: "Mira",
    latestUtterance: "Przynieś mi czerwony kubek.",
    conversation: [
      { speaker: "player", text: "Podobno ktoś przeniósł kubek." },
      { speaker: "npc", text: "Sprawdzę, gdzie jest." }
    ],
    currentActivity: "Czekam przy stole.",
    heldItemId: null,
    knownEntities: [
      { id: "npc.mira", label: "Mira", kind: "npc", position: { x: 80, y: 80 }, seenAtTick: 20 },
      { id: "player.jozz", label: "Jozz", kind: "player", position: { x: 100, y: 80 }, seenAtTick: 20 },
      { id: "item.red-mug", label: "Red mug", kind: "item", position: { x: 150, y: 80 }, seenAtTick: 12, heldBy: null }
    ],
    places: [{ id: "room.kitchen", label: "Kitchen" }]
  };
}

const reply: ResidentReply = {
  reply: "Jasne, sprawdzę kubek.",
  intent: { kind: "fetch", targetId: "item.red-mug" }
};

function environment() {
  const run = vi.fn(async (_model: string, _input: unknown, _options?: unknown): Promise<unknown> => null);
  return {
    RESIDENT_PROVIDER: "openai-luna" as const,
    OPENAI_API_KEY: "sk-test-not-a-real-key" as string | undefined,
    AI: { aiGatewayLogId: "unused", run },
    AI_PROBE_LIMITER: { limit: vi.fn(async (_options: { key: string }) => ({ success: true })) }
  };
}

function request(body: unknown = input()) {
  return new Request("https://example.test/api/resident/converse", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.8" },
    body: JSON.stringify(body)
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Luna baseline transplant", () => {
  it("sends the same sanitized resident context through Responses API and preserves the reply contract", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({
      id: "resp_test",
      status: "completed",
      output: [{
        type: "function_call",
        name: "resident_reply",
        arguments: JSON.stringify(reply)
      }],
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const env = environment();

    const raw = { ...input(), hiddenFacts: "INVISIBLE SECRET" };
    const response = await handleResidentConversation(request(raw), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, output: reply });
    expect(env.AI.run).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-test-not-a-real-key");

    const body = JSON.parse(String(init?.body)) as Record<string, any>;
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body.tool_choice).toEqual({ type: "function", name: "resident_reply" });
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.store).toBe(false);
    expect(body.instructions).not.toContain("/no_think");
    expect(JSON.parse(String(body.input[0].content))).toEqual(input());
    expect(JSON.stringify(body)).not.toContain("INVISIBLE SECRET");
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe("resident_reply");
  });

  it("fails closed instead of silently falling back to Workers AI when the OpenAI secret is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const env = environment();
    env.OPENAI_API_KEY = undefined;

    const response = await handleResidentConversation(request(), env);

    expect(response.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(env.AI.run).not.toHaveBeenCalled();
  });
});
