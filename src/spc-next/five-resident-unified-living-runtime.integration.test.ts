import { describe, expect, it, vi } from "vitest";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";

describe("five-resident unified living runtime", () => {
  it("keeps five asynchronous provider completions inert until the next World admission boundary", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body)) as {
        resident: { id: string };
        currentRegionId: string | null;
        reasons: Array<{ id: string }>;
        knownRegions: Array<{ id: string }>;
      };
      const originReasonId = context.reasons[0]?.id;
      if (!originReasonId) throw new Error("fixture request lacks cognition reason");
      const targetRegionId = context.knownRegions.find(
        (region) => region.id !== context.currentRegionId,
      )?.id;
      if (!targetRegionId) throw new Error("fixture request lacks alternate known region");

      return new Response(JSON.stringify({
        ok: true,
        originReasonId,
        proposal: {
          version: 1,
          commitmentDecision: {
            kind: "accept",
            reason: "open one bounded resident-owned chapter from this exact pressure",
            intent: {
              kind: "travel",
              goal: `go to familiar ${targetRegionId}`,
              targetActorId: null,
              targetRegionId,
              targetPosition: null,
              text: null,
            },
          },
          beliefs: [],
          concerns: [],
          reviewAfterSeconds: 60,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const living = new FiveResidentUnifiedLivingRuntime({
      fetcher,
      maxConcurrentCognition: 5,
    });

    let guard = 0;
    while (living.lifeRuntime.claimedResidentIds().length < 5 && guard < 1_500) {
      living.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(1_500);
    while (living.world.tick < 2_400) living.advanceOneWorldTick();

    // This boundary starts any ready provider work, but no provider callback may
    // directly materialize resident life.
    living.advanceOneWorldTick();
    expect(living.diagnostics().providerRequestCount).toBeGreaterThan(0);

    await flushMicrotasks();

    const afterArrival = living.diagnostics();
    expect(afterArrival.providerInboxCount).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalled();
    for (const residentId of afterArrival.claimedResidentIds) {
      expect(living.life(residentId)?.matterScope.matterIds()).toEqual([]);
    }

    // Exact next World boundary consumes the inert arrivals.
    living.advanceOneWorldTick();
    const matterIds = new Map(
      living.lifeRuntime.claimedResidentIds().map((residentId) => [
        residentId,
        living.life(residentId)?.matterScope.matterIds() ?? [],
      ]),
    );
    expect([...matterIds.values()].flat().length).toBeGreaterThan(0);
    expect(living.diagnostics().recentProviderEvents.some(
      (event) => event.status === "admitted",
    )).toBe(true);

    // At least the admitted first wave must become factual World outcomes.
    const firstWave = new Map(
      [...matterIds.entries()].map(([residentId, ids]) => [residentId, [...ids]]),
    );
    guard = 0;
    while (!firstWaveResolved(living, firstWave) && guard < 5_000) {
      living.advanceOneWorldTick();
      await flushMicrotasks();
      guard += 1;
    }
    expect(guard).toBeLessThan(5_000);
    expect(firstWaveResolved(living, firstWave)).toBe(true);
  });

  it("hard-stops upstream traffic even if a live resident has more semantic pressure", async () => {
    // This must be a literal PHYSICAL network-call ceiling, not a count of
    // successful admissions, rendered diagnostics, retries or settled reasons.
    const upstream = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: "global_limit",
    }), {
      status: 429,
      headers: { "content-type": "application/json" },
    }));
    const living = new FiveResidentUnifiedLivingRuntime({
      fetcher: upstream,
      maxUpstreamRequests: 1,
      maxConcurrentCognition: 5,
    });

    // No manual player input, extra NPC matters, simulated provider response
    // that opens a new run, or bypass of the genuine unified scheduling path.
    while (living.world.tick < 2_300) living.advanceOneWorldTick();
    await flushMicrotasks();
    const before = living.diagnostics();
    expect(before.providerHardBudget).toMatchObject({
      maxUpstreamRequests: 1,
      upstreamRequestsStarted: 1,
      exhausted: true,
    });
    expect(upstream).toHaveBeenCalledTimes(1);

    // The World and the local brain keep ticking after budget exhaustion.
    const oldTick = living.world.tick;
    for (let i = 0; i < 360; i += 1) {
      living.advanceOneWorldTick();
      await flushMicrotasks();
    }
    expect(living.world.tick).toBe(oldTick + 360);
    expect(living.diagnostics().providerHardBudget.upstreamRequestsStarted).toBe(1);
    expect(living.diagnostics().providerHardBudget.exhausted).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("does not permit silently disabling the finite upstream request ceiling", () => {
    expect(() => new FiveResidentUnifiedLivingRuntime({
      fetcher: vi.fn(),
      maxUpstreamRequests: 0,
    })).toThrow(/positive safe integer/);
    expect(() => new FiveResidentUnifiedLivingRuntime({
      fetcher: vi.fn(),
      maxUpstreamRequests: Number.POSITIVE_INFINITY,
    })).toThrow(/positive safe integer/);
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function firstWaveResolved(
  living: FiveResidentUnifiedLivingRuntime,
  firstWave: ReadonlyMap<string, readonly string[]>,
): boolean {
  for (const [residentId, matterIds] of firstWave) {
    const life = living.life(residentId as Parameters<typeof living.life>[0]);
    if (!life) return false;
    for (const matterId of matterIds) {
      if (life.kernel.matter(matterId)?.status !== "resolved") return false;
    }
  }
  return true;
}
