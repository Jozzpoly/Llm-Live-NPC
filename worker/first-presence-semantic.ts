import type { P2E5ModelSemanticInput } from "../src/research/p2-e5-semantic-provider-authority-membrane";

const FIRST_PRESENCE_SEMANTIC_MODEL = "@cf/ibm-granite/granite-4.0-h-micro";
const GATEWAY_ID = "default";
const MAX_CURRENT_COURSE_LENGTH = 512;
const MAX_EVIDENCE_SUMMARY_LENGTH = 1024;
const MAX_ACTOR_ID_LENGTH = 128;
const MAX_TOOL_ARGUMENTS_LENGTH = 4096;

interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  aiGatewayLogId?: string;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface FirstPresenceSemanticEnv {
  AI: AiBinding;
  AI_PROBE_LIMITER: RateLimitBinding;
}

interface ToolFunctionShape {
  name?: unknown;
  arguments?: unknown;
}

interface ToolCallShape {
  name?: unknown;
  arguments?: unknown;
  function?: ToolFunctionShape;
}

interface CompletionShape {
  tool_calls?: ToolCallShape[];
  choices?: Array<{
    message?: {
      tool_calls?: ToolCallShape[];
    };
  }>;
  usage?: unknown;
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function sanitizeSource(value: unknown): P2E5ModelSemanticInput["semanticEvidence"]["source"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;

  if (source.kind === "actor") {
    const actorId = boundedString(source.actorId, MAX_ACTOR_ID_LENGTH);
    return actorId ? { kind: "actor", actorId } : null;
  }
  if (source.kind === "world" || source.kind === "task" || source.kind === "clock") {
    return { kind: source.kind };
  }
  return null;
}

function sanitizeSemanticInput(value: unknown): P2E5ModelSemanticInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const currentSemanticCourse = boundedString(raw.currentSemanticCourse, MAX_CURRENT_COURSE_LENGTH);
  if (!currentSemanticCourse) return null;

  if (!raw.semanticEvidence || typeof raw.semanticEvidence !== "object" || Array.isArray(raw.semanticEvidence)) {
    return null;
  }
  const evidence = raw.semanticEvidence as Record<string, unknown>;
  if (
    evidence.kind !== "observed" &&
    evidence.kind !== "heard" &&
    evidence.kind !== "task_outcome" &&
    evidence.kind !== "elapsed"
  ) {
    return null;
  }
  const source = sanitizeSource(evidence.source);
  const summary = boundedString(evidence.summary, MAX_EVIDENCE_SUMMARY_LENGTH);
  if (!source || !summary) return null;

  // Reconstruct only the P2-E5 serializable semantic surface. Unknown request
  // fields are deliberately ignored and therefore can never reach the model.
  return {
    currentSemanticCourse,
    semanticEvidence: {
      kind: evidence.kind,
      source,
      summary
    }
  };
}

function parseArguments(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  let current: unknown = value;
  for (let decode = 0; decode < 2; decode += 1) {
    if (typeof current !== "string" || current.length === 0 || current.length > MAX_TOOL_ARGUMENTS_LENGTH) {
      return null;
    }
    try {
      current = JSON.parse(current);
    } catch {
      return null;
    }
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return current as Record<string, unknown>;
    }
  }
  return null;
}

function completionToolCalls(result: unknown): ToolCallShape[] | null {
  if (!result || typeof result !== "object") return null;
  const completion = result as CompletionShape;
  if (Array.isArray(completion.tool_calls)) return completion.tool_calls;
  const nested = completion.choices?.[0]?.message?.tool_calls;
  return Array.isArray(nested) ? nested : null;
}

function toolIdentity(toolCall: ToolCallShape): { name: string; arguments: unknown } | null {
  if (toolCall.function && typeof toolCall.function.name === "string") {
    return { name: toolCall.function.name, arguments: toolCall.function.arguments };
  }
  if (typeof toolCall.name === "string") {
    return { name: toolCall.name, arguments: toolCall.arguments };
  }
  return null;
}

