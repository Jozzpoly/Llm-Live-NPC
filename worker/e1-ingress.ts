export const E1_MAX_REQUEST_BODY_BYTES = 96 * 1024;

export type E1BoundedJsonRead =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

export function e1RequestMediaType(request: Request): string {
  return (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLowerCase();
}

export function isExplicitCrossSiteRequest(request: Request): boolean {
  return request.headers.get("sec-fetch-site")?.trim().toLowerCase() === "cross-site";
}

export function declaredE1BodyTooLarge(request: Request): boolean {
  const raw = request.headers.get("content-length")?.trim();
  if (!raw || !/^\d+$/.test(raw)) return false;
  try {
    return BigInt(raw) > BigInt(E1_MAX_REQUEST_BODY_BYTES);
  } catch {
    return false;
  }
}

export async function readBoundedE1Json(request: Request): Promise<E1BoundedJsonRead> {
  const body = request.body;
  if (!body) return { ok: false, status: 400, error: "Invalid JSON body" };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > E1_MAX_REQUEST_BODY_BYTES) {
        await reader.cancel("E1 request body too large");
        return { ok: false, status: 413, error: "E1 cognition request body too large" };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  } finally {
    reader.releaseLock();
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}
