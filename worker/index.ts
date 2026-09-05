const BOOTSTRAP_MODEL = "@cf/zai-org/glm-4.7-flash";
const GATEWAY_ID = "default";

interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  aiGatewayLogId?: string;
}

interface Env {
  AI: AiBinding;
}

interface CompletionShape {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    neurons?: number;
  };
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function completionSummary(result: unknown) {
  const completion = result as CompletionShape;
  const choice = completion.choices?.[0];
  const message = choice?.message;
  const content = typeof message?.content === "string" ? message.content.trim() : "";
  const reasoning =
    typeof message?.reasoning === "string"
      ? message.reasoning
      : typeof message?.reasoning_content === "string"
        ? message.reasoning_content
        : "";

  return {
    content: content || null,
    finishReason: choice?.finish_reason ?? null,
    reasoningObserved: reasoning.length > 0,
    reasoningCharacters: reasoning.length,
    usage: completion.usage ?? null
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "llm-live-npc",
        aiBinding: Boolean(env.AI),
        bootstrapModel: BOOTSTRAP_MODEL,
        gateway: GATEWAY_ID,
        stage: "p0-hardening"
      });
    }

    if (url.pathname === "/api/ai/smoke") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
      }

      let prompt = "Reply with exactly one short sentence confirming that LLM Live NPC cognition is online.";

      try {
        const body = (await request.json()) as { prompt?: unknown };
        if (typeof body?.prompt === "string" && body.prompt.trim()) {
          prompt = body.prompt.trim().slice(0, 1000);
        }
      } catch {
        // Empty/invalid JSON is fine for the bounded smoke probe.
      }

      try {
        const startedAt = Date.now();
        const result = await env.AI.run(
          BOOTSTRAP_MODEL,
          {
            messages: [
              {
                role: "system",
                content:
                  "You are a bounded infrastructure smoke probe for an embodied-NPC research laboratory. Follow the requested output directly and concisely."
              },
              { role: "user", content: prompt }
            ],
            reasoning_effort: "low",
            max_completion_tokens: 256,
            temperature: 0.2
          },
          {
            gateway: {
              id: GATEWAY_ID,
              skipCache: true,
              collectLog: true,
              metadata: {
                project: "llm-live-npc",
                stage: "p0-hardening",
                probe: "bounded-ai-smoke",
                model: BOOTSTRAP_MODEL
              }
            }
          }
        );

        const summary = completionSummary(result);
        const usableCompletion = Boolean(summary.content) && summary.finishReason !== "length";

        return json({
          ok: usableCompletion,
          inferenceReached: true,
          usableCompletion,
          model: BOOTSTRAP_MODEL,
          gateway: GATEWAY_ID,
          gatewayLogId: env.AI.aiGatewayLogId ?? null,
          latencyMs: Date.now() - startedAt,
          ...summary
        });
      } catch (error) {
        return json(
          {
            ok: false,
            inferenceReached: false,
            usableCompletion: false,
            model: BOOTSTRAP_MODEL,
            gateway: GATEWAY_ID,
            gatewayLogId: env.AI.aiGatewayLogId ?? null,
            error: error instanceof Error ? error.message : String(error)
          },
          { status: 502 }
        );
      }
    }

    return json({ error: "Not found" }, { status: 404 });
  }
};
