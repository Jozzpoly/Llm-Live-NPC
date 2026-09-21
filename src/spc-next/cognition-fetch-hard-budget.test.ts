import { describe, expect, it, vi } from "vitest";
import { createCognitionFetchHardBudget } from "./cognition-fetch-hard-budget";

describe("cognition fetch hard budget", () => {
  it("allows exactly the configured upstream count and blocks later attempts locally", async () => {
    const release: Array<() => void> = [];
    const upstream = vi.fn(async () => {
      await new Promise<void>((resolve) => release.push(resolve));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const budget = createCognitionFetchHardBudget(upstream, 1);

    const first = budget.fetch("/api/provider", { method: "POST" });
    const second = await budget.fetch("/api/provider", { method: "POST" });

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toEqual({
      ok: false,
      code: "experiment_request_budget_exhausted",
    });
    expect(budget.snapshot()).toEqual({
      maxUpstreamRequests: 1,
      attemptedRequests: 2,
      upstreamRequestsStarted: 1,
      blockedRequests: 1,
      exhausted: true,
    });

    release[0]!();
    await expect(first).resolves.toMatchObject({ status: 200 });
  });

  it("consumes authority before awaiting upstream so concurrent calls cannot race the cap", async () => {
    let release!: () => void;
    const upstream = vi.fn(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return new Response("{}", { status: 200 });
    });
    const budget = createCognitionFetchHardBudget(upstream, 1);

    const first = budget.fetch("/api/provider");
    const [second, third] = await Promise.all([
      budget.fetch("/api/provider"),
      budget.fetch("/api/provider"),
    ]);

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(429);
    expect(third.status).toBe(429);
    expect(budget.snapshot()).toMatchObject({
      attemptedRequests: 3,
      upstreamRequestsStarted: 1,
      blockedRequests: 2,
      exhausted: true,
    });

    release();
    await first;
  });

  it("rejects non-positive or non-integral limits", () => {
    const upstream = vi.fn();
    expect(() => createCognitionFetchHardBudget(upstream, 0)).toThrow();
    expect(() => createCognitionFetchHardBudget(upstream, -1)).toThrow();
    expect(() => createCognitionFetchHardBudget(upstream, 1.5)).toThrow();
  });
});
