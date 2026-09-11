// Redeploy checkpoint after Owner rotated OPENAI_API_KEY on 2026-09-11.
interface DiagnosticAiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

interface DiagnosticRateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ProviderDiagnosticEnv {
  AI: DiagnosticAiBinding;
  AI_PROBE_LIMITER: DiagnosticRateLimitBinding;
  OPENAI_API_KEY?: string;
}

const QWEN_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const OPENAI_MODEL = "gpt-5.6-luna";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DIAGNOSTIC_RUN = "first-hearth-provider-diag-v1";
const TIMEOUT_MS = 15_000;
const MAX_ERROR_BODY = 16_384;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value) ? value : null;
}

function cloudflareKnownCode(error: unknown): string | null {
  const text = error instanceof Error ? error.message : String(error);
  const known = text.match(/\b(3036|3040|3042|3023|5018|5035|5007|5004|3007|3008)\b/u)?.[1];
  return known ?? null;
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

async function runQwen(env: ProviderDiagnosticEnv) {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(async () => env.AI.run(
      QWEN_MODEL,
      {
        messages: [
          { role: "system", content: "Return a short acknowledgement only." },
          { role: "user", content: "Reply with OK." }
        ],
        max_tokens: 16,
        temperature: 0
      },
      {
        gateway: {
          id: "default",
          skipCache: true,
          collectLog: false,
          metadata: { project: "llm-live-npc", stage: "provider-diagnostic", provider: "workers-ai" }
        }
      }
    ));
    return {
      provider: "workers-ai",
      model: QWEN_MODEL,
      ok: result !== undefined && result !== null,
      failureClass: result === undefined || result === null ? "empty_result" : null,
      cloudflareCode: null,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      provider: "workers-ai",
      model: QWEN_MODEL,
      ok: false,
      failureClass: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "provider_exception",
      cloudflareCode: cloudflareKnownCode(error),
      latencyMs: Date.now() - startedAt
    };
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_ERROR_BODY) return null;
  const text = await response.text();
  if (text.length > MAX_ERROR_BODY) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function runOpenAI(env: ProviderDiagnosticEnv) {
  const startedAt = Date.now();
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      provider: "openai",
      model: OPENAI_MODEL,
      ok: false,
      failureClass: "missing_runtime_secret",
      httpStatus: null,
      errorType: null,
      errorCode: null,
      latencyMs: Date.now() - startedAt
    };
  }

  try {
    const response = await withTimeout(signal => fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: "Reply exactly with OK.",
        reasoning: { effort: "none" },
        max_output_tokens: 16,
        store: false,
        metadata: { project: "llm-live-npc", stage: "provider-diagnostic" }
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
        latencyMs: Date.now() - startedAt
      };
    }

    return {
      provider: "openai",
      model: OPENAI_MODEL,
      ok: record(body) && body.status === "completed",
      failureClass: record(body) && body.status === "completed" ? null : "unexpected_success_shape",
      httpStatus: response.status,
      errorType: null,
      errorCode: null,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      provider: "openai",
      model: OPENAI_MODEL,
      ok: false,
      failureClass: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "transport_exception",
      httpStatus: null,
      errorType: null,
      errorCode: null,
      latencyMs: Date.now() - startedAt
    };
  }
}

export async function handleProviderDiagnostic(request: Request, env: ProviderDiagnosticEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.searchParams.get("run") !== DIAGNOSTIC_RUN) {
    return json({ ok: false, error: "Diagnostic invocation not enabled." }, 404);
  }

  try {
    const limit = await env.AI_PROBE_LIMITER.limit({ key: "provider-diagnostic-2026-09-11" });
    if (!limit.success) return json({ ok: false, error: "Diagnostic rate limit exceeded." }, 429);
  } catch {
    return json({ ok: false, error: "Diagnostic limiter unavailable." }, 503);
  }

  const [qwen, openai] = await Promise.all([runQwen(env), runOpenAI(env)]);
  return json({
    ok: qwen.ok && openai.ok,
    diagnostic: "first-hearth-provider-diag-v1",
    qwen,
    openai
  });
}
