import type { E1CycleRequest } from "../agent/e1-grounding";
import { normalizeE1ModelUsage, type E1ModelUsage } from "../agent/e1-provider-usage";

export interface E1DecisionEnvelope {
  cycleId: number;
  decision: unknown;
  model: string | null;
  gatewayLogId: string | null;
  latencyMs: number | null;
  usage?: E1ModelUsage | null;
}

export interface E1DecisionRequestContext {
  signal?: AbortSignal;
  sessionId?: number;
  requestId?: number;
  attempt?: number;
}

export class E1DecisionRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status: number | null = null,
    readonly errorCode: string | null = null,
    readonly usage: E1ModelUsage | null = null,
    readonly model: string | null = null,
    readonly gatewayLogId: string | null = null,
    readonly latencyMs: number | null = null
  ) {
    super(message);
    this.name = "E1DecisionRequestError";
  }
}

export async function requestE1Decision(
  request: E1CycleRequest,
  context: E1DecisionRequestContext = {}
): Promise<E1DecisionEnvelope> {
  let response: Response;
  try {
    response = await fetch("/api/agent/e1/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: context.signal
    });
  } catch (error) {
    if (context.signal?.aborted) throw error;
    throw new E1DecisionRequestError(
      error instanceof Error ? error.message : String(error),
      true
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const usage = normalizeE1ModelUsage(payload.usage);
  const model = typeof payload.model === "string" ? payload.model : null;
  const gatewayLogId = typeof payload.gatewayLogId === "string" ? payload.gatewayLogId : null;
  const latencyMs = typeof payload.latencyMs === "number" && Number.isFinite(payload.latencyMs)
    ? payload.latencyMs
    : null;

  if (!response.ok || payload.ok !== true) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : `E1 cognition request failed: ${response.status}`;
    throw new E1DecisionRequestError(
      message,
      response.status >= 500,
      response.status,
      typeof payload.errorCode === "string" ? payload.errorCode : null,
      usage,
      model,
      gatewayLogId,
      latencyMs
    );
  }

  return {
    cycleId: typeof payload.cycleId === "number" ? payload.cycleId : -1,
    decision: payload.decision,
    model,
    gatewayLogId,
    latencyMs,
    usage
  };
}
