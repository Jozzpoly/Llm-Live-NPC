import type { E1CycleRequest } from "../agent/e1-grounding";

export interface E1DecisionEnvelope {
  cycleId: number;
  decision: unknown;
  model: string | null;
  gatewayLogId: string | null;
  latencyMs: number | null;
}

export async function requestE1Decision(request: E1CycleRequest): Promise<E1DecisionEnvelope> {
  const response = await fetch("/api/agent/e1/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `E1 cognition request failed: ${response.status}`
    );
  }

  return {
    cycleId: typeof payload.cycleId === "number" ? payload.cycleId : -1,
    decision: payload.decision,
    model: typeof payload.model === "string" ? payload.model : null,
    gatewayLogId: typeof payload.gatewayLogId === "string" ? payload.gatewayLogId : null,
    latencyMs: typeof payload.latencyMs === "number" ? payload.latencyMs : null
  };
}
