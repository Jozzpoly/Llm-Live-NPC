import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapabilityStep, CognitionContext, CognitionProposal } from "../src/hearth/contracts";
import { handleHearthCognition, type HearthCognitionEnv } from "./hearth-cognition";
import worker from "./index";
import configText from "../wrangler.jsonc?raw";

const context = (): CognitionContext => ({
  version: 1, resident: { id: "npc.ada", name: "Ada", background: "Lubi doglądać podwórza i rozmawiać z sąsiadami." },
  tick: 10, reasons: ["heard_speech"],
  observations: [
    { id: "player", label: "Gość", kind: "player", position: { x: 2, y: 3 }, seenAtTick: 10, visible: true },
    { id: "item.mug", label: "Czerwony kubek", kind: "item", position: { x: 4, y: 5 }, seenAtTick: 8,
      visible: false, appearance: { itemType: "mug", color: "red" } }
  ],
  experiences: [{ id: "experience.1", tick: 9, kind: "heard_speech", text: "Gość zapytał o podwórze.", sourceId: "player" }],
  beliefs: [], concerns: [{ id: "concern.1", description: "Obejrzeć podwórze", reason: "Lubię tu zaglądać.", status: "open", evidenceIds: [] }],
  realization: null, places: [{ id: "place.yard", label: "Podwórze" }]
});
const proposal = (): CognitionProposal => ({ version: 1, speech: null, beliefs: [], concerns: [], plan: null, reviewAfterSeconds: 15 });
const completion = (value: unknown = proposal()) => ({
  status: "completed", model: "gpt-5.6-luna", error: null, incomplete_details: null,
  output: [{ type: "reasoning", summary: [] }, {
    type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: JSON.stringify(value) }]
  }], usage: { input_tokens: 201, output_tokens: 41, total_tokens: 242 }
});
const environment = () => ({
  OPENAI_API_KEY: "test-placeholder-never-a-real-key",
  HEARTH_COGNITION_LIMITER: { limit: vi.fn(async (_options: { key: string }) => ({ success: true })) },
  AI_PROBE_LIMITER: { limit: vi.fn(async () => ({ success: true })) }, AI: { run: vi.fn(async () => ({})) }
});
const request = (body: unknown = context(), signal?: AbortSignal) => new Request("https://hearth.test/api/hearth/cognition", {
  method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" }, body: JSON.stringify(body), signal
});
const upstream = (body: unknown = completion()) => vi.fn<typeof fetch>(async () => Response.json(body));
const streamingRequest = (body: ReadableStream<Uint8Array>) => {
  const init: RequestInit & { duplex: "half" } = { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" };
  return new Request("https://hearth.test/api/hearth/cognition", init);
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("First Hearth cognition Worker", () => {
  it("dispatches the new route with independent limiting and reports measured usage", async () => {
    const env = environment(), fetcher = upstream();
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, proposal: proposal(), usage: {
      model: "gpt-5.6-luna", inputTokens: 201, outputTokens: 41, totalTokens: 242, elapsedMs: expect.any(Number)
    } });
    expect(env.HEARTH_COGNITION_LIMITER.limit).toHaveBeenCalledWith({ key: "hearth-cognition:192.0.2.1" });
    expect(env.AI_PROBE_LIMITER.limit).not.toHaveBeenCalled();
    expect(env.AI.run).not.toHaveBeenCalled();
    const health = await worker.fetch(new Request("https://hearth.test/api/health"), env);
    expect(await health.json()).toMatchObject({ hearthCognitionEndpoint: "/api/hearth/cognition" });
  });

  it("sends Responses API strict output, private context, configured defaults, and no state-writing tools", async () => {
    const env = environment(), fetcher = upstream(), input = context();
    await handleHearthCognition(request(input), env, fetcher);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init).toMatchObject({ method: "POST", signal: expect.any(AbortSignal), headers: {
      authorization: "Bearer test-placeholder-never-a-real-key", "content-type": "application/json"
    } });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "gpt-5.6-luna", reasoning: { effort: "low" }, max_output_tokens: 4096,
      store: false, text: { format: { type: "json_schema", name: "hearth_cognition", strict: true } } });
    expect(body.tools).toBeUndefined();
    expect(body.input).toEqual([{ role: "user", content: JSON.stringify(input) }]);
    expect(body.instructions).toContain("ordinary, fallible utterance");
    expect(body.instructions).toContain("Start your own real activities");
    expect(body.instructions).toContain("Avoid reciprocal response loops");
    function checkStrict(node: unknown): void {
      if (Array.isArray(node)) { node.forEach(checkStrict); return; }
      if (!record(node)) return;
      if (node.type === "object") {
        expect(node.additionalProperties).toBe(false);
        expect(record(node.properties)).toBe(true);
        expect(node.required).toEqual(Object.keys(record(node.properties) ? node.properties : {}));
      }
      Object.values(node).forEach(checkStrict);
    }
    checkStrict(body.text.format.schema);
    expect(body.text.format.schema.properties.speech.anyOf).toContainEqual({ type: "null" });
    expect(body.text.format.schema.properties.plan.anyOf).toContainEqual({ type: "null" });
    const steps = body.text.format.schema.properties.plan.anyOf[0].properties.steps.items.anyOf;
    expect(steps.map((step: { properties: { skill: { enum: string[] } } }) => step.properties.skill.enum[0])).toEqual([
      "travel", "accompany", "deliver", "gather", "put_down", "pause"
    ]);
    expect(steps[3].properties.description.anyOf).toHaveLength(8);
  });

  it("preserves the old six-per-minute probe and gives cognition a separate 120-per-minute namespace", () => {
    const config = JSON.parse(configText);
    expect(config.ratelimits).toContainEqual({ name: "AI_PROBE_LIMITER", namespace_id: "731947", simple: { limit: 6, period: 60 } });
    expect(config.ratelimits).toContainEqual({ name: "HEARTH_COGNITION_LIMITER", namespace_id: "731948", simple: { limit: 120, period: 60 } });
    expect(config.vars.OPENAI_API_KEY).toBeUndefined();
    expect(config.vars).toMatchObject({ HEARTH_COGNITION_MODEL: "gpt-5.6-luna", HEARTH_COGNITION_REASONING: "low", HEARTH_COGNITION_MAX_OUTPUT_TOKENS: "4096" });
  });

  it("accepts grounded methods across the six initial capabilities and fallible speech", async () => {
    const steps: CapabilityStep[] = [
      { skill: "travel", targetId: "place.yard" }, { skill: "accompany", targetId: "player", durationSeconds: 12 },
      { skill: "deliver", targetId: "item.mug", recipientId: "player" },
      { skill: "gather", description: { itemType: "mug", color: "red", nearPlaceId: "place.yard", withinPlaceId: "place.yard" }, quantity: "all", recipientId: "player" },
      { skill: "put_down" }, { skill: "pause", durationSeconds: 8 }
    ];
    const value: CognitionProposal = { ...proposal(), speech: { text: "Chyba widziałam tam kubek, sprawdzę.", mode: "normal" },
      plan: { concernId: "concern.1", steps }, beliefs: [{ id: "belief.1", claim: "Gość pyta o podwórze.", evidenceIds: ["experience.1"], confidence: "expected" }] };
    const response = await handleHearthCognition(request(), environment(), upstream(completion(value)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ proposal: value });
  });

  it("applies server-only settings and leaves missing or invalid token usage unknown", async () => {
    const env = { ...environment(), HEARTH_COGNITION_MODEL: "gpt-5.6-luna", HEARTH_COGNITION_REASONING: "none", HEARTH_COGNITION_MAX_OUTPUT_TOKENS: "2048" };
    const fetcher = upstream({ ...completion(), model: "gpt-5.6-luna-test-snapshot", usage: { input_tokens: "201", output_tokens: -1 } });
    const response = await handleHearthCognition(request(), env, fetcher);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ reasoning: { effort: "none" }, max_output_tokens: 2048 });
    expect(await response.json()).toMatchObject({ usage: { model: "gpt-5.6-luna-test-snapshot", inputTokens: null, outputTokens: null, totalTokens: null } });
    const missing = await handleHearthCognition(request(), env, upstream({ ...completion(), usage: undefined }));
    expect(await missing.json()).toMatchObject({ usage: { inputTokens: null, outputTokens: null, totalTokens: null } });
  });

  it("fails closed before API work when credentials, limiter, or settings are missing or invalid", async () => {
    const env = environment(), fetcher = upstream();
    const invalid: HearthCognitionEnv[] = [
      {}, { ...env, OPENAI_API_KEY: undefined }, { ...env, OPENAI_API_KEY: "  " }, { ...env, HEARTH_COGNITION_LIMITER: undefined },
      { ...env, HEARTH_COGNITION_REASONING: "infinite" }, { ...env, HEARTH_COGNITION_MAX_OUTPUT_TOKENS: "1000000" },
      { ...env, HEARTH_COGNITION_MAX_OUTPUT_TOKENS: "4e3" }, { ...env, HEARTH_COGNITION_MODEL: "bad\nmodel" }
    ];
    for (const value of invalid) expect((await handleHearthCognition(request(), value, fetcher)).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    expect(env.HEARTH_COGNITION_LIMITER.limit).not.toHaveBeenCalled();
  });

  it("rejects method, malformed JSON, wrong media type and private-context extra or nested fields", async () => {
    const env = environment(), fetcher = upstream();
    const get = await handleHearthCognition(new Request("https://hearth.test/api/hearth/cognition"), env, fetcher);
    expect(get.status).toBe(405); expect(get.headers.get("allow")).toBe("POST");
    expect((await handleHearthCognition(new Request("https://hearth.test/api/hearth/cognition", { method: "POST", body: "{}" }), env, fetcher)).status).toBe(415);
    expect((await handleHearthCognition(new Request("https://hearth.test/api/hearth/cognition", { method: "POST", body: "{", headers: { "content-type": "application/json" } }), env, fetcher)).status).toBe(400);
    const invalid = [
      { ...context(), worldSnapshot: { hiddenItems: ["secret"] } },
      { ...context(), resident: { ...context().resident, privateKey: "must-not-leave" } },
      { ...context(), observations: [{ ...context().observations[0], position: { x: 0, y: 0, hidden: true } }] },
      { ...context(), observations: [{ ...context().observations[0], seenAtTick: 11 }] },
      { ...context(), realization: { id: "r", concernId: "concern.1", steps: [{ skill: "write_world" }], index: 0, status: "running", outcome: null } }
    ];
    for (const value of invalid) expect((await handleHearthCognition(request(value), env, fetcher)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect(env.HEARTH_COGNITION_LIMITER.limit).not.toHaveBeenCalled();
  });

  it("rejects ungrounded proposals, omitted nulls, and a plan linked to a newly closed concern", async () => {
    const value = proposal();
    const invalid = [
      { ...value, speech: undefined }, { ...value, plan: undefined }, { ...value, worldWrite: {} },
      { ...value, plan: { concernId: "concern.1", steps: [{ skill: "travel", targetId: "unknown.hidden" }] } },
      { ...value, beliefs: [{ id: "belief.1", claim: "Wiem.", confidence: "expected", evidenceIds: ["invented"] }] },
      { ...value, concerns: [{ ...context().concerns[0], status: "satisfied" }], plan: { concernId: "concern.1", steps: [{ skill: "pause", durationSeconds: 3 }] } }
    ];
    for (const item of invalid) expect((await handleHearthCognition(request(), environment(), upstream(completion(item)))).status).toBe(502);
  });

  it("rejects incomplete, refused, ambiguous, malformed, or non-message API output", async () => {
    const result = completion();
    const invalid = [
      { ...result, status: "incomplete" }, { ...result, incomplete_details: { reason: "max_output_tokens" } },
      { ...result, error: { message: "private error" } }, { output_text: JSON.stringify(proposal()) },
      { ...result, output: [...result.output, result.output[1]] },
      { ...result, output: [{ type: "function_call", name: "write_world", arguments: "{}" }] },
      { ...result, output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "private refusal" }] }] },
      { ...result, output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "```json\n{}\n```" }] }] }
    ];
    for (const item of invalid) expect((await handleHearthCognition(request(), environment(), upstream(item))).status).toBe(502);
  });

  it("limits by edge identity across different residents and hides limiter failures", async () => {
    const env = environment(), fetcher = upstream();
    env.HEARTH_COGNITION_LIMITER.limit.mockResolvedValueOnce({ success: false });
    const limited = await handleHearthCognition(request(), env, fetcher);
    expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
    const other = context(); other.resident.id = "npc.ben";
    env.HEARTH_COGNITION_LIMITER.limit.mockRejectedValueOnce(new Error("private limiter detail"));
    const failure = await handleHearthCognition(request(other), env, fetcher);
    expect(failure.status).toBe(503); expect(await failure.text()).not.toContain("private limiter detail");
    expect(env.HEARTH_COGNITION_LIMITER.limit.mock.calls.map(args => args[0])).toEqual([
      { key: "hearth-cognition:192.0.2.1" }, { key: "hearth-cognition:192.0.2.1" }
    ]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not forward private upstream status bodies, thrown errors, or secret data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("secret account details", { status: 401 }))
      .mockRejectedValueOnce(new Error("secret key and account failure"));
    for (let i = 0; i < 2; i++) {
      const response = await handleHearthCognition(request(), environment(), fetcher);
      expect(response.status).toBe(502);
      const body = await response.text();
      expect(body).not.toMatch(/secret|test-placeholder|account|401/u);
    }
  });

  it("bounds and cancels an oversized incoming stream even without content-length", async () => {
    const cancel = vi.fn(), fetcher = upstream();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(262_145)); }, cancel });
    expect((await handleHearthCognition(streamingRequest(stream), environment(), fetcher)).status).toBe(413);
    expect(cancel).toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds incoming streams to five seconds and cancels them", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(), fetcher = upstream();
    const pending = handleHearthCognition(streamingRequest(new ReadableStream<Uint8Array>({ cancel })), environment(), fetcher);
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await pending).status).toBe(408); expect(cancel).toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds a non-returning limiter to three seconds without reaching the API", async () => {
    vi.useFakeTimers();
    const env = environment(), fetcher = upstream();
    env.HEARTH_COGNITION_LIMITER.limit.mockImplementationOnce(() => new Promise(() => {}));
    const pending = handleHearthCognition(request(), env, fetcher);
    await vi.advanceTimersByTimeAsync(3_001);
    expect((await pending).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });

  it("aborts upstream fetch at thirty seconds even if the adapter ignores cancellation", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const pending = handleHearthCognition(request(), environment(), fetcher);
    await vi.advanceTimersByTimeAsync(30_001);
    expect((await pending).status).toBe(504);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("includes upstream response streaming in the same thirty-second budget", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream<Uint8Array>({ cancel })));
    const pending = handleHearthCognition(request(), environment(), fetcher);
    await vi.advanceTimersByTimeAsync(30_001);
    expect((await pending).status).toBe(504); expect(cancel).toHaveBeenCalled();
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("bounds upstream response bytes and rejects malformed UTF-8", async () => {
    for (const bytes of [new Uint8Array(262_145), new Uint8Array([0xc3, 0x28])]) {
      const cancel = vi.fn();
      const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(bytes); }, cancel
      })));
      const response = await handleHearthCognition(request(), environment(), fetcher);
      expect(response.status).toBe(502); expect(cancel).toHaveBeenCalled();
    }
  });

  it("propagates caller cancellation to the upstream request and rejects a pre-aborted request", async () => {
    const controller = new AbortController(), env = environment();
    let started!: () => void;
    const startedPromise = new Promise<void>(resolve => { started = resolve; });
    const fetcher = vi.fn<typeof fetch>(() => { started(); return new Promise(() => {}); });
    const pending = handleHearthCognition(request(context(), controller.signal), env, fetcher);
    await startedPromise;
    controller.abort(new Error("private cancellation reason"));
    const response = await pending;
    expect(response.status).toBe(499); expect(await response.text()).not.toContain("private");
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect((await handleHearthCognition(request(context(), controller.signal), env, fetcher)).status).toBe(499);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
