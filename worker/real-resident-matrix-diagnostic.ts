import { LivingRuntime } from "../src/living/runtime";
import { createLivingSpecimen } from "../src/living/specimen";
import { parseResidentReply } from "../src/living/provider";
import type { ResidentModelInput, ResidentReply } from "../src/living/types";
import { World } from "../src/world/world";
import { handleResidentConversation, type LivingResidentEnv } from "./living-resident";

interface DiagnosticAiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

interface DiagnosticRateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RealResidentMatrixEnv {
  AI: DiagnosticAiBinding;
  AI_PROBE_LIMITER: DiagnosticRateLimitBinding;
  OPENAI_API_KEY?: string;
}

const QWEN_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const OPENAI_MODEL = "gpt-5.6-luna";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DIAGNOSTIC_RUN = "first-hearth-real-resident-matrix-v1";
const TIMEOUT_MS = 20_000;
const MAX_BODY = 65_536;
const SHORT_SYSTEM = "Jesteś Mirą. Odpowiedz naturalnie po polsku na bieżącą wypowiedź gracza i zwróć dokładnie jedno wywołanie resident_reply. Dla zwykłego powitania wybierz continue.";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value) ? value : null;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function parameters(input: ResidentModelInput) {
  const targetIds = [...input.knownEntities.map(entity => entity.id), ...input.places.map(place => place.id)];
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string", maxLength: 1200 },
      intent: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["continue", "idle", "wait", "drop", "go", "follow", "fetch", "search", "find_item"] },
          description: {
            type: "object",
            additionalProperties: false,
            properties: {
              itemType: { type: "string", enum: ["mug", "hammer", "lantern", "any"] },
              color: { type: "string", enum: ["red", "blue"] },
              nearPlaceId: { type: "string", ...(input.places.length ? { enum: input.places.map(place => place.id) } : {}) },
              withinPlaceId: { type: "string", ...(input.places.length ? { enum: input.places.map(place => place.id) } : {}) }
            },
            required: ["itemType"]
          },
          quantity: { type: "string", enum: ["one", "all"] },
          targetId: { type: "string", ...(targetIds.length ? { enum: targetIds } : {}) }
        },
        required: ["kind"]
      }
    },
    required: ["reply", "intent"]
  };
}

function argumentsValue(value: unknown): unknown {
  let current = value;
  for (let i = 0; i < 2 && typeof current === "string"; i += 1) {
    if (!current || current.length > 8192) return null;
    try { current = JSON.parse(current); } catch { return null; }
  }
  return current;
}

function classifyModelReply(result: unknown, input: ResidentModelInput) {
  if (!record(result)) return { ok: false, failureClass: "result_not_object", reply: null, outputShape: typeof result };
  let calls: unknown = result.tool_calls;
  let outputShape = "workers-native";
  if (calls === undefined && Array.isArray(result.choices) && result.choices.length === 1) {
    const choice = result.choices[0];
    if (record(choice) && choice.finish_reason === "length") return { ok: false, failureClass: "output_truncated", reply: null, outputShape: "choices" };
    if (record(choice) && record(choice.message)) calls = choice.message.tool_calls;
    outputShape = "choices";
  }
  if (calls === undefined && result.status === "completed" && Array.isArray(result.output)) {
    calls = result.output
      .filter((item): item is Record<string, unknown> => record(item) && item.type === "function_call")
      .map(item => ({ name: item.name, arguments: item.arguments }));
    outputShape = "responses-output";
  }
  if (!Array.isArray(calls)) return { ok: false, failureClass: "no_tool_calls", reply: null, outputShape };
  if (calls.length !== 1) return { ok: false, failureClass: "tool_call_count", reply: null, outputShape };
  if (!record(calls[0])) return { ok: false, failureClass: "tool_call_shape", reply: null, outputShape };
  const tool = record(calls[0].function) ? calls[0].function : calls[0];
  if (tool.name !== "resident_reply") return { ok: false, failureClass: "wrong_tool_name", reply: null, outputShape };
  const args = argumentsValue(tool.arguments);
  if (args === null) return { ok: false, failureClass: "arguments_not_json", reply: null, outputShape };
  const parsed = parseResidentReply(args, input);
  return parsed
    ? { ok: true, failureClass: null, reply: parsed, outputShape }
    : { ok: false, failureClass: "resident_reply_rejected", reply: null, outputShape };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return null;
  const text = await response.text();
  if (text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function captureInitialInput(): Promise<ResidentModelInput> {
  let captured: ResidentModelInput | undefined;
  const world = new World(createLivingSpecimen());
  const runtime = new LivingRuntime(world, async input => {
    captured = structuredClone(input);
    return { reply: "diagnostic", intent: { kind: "continue" } } satisfies ResidentReply;
  });
  await runtime.send("hej");
  if (!captured) throw new Error("Resident input capture failed.");
  return captured;
}

async function runExactHandler(env: RealResidentMatrixEnv, input: ResidentModelInput, provider: "workers-ai" | "openai-luna") {
  const startedAt = Date.now();
  const request = new Request("https://diagnostic.invalid/api/resident/converse", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": provider === "workers-ai" ? "diag-qwen-exact" : "diag-luna-exact"
    },
    body: JSON.stringify(input)
  });
  const response = await handleResidentConversation(request, { ...env, RESIDENT_PROVIDER: provider } as LivingResidentEnv);
  const body = await readBoundedJson(response);
  return {
    provider,
    ok: response.ok && record(body) && body.ok === true,
    httpStatus: response.status,
    envelopeClass: record(body) && body.ok === true ? "resident_reply" : record(body) && typeof body.error === "string" ? "resident_error" : "unexpected_body",
    latencyMs: Date.now() - startedAt
  };
}

