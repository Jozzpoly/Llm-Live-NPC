import type { E1CycleRequest } from "../agent/e1-grounding";

export interface E1DecisionEnvelope {
  cycleId: number;
  decision: unknown;
  model: string | null;
  gatewayLogId: string | null;
  latencyMs: number | null;
}

export interface E1DecisionRequestContext {
  signal?: AbortSignal;
}

export class E1DecisionRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status: number | null = null
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
  if (!response.ok || payload.ok !== true) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : `E1 cognition request failed: ${response.status}`;
    throw new E1DecisionRequestError(message, response.status >= 500, response.status);
  }

  return {
    cycleId: typeof payload.cycleId === "number" ? payload.cycleId : -1,
    decision: payload.decision,
    model: typeof payload.model === "string" ? payload.model : null,
    gatewayLogId: typeof payload.gatewayLogId === "string" ? payload.gatewayLogId : null,
    latencyMs: typeof payload.latencyMs === "number" ? payload.latencyMs : null
  };
}
