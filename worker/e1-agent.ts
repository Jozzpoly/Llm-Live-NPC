import type {
  E1CycleRequest,
  E1Decision,
  E1Experience,
  E1ObservedChange,
  E1PerceivedEntity,
  E1Perception
} from "../src/agent/e1-grounding";

const E1_MODEL = "@cf/ibm-granite/granite-4.0-h-micro";
const GATEWAY_ID = "default";
const MAX_COLLECTION_SIZE = 32;
const MAX_TEXT_LENGTH = 256;

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

function boundedString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT_LENGTH ? value : null;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  const parsed = boundedString(value);
  return parsed ?? undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeVisibleEntity(value: unknown): E1PerceivedEntity | null {
  if (!value || typeof value !== "object") return null;
  const entity = value as Record<string, unknown>;
  const id = boundedString(entity.id);
  const label = boundedString(entity.label);
  const distance = finiteNumber(entity.distance);
  const directionValue = entity.direction;
  if (!id || !label || distance === null || distance < 0 || !directionValue || typeof directionValue !== "object") {
    return null;
  }
  const direction = directionValue as Record<string, unknown>;
  const directionX = finiteNumber(direction.x);
  const directionY = finiteNumber(direction.y);
  if (directionX === null || directionY === null) return null;
  if (entity.kind !== "player" && entity.kind !== "npc" && entity.kind !== "item") return null;

  const sanitized: E1PerceivedEntity = {
    id,
    kind: entity.kind,
    label,
    distance,
    direction: { x: directionX, y: directionY }
  };

  if (entity.kind === "item") {
    const heldBy = nullableString(entity.heldBy);
    if (heldBy === undefined) return null;
    sanitized.heldBy = heldBy;
  } else {
    const heldItemId = nullableString(entity.heldItemId);
    if (heldItemId === undefined) return null;
    sanitized.heldItemId = heldItemId;
  }
  return sanitized;
}

function sanitizeObservedChange(value: unknown): E1ObservedChange | null {
  if (!value || typeof value !== "object") return null;
  const change = value as Record<string, unknown>;

  if (change.kind === "item_entered_perception") {
    const itemId = boundedString(change.itemId);
    const holderId = nullableString(change.holderId);
    return itemId && holderId !== undefined ? { kind: change.kind, itemId, holderId } : null;
  }
  if (change.kind === "item_left_perception") {
    const itemId = boundedString(change.itemId);
    const previousHolderId = nullableString(change.previousHolderId);
    return itemId && previousHolderId !== undefined
      ? { kind: change.kind, itemId, previousHolderId }
      : null;
  }
  if (change.kind === "item_holder_changed") {
    const itemId = boundedString(change.itemId);
    const previousHolderId = nullableString(change.previousHolderId);
    const holderId = nullableString(change.holderId);
    return itemId && previousHolderId !== undefined && holderId !== undefined
      ? { kind: change.kind, itemId, previousHolderId, holderId }
      : null;
  }
  if (change.kind === "observer_held_item_changed") {
    const previousItemId = nullableString(change.previousItemId);
    const itemId = nullableString(change.itemId);
    return previousItemId !== undefined && itemId !== undefined
      ? { kind: change.kind, previousItemId, itemId }
      : null;
  }
  if (change.kind === "observer_location_changed") {
    const previousLocationId = nullableString(change.previousLocationId);
    const locationId = nullableString(change.locationId);
    return previousLocationId !== undefined && locationId !== undefined
      ? { kind: change.kind, previousLocationId, locationId }
      : null;
  }
  return null;
}

function sanitizeExperience(value: unknown): E1Experience | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const experience = value as Record<string, unknown>;
  const tick = finiteNumber(experience.tick);
  const code = boundedString(experience.code);
  const message = boundedString(experience.message);
  const targetId = nullableString(experience.targetId);
  if (
    tick === null ||
    !Number.isInteger(tick) ||
    tick < 0 ||
    !code ||
    !message ||
    targetId === undefined ||
    (experience.status !== "succeeded" && experience.status !== "failed")
  ) {
    return undefined;
  }
  return { tick, status: experience.status, code, targetId, message };
}

