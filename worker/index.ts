const BOOTSTRAP_MODEL = "@cf/zai-org/glm-4.7-flash";

interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

interface Env {
  AI: AiBinding;
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
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
        gateway: "default"
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
                  "You are a bounded infrastructure smoke probe for an embodied-NPC research laboratory. Be concise."
              },
              { role: "user", content: prompt }
            ],
            max_completion_tokens: 96,
            temperature: 0.2
          },
          {
            gateway: {
              id: "default",
              skipCache: true
            }
          }
        );

        return json({
          ok: true,
          model: BOOTSTRAP_MODEL,
          gateway: "default",
          latencyMs: Date.now() - startedAt,
          result
        });
      } catch (error) {
        return json(
          {
            ok: false,
            model: BOOTSTRAP_MODEL,
            error: error instanceof Error ? error.message : String(error)
          },
          { status: 502 }
        );
      }
    }

    return json({ error: "Not found" }, { status: 404 });
  }
};
