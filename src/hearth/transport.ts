import { isCognitionContext, parseCognitionProposal, type CognitionProvider, type CognitionUsage } from "./contracts";

const MAX_REQUEST_BYTES = 262_144;
const MAX_RESPONSE_BYTES = 262_144;
const CLIENT_TIMEOUT_MS = 45_000;
const unavailable = "Namysł mieszkańca jest chwilowo niedostępny.";
const unreadable = "Nie udało się odczytać namysłu mieszkańca.";

const diagnosticStages = ["upstream_http", "upstream_transport", "upstream_body", "response_status", "incomplete", "refusal",
  "extraction", "proposal_json", "proposal_validation", "client_validation", "deadline"] as const;
const diagnosticCodes = ["http_error", "network_failure", "invalid_response_body", "response_error", "not_completed",
  "incomplete_response", "output_refused", "invalid_output", "unsupported_output_item", "ambiguous_messages",
  "invalid_message", "ambiguous_content", "missing_output_text", "invalid_json", "schema_or_grounding",
  "invalid_envelope", "invalid_usage", "timeout"] as const;
export interface HearthCognitionDiagnostic {
  stage: typeof diagnosticStages[number];
  code: typeof diagnosticCodes[number];
  upstreamStatus?: number;
  responseId?: string;
  requestId?: string;
  responseStatus?: "completed" | "failed" | "in_progress" | "cancelled" | "queued" | "incomplete";
  incompleteReason?: "max_output_tokens" | "content_filter" | "steered" | "unknown";
  outputTypes?: string[];
  outputTextLength?: number;
  /** Bounded proposal-field projection; never an upstream envelope or reasoning item. */
  structuredOutput?: unknown;
}

/** Friendly message for gameplay; safe metadata is available separately to research observers. */
export class HearthCognitionFailure extends Error {
  constructor(message: string, readonly diagnostic: HearthCognitionDiagnostic | null = null,
    readonly usage: CognitionUsage | null = null) { super(message); this.name = "HearthCognitionFailure"; }
}
const TransportFailure = HearthCognitionFailure;
const aborted = () => new DOMException("Przerwano namysł mieszkańca.", "AbortError");
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const tokenCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Share only recognizable proposal fields, including invalid values needed to diagnose rejection. */
export function safeHearthStructuredOutput(value: unknown, secret?: string): unknown {
  if (!record(value)) return undefined;
  const scalar = (v: unknown): unknown => {
    if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return v;
    if (typeof v !== "string") return undefined;
    const redacted = (secret ? v.replaceAll(secret, "[redacted]") : v)
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, "[redacted]").replace(/\bBearer\s+\S+/giu, "[redacted]");
    return redacted.slice(0, 1600);
  };
  const project = (v: unknown, fields: Record<string, (v: unknown) => unknown>): unknown => {
    if (!record(v)) return scalar(v);
    return Object.fromEntries(Object.entries(fields).flatMap(([name, copy]) => {
      const copied = name in v ? copy(v[name]) : undefined;
      return copied === undefined ? [] : [[name, copied]];
    }));
  };
  const scalars = (names: string[]) => Object.fromEntries(names.map(name => [name, scalar]));
  const list = (copy: (v: unknown) => unknown, limit: number) => (v: unknown): unknown =>
    Array.isArray(v) ? v.slice(0, limit).map(item => copy(item) ?? null) : scalar(v);
  const evidenceIds = list(scalar, 12);
  const result = project(value, {
    ...scalars(["version", "reviewAfterSeconds"]),
    speech: v => project(v, scalars(["text", "mode"])),
    beliefs: list(v => project(v, { ...scalars(["id", "claim", "confidence"]), evidenceIds }), 8),
    concerns: list(v => project(v, { ...scalars(["id", "description", "reason", "status"]), evidenceIds }), 8),
    activityDisposition: v => project(v, scalars(["kind", "reason", "basedOnRealizationId"])),
    plan: v => project(v, { concernId: scalar, steps: list(step => project(step, {
      ...scalars(["skill", "targetId", "recipientId", "quantity", "durationSeconds", "text", "mode"]),
      description: v => project(v, scalars(["itemType", "color", "nearPlaceId", "withinPlaceId"]))
    }), 12) })
  });
  return result !== undefined && new TextEncoder().encode(JSON.stringify(result)).byteLength <= 32_768 ? result : undefined;
}

function parseDiagnostic(value: unknown): HearthCognitionDiagnostic | null {
  if (!record(value) || !keys(value, ["stage", "code", "upstreamStatus", "responseId", "requestId", "responseStatus",
    "incompleteReason", "outputTypes", "outputTextLength", "structuredOutput"]) ||
    !diagnosticStages.includes(value.stage as HearthCognitionDiagnostic["stage"]) ||
    !diagnosticCodes.includes(value.code as HearthCognitionDiagnostic["code"])) return null;
  const diagnostic: HearthCognitionDiagnostic = { stage: value.stage as HearthCognitionDiagnostic["stage"],
    code: value.code as HearthCognitionDiagnostic["code"] };
  if (Number.isInteger(value.upstreamStatus) && (value.upstreamStatus as number) >= 100 && (value.upstreamStatus as number) <= 599)
    diagnostic.upstreamStatus = value.upstreamStatus as number;
  for (const name of ["responseId", "requestId"] as const) {
    if (typeof value[name] === "string" && /^[A-Za-z0-9._:-]{1,120}$/u.test(value[name]) && !value[name].startsWith("sk-")) diagnostic[name] = value[name];
  }
  if (["completed", "failed", "in_progress", "cancelled", "queued", "incomplete"].includes(String(value.responseStatus)))
    diagnostic.responseStatus = value.responseStatus as HearthCognitionDiagnostic["responseStatus"];
  if (["max_output_tokens", "content_filter", "steered", "unknown"].includes(String(value.incompleteReason)))
    diagnostic.incompleteReason = value.incompleteReason as HearthCognitionDiagnostic["incompleteReason"];
  if (Array.isArray(value.outputTypes)) diagnostic.outputTypes = value.outputTypes.slice(0, 16)
    .filter((item): item is string => typeof item === "string" && /^[a-z_]{1,64}$/u.test(item));
  if (tokenCount(value.outputTextLength) !== null) diagnostic.outputTextLength = value.outputTextLength as number;
  if ("structuredOutput" in value) {
    const projected = safeHearthStructuredOutput(value.structuredOutput);
    if (projected !== undefined) diagnostic.structuredOutput = projected;
  }
  return diagnostic;
}

