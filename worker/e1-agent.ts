import type { E1CycleRequest, E1Decision } from "../src/agent/e1-grounding";

const E1_MODEL = "@cf/ibm-granite/granite-4.0-h-micro";
const GATEWAY_ID = "default";

interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  aiGatewayLogId?: string;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface E1AgentEnv {
  AI: AiBinding;
  AI_PROBE_LIMITER: RateLimitBinding;
}

interface ToolCallShape {
  name?: unknown;
  arguments?: unknown;
}

interface CompletionShape {
  tool_calls?: ToolCallShape[];
  usage?: unknown;
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 32 && value.every((entry) => typeof entry === "string");
}

function isE1CycleRequest(value: unknown): value is E1CycleRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  if (!Number.isInteger(request.cycleId) || (request.cycleId as number) <= 0) return false;
  if (typeof request.trigger !== "string") return false;
  if (!request.perception || typeof request.perception !== "object") return false;

  const perception = request.perception as Record<string, unknown>;
  if (!perception.observer || typeof perception.observer !== "object") return false;
  const observer = perception.observer as Record<string, unknown>;
  if (observer.id !== "npc.001") return false;
  if (!isStringArray(perception.fetchableItemIds)) return false;
  if (!Array.isArray(perception.visibleEntities) || perception.visibleEntities.length > 32) return false;

  return request.previousExperience === null || typeof request.previousExperience === "object";
}

function parseArguments(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeDecision(result: unknown, allowedFetchTargets: readonly string[]): E1Decision | null {
  if (!result || typeof result !== "object") return null;
  const completion = result as CompletionShape;
  const toolCall = completion.tool_calls?.[0];
  if (!toolCall || typeof toolCall.name !== "string") return null;

  if (toolCall.name === "wait") return { kind: "wait" };
  if (toolCall.name !== "fetch") return null;

  const args = parseArguments(toolCall.arguments);
  const targetId = args?.targetId;
  if (typeof targetId !== "string" || !allowedFetchTargets.includes(targetId)) return null;
  return { kind: "fetch", targetId };
}

function buildTools(fetchableItemIds: readonly string[]) {
  const tools: Array<Record<string, unknown>> = [
    {
      name: "wait",
      description: "Choose no physical task for this cognition cycle.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  ];

  if (fetchableItemIds.length > 0) {
    tools.push({
      name: "fetch",
      description: "Fetch one currently visible, free item using the world's normal embodied executor.",
      parameters: {
        type: "object",
        properties: {
          targetId: {
            type: "string",
            enum: [...fetchableItemIds],
            description: "ID of a free item present in the current bounded perception."
          }
        },
        required: ["targetId"],
        additionalProperties: false
      }
    });
  }

  return tools;
}

export async function handleE1AgentDecision(request: Request, env: E1AgentEnv): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isE1CycleRequest(body)) {
    return json({ ok: false, error: "Invalid E1 cognition request" }, { status: 400 });
  }

  const rateLimit = await env.AI_PROBE_LIMITER.limit({ key: "e1-grounded-notice-fetch" });
  if (!rateLimit.success) {
    return json({ ok: false, error: "E1 cognition rate limit exceeded" }, { status: 429 });
  }

  const startedAt = Date.now();
  try {
    const result = await env.AI.run(
      E1_MODEL,
      {
        messages: [
          {
            role: "system",
            content:
              "You are the bounded intention policy for NPC-001 in an embodied game-world experiment. You know only the supplied perception and prior self experience. Choose exactly one provided tool. Never infer or name unseen world entities. Prefer wait unless a currently fetchable item is relevant to the immediate observed situation. The tool call is only a proposed intention; world mechanics execute and validate it separately."
          },
          {
            role: "user",
            content: JSON.stringify(body)
          }
        ],
        tools: buildTools(body.perception.fetchableItemIds),
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
            stage: "e1-grounded-notice-fetch",
            cycle: String(body.cycleId),
            model: E1_MODEL
          }
        }
      }
    );

    const decision = normalizeDecision(result, body.perception.fetchableItemIds);
    const completion = result && typeof result === "object" ? (result as CompletionShape) : null;
    const gatewayLogId = env.AI.aiGatewayLogId ?? null;
    if (!decision) {
      return json(
        {
          ok: false,
          cycleId: body.cycleId,
          error: "Model did not return one valid bounded intention tool call",
          model: E1_MODEL,
          gatewayLogId,
          latencyMs: Date.now() - startedAt,
          usage: completion?.usage ?? null
        },
        { status: 502 }
      );
    }

    return json({
      ok: true,
      cycleId: body.cycleId,
      decision,
      model: E1_MODEL,
      gatewayLogId,
      latencyMs: Date.now() - startedAt,
      usage: completion?.usage ?? null
    });
  } catch (error) {
    return json(
      {
        ok: false,
        cycleId: body.cycleId,
        error: error instanceof Error ? error.message : String(error),
        model: E1_MODEL,
        gatewayLogId: env.AI.aiGatewayLogId ?? null,
        latencyMs: Date.now() - startedAt
      },
      { status: 502 }
    );
  }
}
