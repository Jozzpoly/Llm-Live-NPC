import type { ResidentModelInput, ResidentReply } from "./types";

const MAX_REPLY_LENGTH = 1200;
const MAX_RESPONSE_BYTES = 16_384;
const REQUEST_TIMEOUT_MS = 30_000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Both sides of the transport enforce the same narrow action vocabulary.
// This checks an intention only; the world still decides whether it succeeds.
export function parseResidentReply(value: unknown, input: ResidentModelInput): ResidentReply | null {
  if (!record(value) || Object.keys(value).length !== 2 || typeof value.reply !== "string") return null;
  const reply = value.reply.trim();
  if (!reply || reply.length > MAX_REPLY_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(reply)) return null;
  if (!record(value.intent)) return null;
  const intent = value.intent;

  if (intent.kind === "find_item") {
    if (Object.keys(intent).length !== 3 || !record(intent.description) || (intent.quantity !== "one" && intent.quantity !== "all")) return null;
    const d = intent.description;
    if (Object.keys(d).some(key => !["itemType", "color", "nearPlaceId", "withinPlaceId"].includes(key)) ||
      !["mug", "hammer", "lantern", "any"].includes(String(d.itemType)) ||
      (d.color !== undefined && d.color !== "red" && d.color !== "blue") ||
      (d.nearPlaceId !== undefined && !input.places.some(p => p.id === d.nearPlaceId)) ||
      (d.withinPlaceId !== undefined && !input.places.some(p => p.id === d.withinPlaceId))) return null;
    return { reply, intent: { kind: "find_item", description: {
      itemType: d.itemType as "mug" | "hammer" | "lantern" | "any",
      ...(d.color ? { color: d.color } : {}), ...(typeof d.nearPlaceId === "string" ? { nearPlaceId: d.nearPlaceId } : {}),
      ...(typeof d.withinPlaceId === "string" ? { withinPlaceId: d.withinPlaceId } : {})
    }, quantity: intent.quantity } };
  }

  if (intent.kind === "continue" || intent.kind === "idle" || intent.kind === "wait" || intent.kind === "drop") {
    return Object.keys(intent).length === 1 ? { reply, intent: { kind: intent.kind } } : null;
  }
  if (intent.kind !== "go" && intent.kind !== "follow" && intent.kind !== "fetch" && intent.kind !== "search") return null;
  if (Object.keys(intent).length !== 2 || typeof intent.targetId !== "string") return null;

  const entity = input.knownEntities.find((known) => known.id === intent.targetId);
  const allowed = intent.kind === "fetch"
    ? entity?.kind === "item"
    : intent.kind === "search"
      ? Boolean(entity) && entity!.id !== input.actorId
    : intent.kind === "follow"
      ? (entity?.kind === "player" || entity?.kind === "npc") && entity.id !== input.actorId
      : Boolean(entity) || input.places.some((place) => place.id === intent.targetId);
  return allowed ? { reply, intent: { kind: intent.kind, targetId: intent.targetId } } : null;
}

function requestError(status: number): string {
  if (status === 429) return "Za dużo wiadomości naraz. Odczekaj chwilę i spróbuj ponownie.";
  if (status === 400 || status === 413) return "Nie udało się wysłać tej wiadomości. Spróbuj napisać ją krócej.";
  if (status === 504 || status === 408) return "Odpowiedź trwała zbyt długo. Spróbuj ponownie.";
  return "Rozmowa jest chwilowo niedostępna. Spróbuj ponownie.";
}

async function readResponse(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Otrzymano pustą odpowiedź rozmowy.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("Odpowiedź rozmowy jest zbyt długa.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function requestResidentReply(
  input: ResidentModelInput,
  signal?: AbortSignal
): Promise<ResidentReply> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/resident/converse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      // Never display arbitrary upstream errors or gateway identifiers.
      throw new Error(requestError(response.status));
    }
    const envelope = await readResponse(response);
    const output = record(envelope) && envelope.ok === true && Object.keys(envelope).length === 2
      ? parseResidentReply(envelope.output, input)
      : null;
    if (!output) throw new Error("Nie udało się odczytać odpowiedzi rozmowy. Spróbuj ponownie.");
    signal?.throwIfAborted();
    return output;
  } catch (error) {
    if (timedOut) throw new Error(requestError(504));
    signal?.throwIfAborted();
    if (error instanceof SyntaxError || error instanceof TypeError) {
      throw new Error("Nie udało się połączyć z rozmową. Spróbuj ponownie.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