function parseUsage(value: unknown): CognitionUsage | null {
  if (!record(value) || !keys(value, ["model", "inputTokens", "outputTokens", "totalTokens", "elapsedMs"]) ||
    typeof value.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/u.test(value.model) ||
    value.model.startsWith("sk-") ||
    typeof value.elapsedMs !== "number" || !Number.isSafeInteger(value.elapsedMs) || value.elapsedMs < 0) return null;
  return {
    model: value.model, inputTokens: tokenCount(value.inputTokens), outputTokens: tokenCount(value.outputTokens),
    totalTokens: tokenCount(value.totalTokens), elapsedMs: value.elapsedMs
  };
}

async function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      onAbort = () => reject(aborted());
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    })]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  if (body) void body.cancel().catch(() => {});
}

async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > MAX_RESPONSE_BYTES)) {
    cancelBody(response.body);
    throw new TransportFailure(unreadable);
  }
  if (!response.body) throw new TransportFailure(unreadable);
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "", complete = false;
  try {
    while (true) {
      const chunk = await untilAborted(reader.read(), signal);
      if (chunk.done) { complete = true; break; }
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new TransportFailure(unreadable);
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (signal.aborted) throw aborted();
    if (error instanceof TransportFailure) throw error;
    throw new TransportFailure(unreadable);
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createHearthCognitionProvider(options: {
  endpoint?: string; fetcher?: typeof fetch; timeoutMs?: number;
  /** Observation only: throwing here cannot change the cognition outcome. */
  onDiagnostic?: (diagnostic: HearthCognitionDiagnostic, usage: CognitionUsage | null) => void;
} = {}): CognitionProvider {
  const endpoint = options.endpoint ?? "/api/hearth/cognition";
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? CLIENT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > CLIENT_TIMEOUT_MS) throw new Error("Nieprawidłowy limit czasu namysłu.");
  return async (context, signal) => {
    if (signal.aborted) throw aborted();
    // Capture one private context so caller mutations cannot change output grounding while awaiting I/O.
    const privateContext = structuredClone(context);
    if (!isCognitionContext(privateContext)) throw new TransportFailure("Nieprawidłowy prywatny kontekst mieszkańca.");
    const body = JSON.stringify(privateContext);
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) throw new TransportFailure("Kontekst mieszkańca jest zbyt duży.");
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      if (controller.signal.aborted) throw aborted();
      const response = await untilAborted(fetcher(endpoint, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body, signal: controller.signal
      }).then(response => {
        if (controller.signal.aborted) { cancelBody(response.body); throw aborted(); }
        return response;
      }), controller.signal);
      if (!response.ok) {
        let diagnostic: HearthCognitionDiagnostic | null = null, usage: CognitionUsage | null = null;
        try {
          const failure = await readResponse(response, controller.signal);
          if (record(failure) && failure.ok === false) {
            diagnostic = parseDiagnostic(failure.diagnostic);
            usage = parseUsage(failure.usage);
          }
        } catch {
          if (controller.signal.aborted) throw aborted();
          // Unrecognized error bodies are never used as public messages or diagnostic payloads.
        }
        throw new TransportFailure(response.status === 429 ? "Zbyt wiele prób namysłu. Odczekaj chwilę."
          : response.status === 504 || response.status === 408 ? "Namysł mieszkańca trwał zbyt długo." : unavailable, diagnostic, usage);
      }
      const result = await readResponse(response, controller.signal);
      if (!record(result) || !keys(result, ["ok", "proposal", "usage"]) || result.ok !== true)
        throw new TransportFailure(unreadable, { stage: "client_validation", code: "invalid_envelope" });
      const proposal = parseCognitionProposal(result.proposal, privateContext);
      const usage = parseUsage(result.usage);
      if (!proposal || !usage) throw new TransportFailure(unreadable, { stage: "client_validation",
        code: !proposal ? "schema_or_grounding" : "invalid_usage",
        structuredOutput: safeHearthStructuredOutput(result.proposal) }, usage);
      return { proposal, usage };
    } catch (error) {
      if (signal.aborted) throw aborted();
      const failure = timedOut ? new TransportFailure("Namysł mieszkańca trwał zbyt długo.", { stage: "deadline", code: "timeout" })
        : error instanceof TransportFailure ? error
        : new TransportFailure(unavailable, { stage: "upstream_transport", code: "network_failure" });
      if (failure.diagnostic) {
        try { options.onDiagnostic?.(structuredClone(failure.diagnostic), failure.usage && structuredClone(failure.usage)); }
        catch { /* Research observation has no authority over the transport outcome. */ }
      }
      throw failure;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      controller.abort();
    }
  };
}
