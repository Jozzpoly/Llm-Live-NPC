import { describe, expect, it } from "vitest";
import {
  createFiveResidentJanekMissingCrateLiveProviderSlice,
  MISSING_CRATE_LIVE_PICKUP_CAPABILITY_ID,
  MISSING_CRATE_LIVE_PICKUP_RUN_ID,
  MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID,
} from "./five-resident-missing-crate-live-provider-slice";
import type { SemanticFetch } from "./resident-semantic-live-host";

const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop.live-provider";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function advanceUntil(
  slice: ReturnType<typeof createFiveResidentJanekMissingCrateLiveProviderSlice>,
  expected: ReturnType<typeof slice.phase>,
  guardLimit = 1_200,
) {
  let guard = 0;
  while (slice.phase() !== expected && guard < guardLimit) {
    slice.advanceOneWorldTick();
    guard += 1;
  }
  expect(guard).toBeLessThan(guardLimit);
  expect(slice.phase()).toBe(expected);
}

describe("missing-crate live-provider continuing matter lifecycle", () => {
  it("uses stable origin plus changing evidence across two provider bursts, then resolves only after embodied pickup", async () => {
    const pickupTransport = deferred<Response>();
    const requests: Array<{
      version: number;
      providerRunId: string;
      matter: { id: string; semanticCourse: string };
      originEvidence: { id: string; kind: string; summary: string };
      semanticEvidence: { id: string; kind: string; summary: string };
      localCapabilities: Array<{ id: string; summary: string }>;
    }> = [];

    const fetcher: SemanticFetch = async (_input, init) => {
      const run = JSON.parse(String(init?.body ?? "{}")) as (typeof requests)[number];
      requests.push(structuredClone(run));
      const capabilityId = run.localCapabilities[0]?.id ?? null;
      if (capabilityId === MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID) {
        return new Response(JSON.stringify({
          ok: true,
          providerRunId: run.providerRunId,
          decision: {
            semanticCourse: "search the nearby workshop area for the familiar crate before deciding what to do next",
            localCapabilityId: MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID,
          },
        }), { status: 200 });
      }
      if (capabilityId === MISSING_CRATE_LIVE_PICKUP_CAPABILITY_ID) {
        return await pickupTransport.promise;
      }
      throw new Error(`unexpected live capability offer: ${capabilityId}`);
    };

    const slice = createFiveResidentJanekMissingCrateLiveProviderSlice({ fetcher });

    advanceUntil(slice, "provider_in_flight");
    await slice.waitForProviderArrival();
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({ semanticRevision: 2, activeRunId: null });
    slice.advanceOneWorldTick();
    expect(slice.phase()).toBe("searching");
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      semanticRevision: 3,
      activeRunId: SEARCH_RUN_ID,
    });

    advanceUntil(slice, "reacquired", 900);
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 4,
      activeRunId: null,
    });
    expect(slice.kernel.semanticEvidence(MATTER_ID)).toMatchObject({ kind: "material_reacquired" });
    expect(slice.materialKnowledge.observation(CRATE_ID)?.currentlyVisible).toBe(true);
    expect(requests).toHaveLength(1);

    // Reacquisition is an observable boundary. Only the next World tick may create
    // a second semantic attempt for the separately offered visible-pickup competence.
    slice.advanceOneWorldTick();
    expect(slice.phase()).toBe("pickup_provider_in_flight");
    expect(requests).toHaveLength(2);
    expect(slice.diagnostics()).toMatchObject({
      providerStage: "pickup",
      providerRequestCount: 2,
      providerAttempts: 1,
      providerArrivals: 0,
    });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({ semanticRevision: 4, activeRunId: null });

    const secondInFlightTick = slice.world.tick;
    for (let index = 0; index < 13; index += 1) slice.advanceOneWorldTick();
    expect(slice.world.tick).toBe(secondInFlightTick + 13);
    expect(slice.phase()).toBe("pickup_provider_in_flight");
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({ semanticRevision: 4, activeRunId: null });

    const second = requests[1]!;
    pickupTransport.resolve(new Response(JSON.stringify({
      ok: true,
      providerRunId: second.providerRunId,
      decision: {
        semanticCourse: "pick up the familiar workshop crate now that it is visible again",
        localCapabilityId: MISSING_CRATE_LIVE_PICKUP_CAPABILITY_ID,
      },
    }), { status: 200 }));
    await slice.waitForProviderArrival();

    // Second transport completion is inert until the explicit resident tick.
    expect(slice.phase()).toBe("pickup_provider_in_flight");
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({ semanticRevision: 4, activeRunId: null });
    const pickupAdmissionTick = slice.world.tick;
    slice.advanceOneWorldTick();
    expect(slice.phase()).toBe("picking_up");
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      semanticRevision: 5,
      activeRunId: MISSING_CRATE_LIVE_PICKUP_RUN_ID,
    });
    expect(slice.diagnostics()).toMatchObject({
      admissionTick: pickupAdmissionTick,
      admissionStatus: "applied",
      selectedCapabilityId: MISSING_CRATE_LIVE_PICKUP_CAPABILITY_ID,
      pickupGrounding: {
        capabilityId: MISSING_CRATE_LIVE_PICKUP_CAPABILITY_ID,
        offeredSemanticRevision: 4,
        admittedSemanticRevision: 5,
        binding: {
          matterId: MATTER_ID,
          runId: MISSING_CRATE_LIVE_PICKUP_RUN_ID,
          semanticRevision: 5,
        },
      },
      providerAttempts: 0,
      providerArrivals: 0,
    });

    advanceUntil(slice, "resolved", 700);
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "resolved",
      semanticRevision: 5,
      activeRunId: null,
    });
    expect(slice.world.materialObject(CRATE_ID)?.location).toEqual({
      kind: "held",
      actorId: "resident.janek",
    });
    expect(slice.authority.recentActionFacts()).toContainEqual(expect.objectContaining({
      runId: MISSING_CRATE_LIVE_PICKUP_RUN_ID,
      action: expect.objectContaining({ kind: "material_pickup", objectId: CRATE_ID }),
      resolution: expect.objectContaining({ status: "resolved", outcomeStatus: "succeeded", code: "picked_up" }),
    }));

    expect(requests[0]).toMatchObject({
      version: 3,
      matter: { id: MATTER_ID },
      originEvidence: { id: "evidence:janek:missing-crate:origin", kind: "life_context" },
      semanticEvidence: { kind: "checked_absence" },
      localCapabilities: [{ id: MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID }],
    });
    expect(requests[1]).toMatchObject({
      version: 3,
      matter: {
        id: MATTER_ID,
        semanticCourse: "search the nearby workshop area for the familiar crate before deciding what to do next",
      },
      originEvidence: { id: "evidence:janek:missing-crate:origin", kind: "life_context" },
      semanticEvidence: { kind: "material_reacquired" },
      localCapabilities: [{ id: MISSING_CRATE_LIVE_PICKUP_CAPABILITY_ID }],
    });
    expect(requests[1]!.originEvidence).toEqual(requests[0]!.originEvidence);
    expect(requests[1]!.semanticEvidence.id).not.toBe(requests[0]!.semanticEvidence.id);
    expect(slice.diagnostics().providerAdmissions).toHaveLength(2);
  });
});
