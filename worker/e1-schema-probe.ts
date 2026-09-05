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

const WAIT_TOOL = {
  type: "function",
  function: {
    name: "wait",
    description: "Choose no physical task for this cognition cycle.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

const FETCH_TOOL = {
  type: "function",
  function: {
    name: "fetch",
    description: "Fetch one currently visible, free item using the world's normal embodied executor.",
    parameters: {
      type: "object",
      properties: {
        targetId: {
          type: "string",
          description: "ID of a free item present in the current bounded perception. Legal IDs: item.mug."
        }
      },
      required: ["targetId"]
    }
  }
};

const E1_LIKE_BODY = {
  cycleId: 1,
  trigger: "perception_changed",
  perception: {
    tick: 100,
    observer: {
      id: "npc.001",
      label: "NPC-001",
      locationId: "yard",
      locationLabel: "Common Yard",
      heldItemId: null
    },
    visibleEntities: [
      {
        id: "player.jozz",
        kind: "player",
        label: "Jozz",
        distance: 80,
        direction: { x: -1, y: 0 },
        heldItemId: null
      },
      {
        id: "item.mug",
        kind: "item",
        label: "Red mug",
        distance: 41,
        direction: { x: -1, y: 0 },
        heldBy: null
      }
    ],
    fetchableItemIds: ["item.mug"]
  },
  observedChanges: [
    {
      kind: "item_holder_changed",
      itemId: "item.mug",
      previousHolderId: "player.jozz",
      holderId: null
    }
  ],
  previousExperience: null
};

export async function handleE1SchemaProbe(request: Request, env: E1SchemaProbeEnv): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const rateLimit = await env.AI_PROBE_LIMITER.limit({ key: "e1-schema-diagnostic" });
  if (!rateLimit.success) {
    return Response.json({ ok: false, error: "E1 schema diagnostic rate limit exceeded" }, { status: 429 });
  }

  const startedAt = Date.now();
  try {
    const result = await env.AI.run(
      MODEL,
      {
        messages: [
          {
            role: "system",
            content:
              "You are the bounded intention policy for NPC-001 in an embodied game-world experiment. You know only the supplied current perception, observed temporal changes and prior self experience. Choose exactly one provided tool. Never infer or name unseen world entities. Treat observedChanges as the only evidence about what just changed. If an item_holder_changed event shows a currently fetchable item becoming free and NPC-001 holds nothing, choose fetch for that item. Otherwise choose wait. After a successful fetch experience, choose wait. The tool call is only a proposed intention; world mechanics execute and validate it separately."
          },
          {
            role: "user",
            content: JSON.stringify(E1_LIKE_BODY)
          }
        ],
        tools: [WAIT_TOOL, FETCH_TOOL],
        max_tokens: 96,
        temperature: 0
      },
      {
        gateway: {
          id: GATEWAY_ID,
          skipCache: true,
          collectLog: true,
          metadata: {
            project: "llm-live-npc",
            stage: "e1-two-tool-output-diagnostic",
            model: MODEL
          }
        }
      }
    );

    return Response.json({
      ok: true,
      model: MODEL,
      gatewayLogId: env.AI.aiGatewayLogId ?? null,
      latencyMs: Date.now() - startedAt,
      result
    });
  } catch (error) {
    return Response.json({
      ok: false,
      model: MODEL,
      gatewayLogId: env.AI.aiGatewayLogId ?? null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
