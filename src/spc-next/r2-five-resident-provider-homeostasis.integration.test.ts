import { describe, expect, it } from "vitest";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";

const SETTLE_GUARD_TICKS = 4_000;
const QUIET_PROBE_TICKS = 6_000;

describe("R2 five-resident provider homeostasis", () => {
  it("stops provider traffic after all explicit initial pressure is semantically settled", async () => {
    const observedRequests: Array<{
      residentId: string;
      tick: number;
      reasonIds: string[];
      reasonKinds: string[];
    }> = [];

    const living = new FiveResidentUnifiedLivingRuntime({
      maxConcurrentCognition: 5,
      fetcher: async (_input, init) => {
        const context = JSON.parse(String(init?.body ?? "{}")) as {
          tick?: number;
          resident?: { id?: string };
          reasons?: Array<{ id?: string; kind?: string }>;
        };
        const originReasonId = context.reasons?.[0]?.id;
        if (!originReasonId) throw new Error("homeostasis fixture request lacks explicit origin");

        observedRequests.push({
          residentId: context.resident?.id ?? "unknown",
          tick: Number.isSafeInteger(context.tick) ? context.tick! : -1,
          reasonIds: (context.reasons ?? []).map((reason) => String(reason.id ?? "")),
          reasonKinds: (context.reasons ?? []).map((reason) => String(reason.kind ?? "")),
        });

        return new Response(JSON.stringify({
          ok: true,
          originReasonId,
          proposal: {
            version: 1,
            commitmentDecision: {
              kind: "decline",
              reason: "bounded fixture settlement: this exact pressure needs no new commitment",
            },
            beliefs: [],
            concerns: [],
            reviewAfterSeconds: 1,
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    let settledAtTick: number | null = null;
    for (let step = 0; step < SETTLE_GUARD_TICKS; step += 1) {
      living.advanceOneWorldTick();
      await Promise.resolve();
      await Promise.resolve();

      const diagnostics = living.diagnostics();
      const claimed = diagnostics.claimedResidentIds;
      const allPressureClear = claimed.length === 5 && claimed.every(
        (residentId) => living.life(residentId)?.resident.pendingCognitionReasons().length === 0,
      );
      const transportClear = diagnostics.providerInFlightResidentIds.length === 0
        && diagnostics.providerInboxCount === 0
        && diagnostics.cognition.inFlightResidents.length === 0
        && diagnostics.cognition.queuedResidents.length === 0
        && diagnostics.cognition.activeRequestCount === 0;

      if (observedRequests.length > 0 && allPressureClear && transportClear) {
        settledAtTick = living.world.tick;
        break;
      }
    }

    expect(settledAtTick).not.toBeNull();
    expect(observedRequests.length).toBeGreaterThan(0);
    expect(observedRequests.every((request) =>
      !request.reasonKinds.includes("quiet_review")
    )).toBe(true);

    const requestCountAtHomeostasis = living.diagnostics().providerRequestCount;
    expect(requestCountAtHomeostasis).toBe(observedRequests.length);

    for (let step = 0; step < QUIET_PROBE_TICKS; step += 1) {
      living.advanceOneWorldTick();
    }

    const afterQuiet = living.diagnostics();
    expect(afterQuiet.providerRequestCount).toBe(requestCountAtHomeostasis);
    expect(afterQuiet.providerInFlightResidentIds).toEqual([]);
    expect(afterQuiet.providerInboxCount).toBe(0);
    expect(afterQuiet.cognition.inFlightResidents).toEqual([]);
    expect(afterQuiet.cognition.queuedResidents).toEqual([]);
    expect(afterQuiet.cognition.activeRequestCount).toBe(0);

    const requestedResidentIds = new Set(observedRequests.map((request) => request.residentId));
    for (const residentId of afterQuiet.claimedResidentIds) {
      const life = living.life(residentId);
      expect(life?.resident.pendingCognitionReasons(), residentId).toEqual([]);
      const lastRequestTick = life?.resident.cognitionScheduleDiagnostics().lastRequestTick ?? null;
      if (requestedResidentIds.has(residentId)) {
        expect(lastRequestTick, residentId).not.toBeNull();
      } else {
        expect(lastRequestTick, residentId).toBeNull();
      }
    }

    // Janek's authored baseline is legitimate idle. He must remain fully request-free
    // merely because the other residents completed authored opening activities.
    expect(requestedResidentIds.has("resident.janek")).toBe(false);
    expect(living.life("resident.janek")?.resident.cognitionScheduleDiagnostics().lastRequestTick).toBeNull();
  }, 15_000);
});
