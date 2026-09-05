import { handleE1AgentDecision } from "./e1-agent";

const GATEWAY_ID = "default";
const PROBE_PROMPT = "Reply with exactly one short sentence confirming that LLM Live NPC cognition is online.";

const PROBE_CANDIDATES = [
  {
    id: "granite-4.0-h-micro",
    model: "@cf/ibm-granite/granite-4.0-h-micro"
  },
  {
    id: "llama-3.2-3b-instruct",
    model: "@cf/meta/llama-3.2-3b-instruct"
  }
] as const;

interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  aiGatewayLogId?: string;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  AI: AiBinding;
  AI_PROBE_LIMITER: RateLimitBinding;
}

interface UsageShape {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  neurons?: number;
}

interface CompletionShape {
  response?: string | null;
  usage?: UsageShape;
  tool_calls?: unknown[];
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string | null;
  }>;
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function normalizeCompletion(result: unknown) {
  if (typeof result === "string") {
    const content = result.trim();
    return {
      outputShape: "string",
      content: content || null,
      finishReason: null,
      reasoningObserved: false,
      reasoningCharacters: 0,
      usage: null
    };
  }

  const completion = (result && typeof result === "object" ? result : {}) as CompletionShape;
  const nativeResponse = typeof completion.response === "string" ? completion.response.trim() : "";
  const choice = completion.choices?.[0];
  const choiceContent = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
  const content = nativeResponse || choiceContent;
  const reasoning =
    typeof choice?.message?.reasoning === "string"
      ? choice.message.reasoning
      : typeof choice?.message?.reasoning_content === "string"
        ? choice.message.reasoning_content
        : "";

  return {
    outputShape: nativeResponse ? "workers-ai-response" : completion.choices ? "openai-choices" : "unknown",
    content: content || null,
    finishReason: choice?.finish_reason ?? null,
    reasoningObserved: reasoning.length > 0,
    reasoningCharacters: reasoning.length,
    usage: completion.usage ?? null
  };
}

async function runCandidate(env: Env, candidate: (typeof PROBE_CANDIDATES)[number]) {
  const startedAt = Date.now();

  try {
    const result = await env.AI.run(
      candidate.model,
      {
        messages: [
          {
            role: "system",
            content:
              "You are a bounded infrastructure transport probe for an embodied-NPC research laboratory. Follow the requested output directly and concisely."
          },
          { role: "user", content: PROBE_PROMPT }
        ],
        max_tokens: 64,
        temperature: 0
      },
      {
        gateway: {
          id: GATEWAY_ID,
          skipCache: true,
          collectLog: true,
          metadata: {
            project: "llm-live-npc",
            stage: "p0-model-transport-qualification",
            probe: "fixed-completion-transport",
            candidate: candidate.id,
            model: candidate.model
          }
        }
      }
    );

    const gatewayLogId = env.AI.aiGatewayLogId ?? null;
    const summary = normalizeCompletion(result);
    const usableCompletion = Boolean(summary.content) && summary.finishReason !== "length";

    return {
      candidate: candidate.id,
      model: candidate.model,
      inferenceReached: true,
      usableCompletion,
      gatewayLogId,
      latencyMs: Date.now() - startedAt,
      ...summary
    };
  } catch (error) {
    return {
      candidate: candidate.id,
      model: candidate.model,
      inferenceReached: false,
      usableCompletion: false,
      gatewayLogId: env.AI.aiGatewayLogId ?? null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "llm-live-npc",
        aiBinding: Boolean(env.AI),
        gateway: GATEWAY_ID,
        stage: "p0-model-transport-qualification",
        probeCandidates: PROBE_CANDIDATES
      });
    }

    if (url.pathname === "/api/agent/e1/decide") {
      return handleE1AgentDecision(request, env);
    }

    if (url.pathname === "/api/ai/smoke") {
      return json(
        {
          error: "Superseded by /api/ai/qualify after GLM reasoning-budget falsification."
        },
        { status: 410 }
      );
    }

    if (url.pathname === "/api/ai/qualify") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
      }

      const rateLimit = await env.AI_PROBE_LIMITER.limit({ key: "p0-model-transport-qualification" });
      if (!rateLimit.success) {
        return json(
          {
            ok: false,
            error: "P0 model transport qualification rate limit exceeded."
          },
          { status: 429 }
        );
      }

      const results = [];
      for (const candidate of PROBE_CANDIDATES) {
        results.push(await runCandidate(env, candidate));
      }

      const passCount = results.filter((result) => result.usableCompletion).length;

      return json({
        ok: passCount > 0,
        gateway: GATEWAY_ID,
        probe: "fixed-completion-transport",
        passCount,
        candidateCount: results.length,
        results
      });
    }

    return json({ error: "Not found" }, { status: 404 });
  }
};