async function runQwenShort(env: RealResidentMatrixEnv, input: ResidentModelInput, collectLog: boolean) {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(() => env.AI.run(QWEN_MODEL, {
      messages: [
        { role: "system", content: `${SHORT_SYSTEM} /no_think` },
        { role: "user", content: JSON.stringify(input) },
        { role: "user", content: `Odpowiedz teraz na aktualną wypowiedź gracza: ${input.latestUtterance}\n/no_think` }
      ],
      tools: [{ type: "function", function: { name: "resident_reply", description: "Odpowiedź mieszkańca i zamiar.", parameters: parameters(input) } }],
      max_tokens: 512,
      temperature: 0.2,
      top_p: 0.8,
      top_k: 20
    }, {
      gateway: { id: "default", skipCache: true, collectLog, metadata: { project: "llm-live-npc", stage: "real-resident-matrix", provider: "workers-ai", collectLog: String(collectLog) } }
    }));
    return { provider: "workers-ai", collectLog, ...classifyModelReply(result, input), latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      provider: "workers-ai", collectLog, ok: false,
      failureClass: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "provider_exception",
      reply: null, outputShape: null, latencyMs: Date.now() - startedAt
    };
  }
}

async function runOpenAIShort(env: RealResidentMatrixEnv, input: ResidentModelInput, sampling: "safe" | "legacy-both") {
  const startedAt = Date.now();
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return { provider: "openai", sampling, ok: false, failureClass: "missing_runtime_secret", httpStatus: null, errorType: null, errorCode: null, reply: null, outputShape: null, latencyMs: 0 };
  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    instructions: SHORT_SYSTEM,
    input: [
      { role: "user", content: JSON.stringify(input) },
      { role: "user", content: `Odpowiedz teraz na aktualną wypowiedź gracza: ${input.latestUtterance}` }
    ],
    tools: [{ type: "function", name: "resident_reply", description: "Odpowiedź mieszkańca i zamiar.", parameters: parameters(input), strict: false }],
    tool_choice: { type: "function", name: "resident_reply" },
    parallel_tool_calls: false,
    reasoning: { effort: "none" },
    max_output_tokens: 512,
    service_tier: "default",
    store: false,
    metadata: { project: "llm-live-npc", stage: "real-resident-matrix", sampling }
  };
  if (sampling === "legacy-both") {
    body.temperature = 0.2;
    body.top_p = 0.8;
  }
  try {
    const response = await withTimeout(signal => fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal
    }));
    const parsedBody = await readBoundedJson(response);
    if (!response.ok) {
      const error = record(parsedBody) && record(parsedBody.error) ? parsedBody.error : null;
      return {
        provider: "openai", sampling, ok: false, failureClass: "provider_http_error", httpStatus: response.status,
        errorType: error ? boundedCode(error.type) : null, errorCode: error ? boundedCode(error.code) : null,
        reply: null, outputShape: null, latencyMs: Date.now() - startedAt
      };
    }
    return { provider: "openai", sampling, httpStatus: response.status, errorType: null, errorCode: null, ...classifyModelReply(parsedBody, input), latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      provider: "openai", sampling, ok: false,
      failureClass: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "transport_exception",
      httpStatus: null, errorType: null, errorCode: null, reply: null, outputShape: null, latencyMs: Date.now() - startedAt
    };
  }
}

export async function handleRealResidentMatrixDiagnostic(request: Request, env: RealResidentMatrixEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.searchParams.get("run") !== DIAGNOSTIC_RUN) {
    return json({ ok: false, error: "Diagnostic invocation not enabled." }, 404);
  }

  try {
    const limit = await env.AI_PROBE_LIMITER.limit({ key: "real-resident-matrix-diagnostic-2026-09-11" });
    if (!limit.success) return json({ ok: false, error: "Diagnostic rate limit exceeded." }, 429);
  } catch {
    return json({ ok: false, error: "Diagnostic limiter unavailable." }, 503);
  }

  const input = await captureInitialInput();
  const summary = {
    actorId: input.actorId,
    conversationLines: input.conversation.length,
    knownEntities: input.knownEntities.length,
    places: input.places.length,
    experiences: input.experiences?.length ?? 0,
    hasCommitment: Boolean(input.currentCommitment),
    serializedBytes: new TextEncoder().encode(JSON.stringify(input)).byteLength
  };

  const [exactQwen, exactLuna, qwenNoLog, qwenWithLog, lunaSafe, lunaLegacySampling] = await Promise.all([
    runExactHandler(env, input, "workers-ai"),
    runExactHandler(env, input, "openai-luna"),
    runQwenShort(env, input, false),
    runQwenShort(env, input, true),
    runOpenAIShort(env, input, "safe"),
    runOpenAIShort(env, input, "legacy-both")
  ]);

  return json({
    ok: exactQwen.ok && exactLuna.ok,
    diagnostic: DIAGNOSTIC_RUN,
    inputClass: "captured-from-real-living-runtime-initial-hej",
    inputSummary: summary,
    exact: { qwen: exactQwen, openai: exactLuna },
    isolation: {
      qwenShortNoGatewayLog: qwenNoLog,
      qwenShortWithGatewayLog: qwenWithLog,
      openaiShortSafeSampling: lunaSafe,
      openaiShortLegacyBothSamplingParams: lunaLegacySampling
    }
  });
}
