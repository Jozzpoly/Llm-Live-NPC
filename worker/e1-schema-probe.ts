const MODEL = "@cf/ibm-granite/granite-4.0-h-micro";
const GATEWAY_ID = "default";

interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  aiGatewayLogId?: string;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface E1SchemaProbeEnv {
  AI: AiBinding;
  AI_PROBE_LIMITER: RateLimitBinding;
}

type Variant = {
  id: string;
  tools?: unknown[];
};

const variants: Variant[] = [
  { id: "messages-only" },
  {
    id: "flat-minimal",
    tools: [
      {
        name: "fetch",
        description: "Fetch the observed item.",
        parameters: {
          type: "object",
          properties: {
            targetId: {
              type: "string",
              description: "Observed item id. Use item.mug."
            }
          },
          required: ["targetId"]
        }
      }
    ]
  },
  {
    id: "openai-wrapper-minimal",
    tools: [
      {
        type: "function",
        function: {
          name: "fetch",
          description: "Fetch the observed item.",
          parameters: {
            type: "object",
            properties: {
              targetId: {
                type: "string",
                description: "Observed item id. Use item.mug."
              }
            },
            required: ["targetId"]
          }
        }
      }
    ]
  }
];

async function runVariant(env: E1SchemaProbeEnv, variant: Variant) {
  const startedAt = Date.now();
  try {
    const input: Record<string, unknown> = {
      messages: [
        {
          role: "system",
          content: "This is a bounded Workers AI tool-schema diagnostic. Follow the user request exactly."
        },
        {
          role: "user",
          content: variant.tools ? "item.mug is available. Call fetch for item.mug." : "Reply with the word baseline."
        }
      ],
      max_tokens: 96,
      temperature: 0
    };
    if (variant.tools) input.tools = variant.tools;

    const result = await env.AI.run(MODEL, input, {
      gateway: {
        id: GATEWAY_ID,
        skipCache: true,
        collectLog: true,
        metadata: {
          project: "llm-live-npc",
          stage: "e1-schema-diagnostic",
          variant: variant.id,
          model: MODEL
        }
      }
    });

    return {
      id: variant.id,
      ok: true,
      gatewayLogId: env.AI.aiGatewayLogId ?? null,
      latencyMs: Date.now() - startedAt,
      result
    };
  } catch (error) {
    return {
      id: variant.id,
      ok: false,
      gatewayLogId: env.AI.aiGatewayLogId ?? null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function handleE1SchemaProbe(request: Request, env: E1SchemaProbeEnv): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const rateLimit = await env.AI_PROBE_LIMITER.limit({ key: "e1-schema-diagnostic" });
  if (!rateLimit.success) {
    return Response.json({ ok: false, error: "E1 schema diagnostic rate limit exceeded" }, { status: 429 });
  }

  const results = [];
  for (const variant of variants) results.push(await runVariant(env, variant));

  return Response.json({ ok: true, model: MODEL, variants: results });
}