function normalizeSemanticOutput(result: unknown): { semanticCourse: string } | null {
  const toolCalls = completionToolCalls(result);
  if (!toolCalls || toolCalls.length !== 1) return null;
  const identity = toolIdentity(toolCalls[0]);
  if (!identity || identity.name !== "set_semantic_course") return null;

  const args = parseArguments(identity.arguments);
  if (!args || Object.keys(args).length !== 1 || !("semanticCourse" in args)) return null;
  if (typeof args.semanticCourse !== "string") return null;
  const semanticCourse = args.semanticCourse.trim();
  if (semanticCourse.length === 0 || semanticCourse.length > MAX_CURRENT_COURSE_LENGTH) return null;
  return { semanticCourse };
}

function semanticTool() {
  return {
    type: "function",
    function: {
      name: "set_semantic_course",
      description:
        "Propose the resident matter's current semantic course after considering only the supplied current course and latest grounded evidence.",
      parameters: {
        type: "object",
        properties: {
          semanticCourse: {
            type: "string",
            description:
              "A concise semantic interpretation of the still-live matter. Preserve the current course when the new evidence does not justify changing it."
          }
        },
        required: ["semanticCourse"]
      }
    }
  };
}

export async function handleFirstPresenceSemanticProposal(
  request: Request,
  env: FirstPresenceSemanticEnv
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const input = sanitizeSemanticInput(rawBody);
  if (!input) {
    return json({ ok: false, error: "Invalid First Presence semantic input" }, { status: 400 });
  }

  const rateLimit = await env.AI_PROBE_LIMITER.limit({
    key: "first-presence-semantic-proposal"
  });
  if (!rateLimit.success) {
    return json({ ok: false, error: "First Presence semantic rate limit exceeded" }, { status: 429 });
  }

  const startedAt = Date.now();
  try {
    const result = await env.AI.run(
      FIRST_PRESENCE_SEMANTIC_MODEL,
      {
        messages: [
          {
            role: "system",
            content:
              "You are a bounded semantic interpreter for one still-live matter in an embodied NPC. You receive only the matter's current semantic course and one latest grounded evidence summary. Interpret what the matter currently means. Do not invent unseen world facts, do not choose or execute physical actions, and do not claim that the matter is resolved. Choose exactly the provided set_semantic_course tool. Preserve the current semantic course when the evidence does not justify a change. The returned value is only a semantic proposal; resident-owned causal authority will validate it separately."
          },
          {
            role: "user",
            content: JSON.stringify(input)
          }
        ],
        tools: [semanticTool()],
        max_tokens: 128,
        temperature: 0
      },
      {
        gateway: {
          id: GATEWAY_ID,
          skipCache: true,
          collectLog: true,
          metadata: {
            project: "llm-live-npc",
            stage: "first-presence-semantic-proposal",
            model: FIRST_PRESENCE_SEMANTIC_MODEL,
            evidenceKind: input.semanticEvidence.kind,
            evidenceSource: input.semanticEvidence.source.kind
          }
        }
      }
    );

    const output = normalizeSemanticOutput(result);
    const completion = result && typeof result === "object" ? (result as CompletionShape) : null;
    const gatewayLogId = env.AI.aiGatewayLogId ?? null;
    if (!output) {
      return json(
        {
          ok: false,
          error: "Model did not return exactly one valid bounded semantic proposal",
          model: FIRST_PRESENCE_SEMANTIC_MODEL,
          gatewayLogId,
          latencyMs: Date.now() - startedAt,
          usage: completion?.usage ?? null
        },
        { status: 502 }
      );
    }

    return json({
      ok: true,
      output,
      model: FIRST_PRESENCE_SEMANTIC_MODEL,
      gatewayLogId,
      latencyMs: Date.now() - startedAt,
      usage: completion?.usage ?? null
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        model: FIRST_PRESENCE_SEMANTIC_MODEL,
        gatewayLogId: env.AI.aiGatewayLogId ?? null,
        latencyMs: Date.now() - startedAt
      },
      { status: 502 }
    );
  }
}
