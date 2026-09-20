import { describe, expect, it } from "vitest";
import {
  FiveResidentUnifiedLivingRuntime,
  type FiveResidentLivingRuntimeDiagnostics,
} from "./five-resident-unified-living-runtime";
import type { FiveResidentId } from "./five-resident-region";

const RESIDENT_IDS = [
  "resident.mira",
  "resident.janek",
  "resident.ida",
  "resident.oren",
  "resident.nela",
] as const satisfies readonly FiveResidentId[];

const HOMEOSTASIS_GUARD_TICKS = 4_000;
const POST_BURST_QUIET_TICKS = 3_600;

interface ObservedProviderRequest {
  residentId: string;
  tick: number;
  reasonIds: string[];
  reasonKinds: string[];
}

describe("R2 five-resident genuine cognition burst", () => {
  it("bursts for five real addressed contacts, then returns to provider homeostasis without echo", async () => {
    const observedRequests: ObservedProviderRequest[] = [];

    const living = new FiveResidentUnifiedLivingRuntime({
      maxConcurrentCognition: 5,
      fetcher: async (_input, init) => {
        const context = JSON.parse(String(init?.body ?? "{}")) as {
          tick?: number;
          resident?: { id?: string };
          reasons?: Array<{ id?: string; kind?: string }>;
        };
        const originReasonId = context.reasons?.[0]?.id;
        if (!originReasonId) throw new Error("burst fixture request lacks exact origin");

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
              reason: "fixture settles this exact semantic contact without opening a new matter",
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

    await driveToHomeostasis(living, observedRequests);
    const baselineRequestCount = living.diagnostics().providerRequestCount;
    expect(baselineRequestCount).toBe(observedRequests.length);

    // Give every prior request more than the urgent anti-storm minimum interval.
    for (let step = 0; step < 20; step += 1) living.advanceOneWorldTick();

    const residentActors = new Map(
      living.world.publicSnapshot().actors
        .filter((actor) => RESIDENT_IDS.includes(actor.id as FiveResidentId))
        .map((actor) => [actor.id as FiveResidentId, actor]),
    );

    for (const [index, residentId] of RESIDENT_IDS.entries()) {
      const residentActor = residentActors.get(residentId);
      if (!residentActor) throw new Error(`missing resident actor ${residentId}`);
      const speakerId = `player.r2-burst-${index}`;
      living.world.addPlayer(speakerId, {
        x: residentActor.position.x + 10,
        y: residentActor.position.y,
      });
      living.world.speak(
        speakerId,
        `urgent bounded contact for ${residentId}`,
        80,
        [residentId],
      );
    }

    const burstAdmissionTick = living.world.tick + 1;
    living.advanceOneWorldTick();

    const duringBurst = living.diagnostics();
    expect(duringBurst.providerRequestCount).toBe(baselineRequestCount + RESIDENT_IDS.length);

    const burstStarts = duringBurst.recentProviderEvents.filter(
      (event) => event.status === "request_started" && event.tick === burstAdmissionTick,
    );
    expect(burstStarts).toHaveLength(RESIDENT_IDS.length);
    expect(new Set(burstStarts.map((event) => event.residentId))).toEqual(new Set(RESIDENT_IDS));

    const burstRequests = observedRequests.slice(-RESIDENT_IDS.length);
    expect(burstRequests).toHaveLength(RESIDENT_IDS.length);
    expect(new Set(burstRequests.map((request) => request.residentId))).toEqual(new Set(RESIDENT_IDS));
    expect(burstRequests.every((request) =>
      request.reasonKinds.includes("heard_speech")
      && !request.reasonKinds.includes("quiet_review")
    )).toBe(true);

    await flushMicrotasks();

    // Admit all bounded declines, then require a clean unresolved/transport state.
    let quietAgain = false;
    for (let step = 0; step < 120; step += 1) {
      living.advanceOneWorldTick();
      await flushMicrotasks();
      if (isHomeostatic(living.diagnostics(), living)) {
        quietAgain = true;
        break;
      }
    }
    expect(quietAgain).toBe(true);

    const countAfterBurstSettlement = living.diagnostics().providerRequestCount;
    expect(countAfterBurstSettlement).toBe(baselineRequestCount + RESIDENT_IDS.length);

    for (let step = 0; step < POST_BURST_QUIET_TICKS; step += 1) {
      living.advanceOneWorldTick();
    }

    const afterQuiet = living.diagnostics();
    expect(afterQuiet.providerRequestCount).toBe(countAfterBurstSettlement);
    expect(isHomeostatic(afterQuiet, living)).toBe(true);
  }, 15_000);
});

async function driveToHomeostasis(
  living: FiveResidentUnifiedLivingRuntime,
  observedRequests: ObservedProviderRequest[],
): Promise<void> {
  for (let step = 0; step < HOMEOSTASIS_GUARD_TICKS; step += 1) {
    living.advanceOneWorldTick();
    await flushMicrotasks();
    if (observedRequests.length > 0 && isHomeostatic(living.diagnostics(), living)) return;
  }
  throw new Error("five-resident runtime did not reach bounded initial homeostasis");
}

function isHomeostatic(
  diagnostics: FiveResidentLivingRuntimeDiagnostics,
  living: FiveResidentUnifiedLivingRuntime,
): boolean {
  if (diagnostics.claimedResidentIds.length !== RESIDENT_IDS.length) return false;
  if (diagnostics.providerInFlightResidentIds.length > 0 || diagnostics.providerInboxCount > 0) return false;
  if (diagnostics.cognition.inFlightResidents.length > 0
    || diagnostics.cognition.queuedResidents.length > 0
    || diagnostics.cognition.activeRequestCount > 0) {
    return false;
  }
  return diagnostics.claimedResidentIds.every(
    (residentId) => living.life(residentId)?.resident.pendingCognitionReasons().length === 0,
  );
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}
