/** Research-only operator auth without Cloudflare Zero Trust.
 * Guard ALL model-spending routes fail-closed. Never bundle the operator secret in Vite.
 * Browser uses short-lived host-only HttpOnly/HMAC session; scripts may use Bearer.
 */
const MIN_SECRET_LENGTH = 32;
const MAX_SESSION_SECONDS = 3600;
const COOKIE = "__Host-spc-operator";
const encoder = new TextEncoder();

export interface OperatorLoginLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export function operatorConfigured(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;
}

function sameSecret(a: string, b: string): boolean {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{20,128}$/u.test(value)) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/");
    return Uint8Array.from(atob(padded + "=".repeat((4 - padded.length % 4) % 4)), ch => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sessionToken(request: Request, secret: string, now = Date.now()): Promise<string> {
  const issued = Math.floor(now / 1000);
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${issued}.${nonce}`;
  const signed = `${new URL(request.url).host}:${payload}`;
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(signed)));
  return `${payload}.${base64Url(mac)}`;
}

function cookieValue(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const pair of header.split(";")) {
    const p = pair.trim();
    if (p.startsWith(COOKIE + "=")) return p.slice(COOKIE.length + 1);
  }
  return null;
}

async function validCookie(request: Request, secret: string, now = Date.now()): Promise<boolean> {
  const token = cookieValue(request);
  if (!token || token.length > 300) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d{10,12}$/u.test(parts[1] ?? "")) return false;
  const issued = Number(parts[1]);
  const current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(issued) || issued > current + 5 || current - issued >= MAX_SESSION_SECONDS) return false;
  const nonce = decodeBase64Url(parts[2] ?? "");
  const signature = decodeBase64Url(parts[3] ?? "");
  if (nonce?.length !== 16 || signature?.length !== 32) return false;
  const signed = `${new URL(request.url).host}:${parts.slice(0, 3).join(".")}`;
  return crypto.subtle.verify("HMAC", await signingKey(secret), new Uint8Array(signature), encoder.encode(signed));
}

function validOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export async function operatorAuthorized(request: Request, secret: string | undefined): Promise<boolean> {
  if (!operatorConfigured(secret)) return false;
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const value = bearer.slice(7);
    if (value.length >= MIN_SECRET_LENGTH && value.length <= 512 && sameSecret(value, secret)) return true;
  }
  // Cookies require a genuine same-origin POST, never a cross-site credentialed request.
  if (!validOrigin(request)) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  return validCookie(request, secret);
}

function loginHtml(): string {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SPC — dostęp operatora</title></head><body><main><h1>SPC — dostęp operatora</h1><p>Logowanie tylko do prywatnych eksperymentów. Sesja trwa maksymalnie 60 minut.</p><form method="post" action="/api/operator/login"><label>Klucz operatora <input name="operator" type="password" autocomplete="off" required minlength="32" maxlength="512"></label><button type="submit">Zaloguj</button></form></main></body></html>`;
}

function protectedHeaders(contentType: string): Headers {
  return new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
}

export async function operatorLogin(
  request: Request,
  secret: string | undefined,
  limiter: OperatorLoginLimiter | undefined,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/operator/login") return null;
  if (request.method === "GET") return new Response(loginHtml(), {
    status: 200, headers: protectedHeaders("text/html; charset=utf-8"),
  });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: protectedHeaders("text/plain") });
  if (!operatorConfigured(secret) || !limiter) {
    return new Response("Operator login unavailable", { status: 503, headers: protectedHeaders("text/plain") });
  }
  if (new URL(request.url).protocol !== "https:" || !validOrigin(request)) {
    return new Response("Operator authentication denied", { status: 403, headers: protectedHeaders("text/plain") });
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return new Response("Operator authentication denied", { status: 403, headers: protectedHeaders("text/plain") });
  }
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return new Response("Invalid form", { status: 415, headers: protectedHeaders("text/plain") });
  }
  const text = await request.text();
  if (text.length > 2048) return new Response("Invalid form", { status: 413, headers: protectedHeaders("text/plain") });
  // This limiter is an adjunct; the secret must be cryptographically random.
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const rate = await limiter.limit({ key: `spc-operator-login:${ip}` });
  if (!rate.success) return new Response("Too many attempts", { status: 429, headers: protectedHeaders("text/plain") });
  const params = new URLSearchParams(text);
  const supplied = params.get("operator") ?? "";
  if (supplied.length < MIN_SECRET_LENGTH || supplied.length > 512 || !sameSecret(supplied, secret)) {
    return new Response("Invalid credentials", { status: 401, headers: protectedHeaders("text/plain") });
  }

  const token = await sessionToken(request, secret);
  const headers = protectedHeaders("text/plain; charset=utf-8");
  headers.set("set-cookie", `${COOKIE}=${token}; Max-Age=${MAX_SESSION_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Strict`);
  headers.set("location", "/?spc=1&scenario=unified-armed");
  return new Response(null, { status: 303, headers });
}
