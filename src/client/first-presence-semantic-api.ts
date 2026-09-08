import type { P2E5ModelSemanticInput } from "../research/p2-e5-semantic-provider-authority-membrane";

const MAX_SEMANTIC_COURSE_LENGTH = 512;

export interface FirstPresenceSemanticTransportEnvelope {
  output: { semanticCourse: string };
  model: string | null;
  gatewayLogId: string | null;
  latencyMs: number | null;
  usage: unknown;
}

export type FirstPresenceSemanticFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseEnvelope(value: unknown): FirstPresenceSemanticTransportEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (payload.ok !== true || !payload.output || typeof payload.output !== "object" || Array.isArray(payload.output)) {
    return null;
  }

  const output = payload.output as Record<string, unknown>;
  if (Object.keys(output).length !== 1 || typeof output.semanticCourse !== "string") return null;
  const semanticCourse = output.semanticCourse.trim();
  if (semanticCourse.length === 0 || semanticCourse.length > MAX_SEMANTIC_COURSE_LENGTH) return null;

  return {
    output: { semanticCourse },
    model: nullableString(payload.model),
    gatewayLogId: nullableString(payload.gatewayLogId),
    latencyMs: nullableFiniteNumber(payload.latencyMs),
    usage: payload.usage ?? null
  };
}

export async function requestFirstPresenceSemanticProposal(
  input: P2E5ModelSemanticInput,
  request: FirstPresenceSemanticFetch = fetch
): Promise<FirstPresenceSemanticTransportEnvelope> {
  const response = await request("/api/first-presence/semantic/propose", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    throw new Error(`First Presence semantic transport returned invalid JSON: ${response.status}`);
  }

  if (!response.ok) {
    const payload =
      rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
        ? (rawPayload as Record<string, unknown>)
        : null;
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `First Presence semantic request failed: ${response.status}`
    );
  }

  const envelope = parseEnvelope(rawPayload);
  if (!envelope) {
    throw new Error("First Presence semantic transport returned an invalid success envelope.");
  }
  return envelope;
}
