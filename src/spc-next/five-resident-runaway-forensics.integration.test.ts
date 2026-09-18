import { describe, expect, it } from "vitest";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";

type PolicyName = "defer30" | "travel4" | "travel0.25";

interface LedgerEntry {
  tick: number;
  residentId: string;
  reasonIds: string[];
  reasonKinds: string[];
  matterCount: number;
  activeMatterCount: number;
  inputCharacters: number;
}

interface ForensicSummary {
  policy: PolicyName;
  simulationTicks: number;
  simulationSeconds: number;
  requests: number;
  requestsPerSimulatedMinute: number;
  meanInputCharacters: number;
  maxInputCharacters: number;
  maxMatterCount: number;
  byResident: Record<string, number>;
  byReasonKind: Record<string, number>;
  meanInterRequestTicksByResident: Record<string, number | null>;
}

const SIMULATION_TICKS = 7_200; // 120 seconds at 60 Hz.

describe("2026-09-18 runaway cognition forensics", () => {
  for (const policy of ["defer30", "travel4", "travel0.25"] as const) {
    it(`measures request production under ${policy}`, async () => {
      const ledger: LedgerEntry[] = [];

      const living = new FiveResidentUnifiedLivingRuntime({
        maxConcurrentCognition: 5,
        fetcher: async (_input, init) => {
          const rawText = String(init?.body);
          const context = JSON.parse(rawText) as {
            tick: number;
            resident: { id: string };
            reasons: Array<{ id: string; kind: string }>;
            currentRegionId: string | null;
            knownRegions: Array<{ id: string }>;
            life: {
              matters: Array<{ status: string }>;
            };
          };

          ledger.push({
            tick: context.tick,
            residentId: context.resident.id,
            reasonIds: context.reasons.map((reason) => reason.id),
            reasonKinds: context.reasons.map((reason) => reason.kind),
            matterCount: context.life.matters.length,
            activeMatterCount: context.life.matters.filter(
              (matter) => matter.status === "active" || matter.status === "suspended",
            ).length,
            inputCharacters: rawText.length,
          });

          const originReasonId = context.reasons[0]?.id;
          if (!originReasonId) throw new Error("forensic fixture lacks cognition reason");

          const active = context.life.matters.some(
            (matter) => matter.status === "active" || matter.status === "suspended",
          );
          const targetRegion = context.knownRegions.find(
            (region) => region.id !== context.currentRegionId,
          );

          const reviewAfterSeconds = policy === "defer30"
            ? 30
            : policy === "travel4"
              ? 4
              : 0.25;

          const commitmentDecision = policy !== "defer30" && !active && targetRegion
            ? {
                kind: "accept" as const,
                reason: `forensic ${policy} opens one grounded travel chapter`,
                intent: {
                  kind: "travel" as const,
                  goal: `visit familiar ${targetRegion.id}`,
                  targetActorId: null,
                  targetRegionId: targetRegion.id,
                  targetPosition: null,
                  text: null,
                },
              }
            : {
                kind: "defer" as const,
                reason: `forensic ${policy} leaves current pressure without a new matter`,
              };

          return new Response(JSON.stringify({
            ok: true,
            originReasonId,
            proposal: {
              version: 1,
              commitmentDecision,
              beliefs: [],
              concerns: [],
              reviewAfterSeconds,
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      });

      let recoveryGuard = 0;
      while (living.lifeRuntime.claimedResidentIds().length < 5 && recoveryGuard < 1_500) {
        living.advanceOneWorldTick();
        await Promise.resolve();
        recoveryGuard += 1;
      }
      expect(recoveryGuard).toBeLessThan(1_500);

      const simulationStartTick = living.world.tick;
      const ledgerStart = ledger.length;
      for (let step = 0; step < SIMULATION_TICKS; step += 1) {
        living.advanceOneWorldTick();
        await Promise.resolve();
      }
      for (let index = 0; index < 16; index += 1) await Promise.resolve();
      for (let index = 0; index < 4; index += 1) {
        living.advanceOneWorldTick();
        await Promise.resolve();
      }

      const runLedger = ledger.slice(ledgerStart).filter(
        (entry) => entry.tick >= simulationStartTick,
      );
      const summary = summarize(policy, runLedger);
      console.log(`RUNAWAY_FORENSICS_JSON=${JSON.stringify(summary)}`);

      expect(runLedger.length).toBeGreaterThan(0);
      expect(living.diagnostics().recentProviderEvents.some(
        (event) => event.status === "provider_error" || event.status === "transport_internal_error",
      )).toBe(false);
    }, 60_000);
  }
});

function summarize(policy: PolicyName, ledger: readonly LedgerEntry[]): ForensicSummary {
  const byResident: Record<string, number> = {};
  const byReasonKind: Record<string, number> = {};
  let totalCharacters = 0;
  let maxInputCharacters = 0;
  let maxMatterCount = 0;

  const ticksByResident = new Map<string, number[]>();
  for (const entry of ledger) {
    byResident[entry.residentId] = (byResident[entry.residentId] ?? 0) + 1;
    for (const kind of entry.reasonKinds) {
      byReasonKind[kind] = (byReasonKind[kind] ?? 0) + 1;
    }
    totalCharacters += entry.inputCharacters;
    maxInputCharacters = Math.max(maxInputCharacters, entry.inputCharacters);
    maxMatterCount = Math.max(maxMatterCount, entry.matterCount);
    const ticks = ticksByResident.get(entry.residentId) ?? [];
    ticks.push(entry.tick);
    ticksByResident.set(entry.residentId, ticks);
  }

  const meanInterRequestTicksByResident: Record<string, number | null> = {};
  for (const [residentId, ticks] of ticksByResident) {
    if (ticks.length < 2) {
      meanInterRequestTicksByResident[residentId] = null;
      continue;
    }
    let total = 0;
    for (let index = 1; index < ticks.length; index += 1) {
      total += ticks[index]! - ticks[index - 1]!;
    }
    meanInterRequestTicksByResident[residentId] = total / (ticks.length - 1);
  }

  const simulationSeconds = SIMULATION_TICKS / 60;
  return {
    policy,
    simulationTicks: SIMULATION_TICKS,
    simulationSeconds,
    requests: ledger.length,
    requestsPerSimulatedMinute: ledger.length / (simulationSeconds / 60),
    meanInputCharacters: ledger.length ? totalCharacters / ledger.length : 0,
    maxInputCharacters,
    maxMatterCount,
    byResident,
    byReasonKind,
    meanInterRequestTicksByResident,
  };
}
