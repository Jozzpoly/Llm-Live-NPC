import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResidentModelInput, ResidentReply } from "../src/living/types";
import { requestResidentReply } from "../src/living/provider";
import { handleResidentConversation, type LivingResidentEnv } from "./living-resident";
import worker from "./index";

function input(): ResidentModelInput {
  return {
    actorId: "npc.mira",
    actorName: "Mira",
    latestUtterance: "Przyniesiesz mi ten czerwony kubek?",
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

const reply: ResidentReply = { reply: "Jasne, sprawdzę, czy kubek nadal tam jest.", intent: { kind: "fetch", targetId: "item.red-mug" } };

function toolCall(output: unknown = reply) {
  return { tool_calls: [{ name: "resident_reply", arguments: output }] };
}

function env(result: unknown = toolCall()) {
  return {
    AI: { aiGatewayLogId: "private-gateway-id", run: vi.fn(async () => result) },
    AI_PROBE_LIMITER: { limit: vi.fn(async (_options: { key: string }) => ({ success: true })) }
  } satisfies LivingResidentEnv;
}

function request(body: unknown = input()) {
  return new Request("https://example.test/api/resident/converse", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.8" },
    body: JSON.stringify(body)
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("resident conversation Worker", () => {
  it("accepts an unresolved item description and all-items purpose without inventing a target ID", async () => {
    const output = { reply: "Sprawdzę znane miejsca i przyniosę pasujące rzeczy.", intent: {
      kind: "find_item", description: { itemType: "mug", color: "red", nearPlaceId: "room.kitchen" }, quantity: "all"
    } };
    const context = input();
    context.knownEntities = context.knownEntities.filter(e => e.kind !== "item");
    expect((await handleResidentConversation(request(context), env(toolCall(output)))).status).toBe(200);
    const invalid = { ...output, intent: { ...output.intent, description: { itemType: "mug", nearPlaceId: "secret.room" } } };
    expect((await handleResidentConversation(request(context), env(toolCall(invalid)))).status).toBe(502);
  });

  it("preserves explicit absence, observed appearance and real sensory evidence, stripping hidden fields", async () => {
    const context = input();
    context.knownEntities[2] = { ...context.knownEntities[2], visible: false, lastCheckedAbsentAtTick: 19, source: "sight", appearance: { itemType: "mug", color: "red" } };
    context.experiences = [{ id: 1, tick: 19, kind: "heard_call", text: "Słyszę wołanie z zachodu; nie znam dokładnej pozycji." }];
    context.currentCommitment = "Przynieść dwa kubki. Jeden już dostarczony.";
    const raw = structuredClone(context) as unknown as Record<string, unknown>;
    (raw.knownEntities as Record<string, unknown>[])[2].hiddenPosition = { x: 999, y: 999 };
    const environment = env(toolCall({ reply: "Poszukam cię.", intent: { kind: "search", targetId: "player.jozz" } }));
    expect((await handleResidentConversation(request(raw), environment)).status).toBe(200);
    const call = environment.AI.run.mock.calls[0] as unknown[];
    const inference = call[1] as { messages: Array<{ role: string; content: string }> };
    expect(JSON.parse(inference.messages[1].content)).toEqual(context);
  });

  it("routes a grounded Polish conversation to the resident model and returns only reply plus intention", async () => {
    const environment = env();
    const response = await worker.fetch(request({ ...input(), hiddenFacts: "INVISIBLE SECRET" }), environment);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, output: reply });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(environment.AI_PROBE_LIMITER.limit).toHaveBeenCalledWith({ key: "living-resident-converse:192.0.2.8" });
    const call = environment.AI.run.mock.calls[0] as unknown[];
    expect(call[0]).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
    const inference = call[1] as { messages: Array<{ role: string; content: string }> };
    const content = inference.messages.find((message) => message.role === "user")?.content;
    expect(JSON.parse(content ?? "null")).toEqual(input());
    expect(JSON.stringify(call)).not.toContain("INVISIBLE SECRET");
    expect(inference.messages[0].content).toContain("speaker=player");
    expect(inference.messages[0].content).toContain("seenAtTick");
  });

  it("accepts the existing provider's double-encoded OpenAI tool format", async () => {
    const environment = env({ choices: [{ message: { tool_calls: [{ function: {
      name: "resident_reply", arguments: JSON.stringify(JSON.stringify(reply))
    } }] } }] });
    const response = await handleResidentConversation(request(), environment);
    expect(await response.json()).toEqual({ ok: true, output: reply });
  });

  it("allows ordinary conversation to continue the current activity and go to a familiar place", async () => {
    for (const intent of [{ kind: "continue" }, { kind: "go", targetId: "room.kitchen" }]) {
      const output = { reply: "Dobrze.", intent };
      const response = await handleResidentConversation(request(), env(toolCall(output)));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, output });
    }
  });

  it("rejects malformed JSON or invalid context before invoking AI", async () => {
    const environment = env();
    const malformed = new Request("https://example.test/api/resident/converse", { method: "POST", body: "{" });
    expect((await handleResidentConversation(malformed, environment)).status).toBe(400);
    expect((await handleResidentConversation(request({ ...input(), latestUtterance: "x".repeat(1201) }), environment)).status).toBe(400);
    expect((await handleResidentConversation(request({ ...input(), knownEntities: [input().knownEntities[0], input().knownEntities[0]] }), environment)).status).toBe(400);
    expect(environment.AI.run).not.toHaveBeenCalled();
  });

  it("stops an oversized chunked body while reading instead of trusting content-length", async () => {
    let chunksRead = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksRead += 1;
        controller.enqueue(new Uint8Array(16_384).fill(120));
        if (chunksRead === 100) controller.close();
      },
      cancel() { cancelled = true; }
    });
    const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half" };
    const environment = env();
    const response = await handleResidentConversation(new Request("https://example.test/api/resident/converse", init), environment);
    expect(response.status).toBe(413);
    expect(chunksRead).toBeLessThan(10);
    expect(cancelled).toBe(true);
    expect(environment.AI.run).not.toHaveBeenCalled();
  });

  it("rejects invented targets, wrong target types, self-follow, and extra action fields", async () => {
    const invalidIntents = [
      { kind: "fetch", targetId: "item.invisible" },
      { kind: "fetch", targetId: "player.jozz" },
      { kind: "follow", targetId: "item.red-mug" },
      { kind: "follow", targetId: "npc.mira" },
      { kind: "continue", targetId: "room.kitchen" },
      { kind: "go", targetId: "room.kitchen", teleport: true }
    ];
    for (const intent of invalidIntents) {
      const response = await handleResidentConversation(request(), env(toolCall({ reply: "Dobrze.", intent })));
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ ok: false });
    }
  });

  it("rejects multiple calls, unstructured prose, and reply objects with extra fields", async () => {
    const invalidResults = [
      { tool_calls: [...toolCall().tool_calls, ...toolCall().tool_calls] },
      { response: "Już przyniosłam kubek." },
      toolCall({ ...reply, success: true })
    ];
    for (const result of invalidResults) {
      const response = await handleResidentConversation(request(), env(result));
      expect(response.status).toBe(502);
    }
  });

  it("keeps rate limiting and fails closed if its binding fails", async () => {
    const environment = env();
    environment.AI_PROBE_LIMITER.limit.mockResolvedValueOnce({ success: false });
    const limited = await handleResidentConversation(request(), environment);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    environment.AI_PROBE_LIMITER.limit.mockRejectedValueOnce(new Error("private binding detail"));
    expect((await handleResidentConversation(request(), environment)).status).toBe(503);
    expect(environment.AI.run).not.toHaveBeenCalled();
  });

  it("returns an honest provider failure without exposing private details", async () => {
    const environment = env();
    environment.AI.run.mockRejectedValueOnce(new Error("gateway private-gateway-id failed with account credential details"));
    const response = await handleResidentConversation(request(), environment);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("private-gateway-id");
    expect(text).not.toContain("credential");
    expect(JSON.parse(text)).toMatchObject({ ok: false });
  });

  it("bounds provider wait time", async () => {
    vi.useFakeTimers();
    const environment = env();
    environment.AI.run.mockImplementationOnce(() => new Promise(() => {}));
    const pending = handleResidentConversation(request(), environment);
    await vi.advanceTimersByTimeAsync(20_001);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ ok: false });
  });
});

describe("resident browser provider", () => {
  it("uses the same route and returns a checked reply", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, output: reply }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestResidentReply(input())).toEqual(reply);
    expect(fetchMock).toHaveBeenCalledWith("/api/resident/converse", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }));
  });

  it("rejects hallucinated targets and hides arbitrary server error text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, output: { ...reply, intent: { kind: "fetch", targetId: "item.invisible" } } })));
    await expect(requestResidentReply(input())).rejects.toThrow("Nie udało się odczytać");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "private-gateway-id" }, { status: 502 })));
    await expect(requestResidentReply(input())).rejects.toThrow("Rozmowa jest chwilowo niedostępna");
  });

  it("respects an already cancelled conversation without issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(requestResidentReply(input(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
