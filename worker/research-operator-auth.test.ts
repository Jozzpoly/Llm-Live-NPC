import { describe, expect, it, vi } from "vitest";
import worker from "./index";
import { operatorAuthorized } from "./research-operator-auth";

const SECRET = "test-random-operator-password-0123456789-TOO-LONG-TO-GUESS";
function env(limited = false) {
  return {
    SPC_RESEARCH_OPERATOR_TOKEN: SECRET,
    AI: { run: vi.fn(async () => ({})) },
    AI_PROBE_LIMITER: { limit: vi.fn(async () => ({ success: !limited })) },
  };
}
function login(password = SECRET, extras: Record<string, string> = {}) {
  return new Request("https://spc.test/api/operator/login", {
    method: "POST",
    headers: {
      origin: "https://spc.test",
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
      ...extras,
    },
    body: new URLSearchParams({ operator: password }).toString(),
  });
}
function provider(cookie?: string, extras: Record<string, string> = {}) {
  return new Request("https://spc.test/api/spc-next/life-intent", {
    method: "POST",
    headers: {
      origin: "https://spc.test",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...extras,
    },
    body: "{}",
  });
}
function cookieOf(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

describe("SPC independent Worker operator session (no Zero Trust)", () => {
  it("serves a no-script login form without exposing any operator credential", async () => {
    const response = await worker.fetch(new Request("https://spc.test/api/operator/login"), env());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
    expect(await response.text()).toContain('type="password"');
    expect((await worker.fetch(new Request("https://spc.test/api/health"), env())).status).toBe(200);
  });

  it("blocks all spending without session and fails closed when secret is absent", async () => {
    expect((await worker.fetch(provider(), env())).status).toBe(403);
    expect((await worker.fetch(provider(), { AI: env().AI, AI_PROBE_LIMITER: env().AI_PROBE_LIMITER })).status).toBe(403);
  });

  it("issues a host-only HttpOnly session and permits an authenticated same-origin request without frontend secret", async () => {
    const credentials = env();
    const granted = await worker.fetch(login(), credentials);
    expect(granted.status).toBe(303);
    expect(granted.headers.get("cache-control")).toBe("no-store");
    expect(granted.headers.get("location")).toContain("unified-armed");
    const rawCookie = granted.headers.get("set-cookie") ?? "";
    expect(rawCookie).toContain("Secure");
    expect(rawCookie).toContain("HttpOnly");
    expect(rawCookie).toContain("SameSite=Strict");
    expect(rawCookie).toContain("Max-Age=3600");
    expect(rawCookie).toContain("Path=/");
    expect(rawCookie).not.toContain(SECRET);
    expect(credentials.AI_PROBE_LIMITER.limit).toHaveBeenCalledTimes(1);
    const authenticated = await worker.fetch(provider(cookieOf(granted)), credentials);
    // Invalid provider input is denied by the ordinary provider validator, not operator auth.
    expect(authenticated.status).not.toBe(403);
    expect(credentials.AI.run).not.toHaveBeenCalled();
  });

  it("rejects bad credentials, cross-origin forms and rate-limit exhaustion", async () => {
    expect((await worker.fetch(login("wrong-password-0123456789-not-a-valid-secret"), env())).status).toBe(401);
    expect((await worker.fetch(login(SECRET, { origin: "https://evil.test" }), env())).status).toBe(403);
    expect((await worker.fetch(login(SECRET, { "sec-fetch-site": "cross-site" }), env())).status).toBe(403);
    expect((await worker.fetch(login(SECRET), env(true))).status).toBe(429);
    const plain = new Request("http://spc.test/api/operator/login", {
      method: "POST", headers: { origin: "http://spc.test", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ operator: SECRET }).toString(),
    });
    expect((await worker.fetch(plain, env())).status).toBe(403);
  });

  it("rejects cookie tampering, another host and cross-site/cross-origin replay", async () => {
    const response = await worker.fetch(login(), env());
    const cookie = cookieOf(response);
    expect((await worker.fetch(provider(cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A")), env())).status).toBe(403);
    const otherHost = new Request("https://other.test/api/spc-next/life-intent", {
      method: "POST", headers: { origin: "https://other.test", cookie, "content-type": "application/json" },
      body: "{}",
    });
    expect((await worker.fetch(otherHost, env())).status).toBe(403);
    expect((await worker.fetch(provider(cookie, { origin: "https://evil.test" }), env())).status).toBe(403);
    expect((await worker.fetch(provider(cookie, { "sec-fetch-site": "cross-site" }), env())).status).toBe(403);
    expect((await worker.fetch(provider(cookie, { origin: "" }), env())).status).toBe(403);
  });

  it("rejects noncanonical alternate encoding of an otherwise identical valid HMAC", async () => {
    const response = await worker.fetch(login(), env());
    const cookie = cookieOf(response);
    expect(await operatorAuthorized(provider(cookie), SECRET)).toBe(true);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const tail = cookie.at(-1) ?? "";
    const index = alphabet.indexOf(tail);
    expect(index).toBeGreaterThanOrEqual(0);
    // For a 32-byte MAC the last base64url character uses only two upper
    // bits. Flip an unused bit: identical MAC bytes, different cookie string.
    const alias = cookie.slice(0, -1) + alphabet[index ^ 1]!;
    expect(alias).not.toBe(cookie);
    expect(await operatorAuthorized(provider(alias), SECRET)).toBe(false);
  });

  it("rejects expired sessions even when the cookie MAC was originally valid", async () => {
    const initialTime = Date.now();
    const now = vi.spyOn(Date, "now");
    try {
      now.mockReturnValue(initialTime);
      const grant = await worker.fetch(login(), env());
      const cookie = cookieOf(grant);
      expect(await operatorAuthorized(provider(cookie), SECRET)).toBe(true);
      now.mockReturnValue(initialTime + 3601_000);
      expect(await operatorAuthorized(provider(cookie), SECRET)).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it("preserves the #162 Bearer path for private CI without placing credentials in the SPA", async () => {
    const auth = await worker.fetch(provider(undefined, { authorization: "Bearer " + SECRET }), env());
    expect(auth.status).not.toBe(403);
    const denied = await worker.fetch(provider(undefined, { authorization: "Bearer " + SECRET.slice(0, -1) }), env());
    expect(denied.status).toBe(403);
  });
});
