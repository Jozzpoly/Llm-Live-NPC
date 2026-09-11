import type { ResidentModelInput, ResidentReply } from "../src/living/types";
import { parseResidentReply } from "../src/living/provider";

interface DiagnosticAiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

interface DiagnosticRateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ResidentContractDiagnosticEnv {
  AI: DiagnosticAiBinding;
  AI_PROBE_LIMITER: DiagnosticRateLimitBinding;
  OPENAI_API_KEY?: string;
}

const QWEN_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const OPENAI_MODEL = "gpt-5.6-luna";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DIAGNOSTIC_RUN = "first-hearth-resident-contract-v1";
const TIMEOUT_MS = 20_000;
const MAX_BODY = 32_768;

const INPUT: ResidentModelInput = {
  actorId: "mira",
  actorName: "Mira",
  latestUtterance: "hej",
  conversation: [{ speaker: "player", text: "hej" }],
  currentActivity: "Odpoczywam: podwórze.",
  heldItemId: null,
  knownEntities: [
    {
      id: "player",
      label: "Gracz",
      kind: "player",
      position: { x: 2, y: 1 },
      seenAtTick: 10,
      visible: true,
      source: "sight"
    }
  ],
  places: [{ id: "cottage", label: "domek" }],
  experiences: []
};

const SYSTEM = "Jesteś Mirą, mieszkanką małego świata. Odpowiedz naturalnie po polsku na bieżące 'hej'. Nie deklaruj wykonania czynności. Zwróć dokładnie jedno wywołanie narzędzia resident_reply; dla zwykłego powitania wybierz intent.kind=continue.";

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

function argumentsValue(value: unknown): unknown {
  let current = value;
  for (let i = 0; i < 2 && typeof current === "string"; i += 1) {
    if (!current || current.length > 8192) return null;
    try { current = JSON.parse(current); } catch { return null; }
  }
  return current;
}

function classifyModelReply(result: unknown): { ok: boolean; failureClass: string | null; reply: ResidentReply | null; outputShape: string } {
  if (!record(result)) return { ok: false, failureClass: "result_not_object", reply: null, outputShape: typeof result };

  let calls: unknown = result.tool_calls;
  let outputShape = "workers-native";

  if (calls === undefined && Array.isArray(result.choices) && result.choices.length === 1) {
    const choice = result.choices[0];
    if (record(choice) && choice.finish_reason === "length") {
      return { ok: false, failureClass: "output_truncated", reply: null, outputShape: "choices" };
    }
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

  const parsed = parseResidentReply(args, INPUT);
  return parsed
    ? { ok: true, failureClass: null, reply: parsed, outputShape }
    : { ok: false, failureClass: "resident_reply_rejected", reply: null, outputShape };
}

function parameters() {
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
              nearPlaceId: { type: "string", enum: ["cottage"] },
              withinPlaceId: { type: "string", enum: ["cottage"] }
            },
            required: ["itemType"]
          },
          quantity: { type: "string", enum: ["one", "all"] },
          targetId: { type: "string", enum: ["player", "cottage"] }
        },
        required: ["kind"]
      }
    },
    required: ["reply", "intent"]
  };
}

async function runQwen(env: ResidentContractDiagnosticEnv) {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(() => env.AI.run(QWEN_MODEL, {
      messages: [
        { role: "system", content: `${SYSTEM} /no_think` },
        { role: "user", content: JSON.stringify(INPUT) },
        { role: "user", content: "Odpowiedz teraz na aktualną wypowiedź gracza: hej\n/no_think" }
      ],
      tools: [{ type: "function", function: { name: "resident_reply", description: "Odpowiedź mieszkańca i zamiar.", parameters: parameters() } }],
      max_tokens: 256,
      temperature: 0.2,
      top_p: 0.8,
      top_k: 20
    }, {
      gateway: { id: "default", skipCache: true, collectLog: false, metadata: { project: "llm-live-npc", stage: "resident-contract-diagnostic", provider: "workers-ai" } }
    }));
    const parsed = classifyModelReply(result);
    return { provider: "workers-ai", model: QWEN_MODEL, ...parsed, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      provider: "workers-ai",
      model: QWEN_MODEL,
      ok: false,
      failureClass: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "provider_exception",
      reply: null,
      outputShape: null,
      latencyMs: Date.now() - startedAt
    };
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return null;
  const text = await response.text();
  if (text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function runOpenAI(env: ResidentContractDiagnosticEnv) {
  const startedAt = Date.now();
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return { provider: "openai", model: OPENAI_MODEL, ok: false, failureClass: "missing_runtime_secret", httpStatus: null, errorType: null, errorCode: null, reply: null, outputShape: null, latencyMs: 0 };

  try {
    const response = await withTimeout(signal => fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: SYSTEM,
        input: [
          { role: "user", content: JSON.stringify(INPUT) },
          { role: "user", content: "Odpowiedz teraz na aktualną wypowiedź gracza: hej" }
        ],
        tools: [{ type: "function", name: "resident_reply", description: "Odpowiedź mieszkańca i zamiar.", parameters: parameters(), strict: false }],
        tool_choice: { type: "function", name: "resident_reply" },
        parallel_tool_calls: false,
        reasoning: { effort: "none" },
        max_output_tokens: 256,
        store: false,
        metadata: { project: "llm-live-npc", stage: "resident-contract-diagnostic" }
      }),
      signal
    }));

    const body = await readBoundedJson(response);
    if (!response.ok) {
      const error = record(body) && record(body.error) ? body.error : null;
      return {
        provider: "openai",
        model: OPENAI_MODEL,
        ok: false,
        failureClass: "provider_http_error",
        httpStatus: response.status,
        errorType: error ? boundedCode(error.type) : null,
        errorCode: error ? boundedCode(error.code) : null,
        reply: null,
        outputShape: null,
        latencyMs: Date.now() - startedAt
      };
    }

    const parsed = classifyModelReply(body);
    return { provider: "openai", model: OPENAI_MODEL, httpStatus: response.status, errorType: null, errorCode: null, ...parsed, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      provider: "openai",
      model: OPENAI_MODEL,
      ok: false,
      failureClass: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "transport_exception",
      httpStatus: null,
      errorType: null,
      errorCode: null,
      reply: null,
      outputShape: null,
      latencyMs: Date.now() - startedAt
    };
  }
}

export async function handleResidentContractDiagnostic(request: Request, env: ResidentContractDiagnosticEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.searchParams.get("run") !== DIAGNOSTIC_RUN) {
    return json({ ok: false, error: "Diagnostic invocation not enabled." }, 404);
  }

  try {
    const limit = await env.AI_PROBE_LIMITER.limit({ key: "resident-contract-diagnostic-2026-09-11" });
    if (!limit.success) return json({ ok: false, error: "Diagnostic rate limit exceeded." }, 429);
  } catch {
    return json({ ok: false, error: "Diagnostic limiter unavailable." }, 503);
  }

  const [qwen, openai] = await Promise.all([runQwen(env), runOpenAI(env)]);
  return json({
    ok: qwen.ok && openai.ok,
    diagnostic: DIAGNOSTIC_RUN,
    inputClass: "synthetic-greeting-same-resident-contract",
    qwen,
    openai
  });
}