function sanitizeE1CycleRequest(value: unknown): E1CycleRequest | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Record<string, unknown>;
  const cycleId = finiteNumber(request.cycleId);
  if (cycleId === null || !Number.isInteger(cycleId) || cycleId <= 0) return null;
  if (
    request.trigger !== "perception_changed" &&
    request.trigger !== "experience_changed" &&
    request.trigger !== "perception_and_experience_changed"
  ) {
    return null;
  }
  if (!request.perception || typeof request.perception !== "object") return null;
  const rawPerception = request.perception as Record<string, unknown>;
  const tick = finiteNumber(rawPerception.tick);
  if (tick === null || !Number.isInteger(tick) || tick < 0) return null;
  if (!rawPerception.observer || typeof rawPerception.observer !== "object") return null;
  const rawObserver = rawPerception.observer as Record<string, unknown>;
  const observerLabel = boundedString(rawObserver.label);
  const locationId = nullableString(rawObserver.locationId);
  const locationLabel = nullableString(rawObserver.locationLabel);
  const heldItemId = nullableString(rawObserver.heldItemId);
  if (
    rawObserver.id !== "npc.001" ||
    !observerLabel ||
    locationId === undefined ||
    locationLabel === undefined ||
    heldItemId === undefined
  ) {
    return null;
  }

  if (!Array.isArray(rawPerception.visibleEntities) || rawPerception.visibleEntities.length > MAX_COLLECTION_SIZE) {
    return null;
  }
  const visibleEntities: E1PerceivedEntity[] = [];
  for (const rawEntity of rawPerception.visibleEntities) {
    const entity = sanitizeVisibleEntity(rawEntity);
    if (!entity) return null;
    visibleEntities.push(entity);
  }

  if (!Array.isArray(rawPerception.fetchableItemIds) || rawPerception.fetchableItemIds.length > MAX_COLLECTION_SIZE) {
    return null;
  }
  const fetchableItemIds: string[] = [];
  for (const value of rawPerception.fetchableItemIds) {
    const id = boundedString(value);
    if (!id || fetchableItemIds.includes(id)) return null;
    fetchableItemIds.push(id);
  }

  const visibleFreeItems = new Set(
    visibleEntities
      .filter((entity) => entity.kind === "item" && entity.heldBy === null)
      .map((entity) => entity.id)
  );
  if (heldItemId !== null && fetchableItemIds.length > 0) return null;
  if (fetchableItemIds.some((id) => !visibleFreeItems.has(id))) return null;

  if (!Array.isArray(request.observedChanges) || request.observedChanges.length > MAX_COLLECTION_SIZE) return null;
  const observedChanges: E1ObservedChange[] = [];
  for (const rawChange of request.observedChanges) {
    const change = sanitizeObservedChange(rawChange);
    if (!change) return null;
    observedChanges.push(change);
  }

  const previousExperience = sanitizeExperience(request.previousExperience);
  if (previousExperience === undefined) return null;

  const perception: E1Perception = {
    tick,
    observer: {
      id: "npc.001",
      label: observerLabel,
      locationId,
      locationLabel,
      heldItemId
    },
    visibleEntities,
    fetchableItemIds
  };

  return {
    cycleId,
    trigger: request.trigger,
    perception,
    observedChanges,
    previousExperience
  };
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
  if (!completion.tool_calls || completion.tool_calls.length !== 1) return null;
  const toolCall = completion.tool_calls[0];
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body = sanitizeE1CycleRequest(rawBody);
  if (!body) {
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
              "You are the bounded intention policy for NPC-001 in an embodied game-world experiment. You know only the supplied current perception, observed temporal changes and prior self experience. Choose exactly one provided tool. Never infer or name unseen world entities. Treat observedChanges as the only evidence about what just changed. If an item_holder_changed event shows a currently fetchable item becoming free and NPC-001 holds nothing, choose fetch for that item. Otherwise choose wait. After a successful fetch experience, choose wait. The tool call is only a proposed intention; world mechanics execute and validate it separately."
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
          error: "Model did not return exactly one valid bounded intention tool call",
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
