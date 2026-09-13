import { isCognitionContext, parseCognitionProposal, type CognitionProvider, type CognitionUsage } from "./contracts";

const MAX_REQUEST_BYTES = 262_144;
const MAX_RESPONSE_BYTES = 262_144;
const CLIENT_TIMEOUT_MS = 45_000;
const unavailable = "Namysł mieszkańca jest chwilowo niedostępny.";
const unreadable = "Nie udało się odczytać namysłu mieszkańca.";

class TransportFailure extends Error {}
const aborted = () => new DOMException("Przerwano namysł mieszkańca.", "AbortError");
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const tokenCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

function parseUsage(value: unknown): CognitionUsage | null {
  if (!record(value) || !keys(value, ["model", "inputTokens", "outputTokens", "totalTokens", "elapsedMs"]) ||
    typeof value.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/u.test(value.model) ||
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
        cancelBody(response.body);
        throw new TransportFailure(response.status === 429 ? "Zbyt wiele prób namysłu. Odczekaj chwilę."
          : response.status === 504 || response.status === 408 ? "Namysł mieszkańca trwał zbyt długo." : unavailable);
      }
      const result = await readResponse(response, controller.signal);
      if (!record(result) || !keys(result, ["ok", "proposal", "usage"]) || result.ok !== true) throw new TransportFailure(unreadable);
      const proposal = parseCognitionProposal(result.proposal, privateContext);
      const usage = parseUsage(result.usage);
      if (!proposal || !usage) throw new TransportFailure(unreadable);
      return { proposal, usage };
    } catch (error) {
      if (timedOut) throw new TransportFailure("Namysł mieszkańca trwał zbyt długo.");
      if (signal.aborted) throw aborted();
      if (error instanceof TransportFailure) throw error;
      throw new TransportFailure(unavailable);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      controller.abort();
    }
  };
}
