import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContextWithDiagnostic } from "../../worker/spc-next-life-context";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";
import type { FiveResidentId } from "./five-resident-region";

const RESIDENT_IDS = [
  "resident.mira",
  "resident.janek",
  "resident.ida",
  "resident.oren",
  "resident.nela",
] as const satisfies readonly FiveResidentId[];

describe("unified resident life long-run Worker boundary", () => {
  it("keeps every outgoing five-resident provider context valid across repeated causal chapters", async () => {
    const validationFailures: Array<{
      residentId: string;
      tick: number;
      diagnostic: string | null;
      matterStates: Array<{ id: string; status: string; bodyState: string | null }>;
    }> = [];
    let validatedRequests = 0;
    let latestValidatedTick = -1;
    const explicitlyReviewedOutcomeIds = new Set<string>();

    const living = new FiveResidentUnifiedLivingRuntime({
      maxConcurrentCognition: 5,
      fetcher: async (_input, init) => {
        const raw = JSON.parse(String(init?.body)) as any;
        const checked = sanitizeSpcNextLifeContextWithDiagnostic(raw);
        if (!checked.context) {
          validationFailures.push({
            residentId: raw?.resident?.id ?? "unknown",
            tick: raw?.tick ?? -1,
            diagnostic: checked.diagnostic,
            matterStates: Array.isArray(raw?.life?.matters)
              ? raw.life.matters.map((matter: any) => ({
                  id: String(matter?.id ?? ""),
                  status: String(matter?.status ?? ""),
                  bodyState: matter?.activeRun?.bodyState ?? null,
                }))
              : [],
          });
          return new Response(JSON.stringify({
            ok: false,
            code: `invalid_life_intent_context.${checked.diagnostic ?? "unknown"}`,
          }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        validatedRequests += 1;
        latestValidatedTick = Math.max(latestValidatedTick, contextTick(raw));
        const context = checked.context;
        const originReasonId = context.reasons[0]?.id;
        if (!originReasonId) throw new Error("long-run fixture lacks cognition reason");

        const active = context.life.matters.some(
          (matter) => matter.status === "active" || matter.status === "suspended",
        );
        const targetRegion = context.knownRegions.find(
          (region) => region.id !== context.currentRegionId,
        );

        const proposal = !active && targetRegion
          ? {
              version: 1,
              commitmentDecision: {
                kind: "accept",
                reason: "continue one bounded grounded chapter",
                intent: {
                  kind: "travel",
                  goal: `visit familiar ${targetRegion.id}`,
                  targetActorId: null,
                  targetRegionId: targetRegion.id,
                  targetPosition: null,
                  text: null,
                },
              },
              beliefs: [],
              concerns: [],
              reviewAfterSeconds: 4,
            }
          : {
              version: 1,
              commitmentDecision: {
                kind: "defer",
                reason: "preserve current continuity until another grounded review",
              },
              beliefs: [],
              concerns: [],
              reviewAfterSeconds: 4,
            };

        return new Response(JSON.stringify({
          ok: true,
          originReasonId,
          proposal,
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    for (let step = 0; step < 5_000; step += 1) {
      living.advanceOneWorldTick();

      // This is an explicit transport-stress policy owned by the test, not by the
      // generic resident executor. Repeated chapters are requested only so Worker
      // context validity can be requalified beyond the historical t1335 failure.
      for (const residentId of RESIDENT_IDS) {
        const life = living.life(residentId);
        if (!life) continue;
        for (const matter of life.currentLifeView().matters) {
          const outcome = matter.lastOutcomeEvidence;
          if (!outcome || explicitlyReviewedOutcomeIds.has(outcome.id)) continue;
          explicitlyReviewedOutcomeIds.add(outcome.id);
          life.outcomeReviewBridge.observe(outcome, living.world.tick);
        }
      }

      // Permit the same Promise/microtask boundary used by the browser pump without
      // adding wall-clock provider latency.
      await Promise.resolve();
    }
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    living.advanceOneWorldTick();

    // The original transport drift first failed at t1335 and then poisoned later
    // contexts. R2 must still cross that frontier, but request count is no longer a
    // quality target: only explicit causal pressure may generate provider work.
    expect(validatedRequests).toBeGreaterThan(5);
    expect(latestValidatedTick).toBeGreaterThan(1_335);
    expect(validationFailures).toEqual([]);
    expect(living.diagnostics().recentProviderEvents.some(
      (event) => event.detail.includes("invalid_life_intent_context"),
    )).toBe(false);
  }, 15_000);
});


function contextTick(raw: any): number {
  return Number.isSafeInteger(raw?.tick) && raw.tick >= 0 ? raw.tick : -1;
}
