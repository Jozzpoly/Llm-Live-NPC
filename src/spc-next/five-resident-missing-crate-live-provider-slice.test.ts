import { describe, expect, it } from "vitest";
import {
  createFiveResidentJanekMissingCrateLiveProviderSlice,
  MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID,
} from "./five-resident-missing-crate-live-provider-slice";
import type { SemanticFetch } from "./resident-semantic-live-host";

const MATTER_ID = "matter.janek.missing-crate";
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
  guardLimit = 700,
) {
  let guard = 0;
  while (slice.phase() !== expected && guard < guardLimit) {
    slice.advanceOneWorldTick();
    guard += 1;
  }
  expect(guard).toBeLessThan(guardLimit);
  expect(slice.phase()).toBe(expected);
}

describe("missing-crate live-provider resident tick composition", () => {
  it("keeps World advancing during provider latency, admits only on a resident tick, then grounds the selected competence into embodied search", async () => {
    const transport = deferred<Response>();
    const observed: { providerRunId: string | null; capabilityIds: string[] } = {
      providerRunId: null,
      capabilityIds: [],
    };
    const fetcher: SemanticFetch = async (_input, init) => {
      const run = JSON.parse(String(init?.body ?? "{}")) as {
        providerRunId?: string;
        localCapabilities?: Array<{ id: string }>;
      };
      observed.providerRunId = run.providerRunId ?? null;
      observed.capabilityIds = run.localCapabilities?.map((entry) => entry.id) ?? [];
      return await transport.promise;
    };
    const slice = createFiveResidentJanekMissingCrateLiveProviderSlice({ fetcher });

    advanceUntil(slice, "provider_in_flight");
    expect(observed.providerRunId).toBe("semantic-provider:0");
    expect(observed.capabilityIds).toEqual([MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID]);
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      semanticRevision: 2,
      activeRunId: null,
    });
    expect(slice.diagnostics()).toMatchObject({
      phase: "provider_in_flight",
      providerAttempts: 1,
      providerArrivals: 0,
      admissionTick: null,
    });

    const inFlightTick = slice.world.tick;
    for (let index = 0; index < 17; index += 1) slice.advanceOneWorldTick();
    expect(slice.world.tick).toBe(inFlightTick + 17);
    expect(slice.phase()).toBe("provider_in_flight");
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      semanticRevision: 2,
      activeRunId: null,
    });

    const providerRunId = observed.providerRunId;
    if (!providerRunId) throw new Error("provider run id missing");
    transport.resolve(new Response(JSON.stringify({
      ok: true,
      providerRunId,
      decision: {
        semanticCourse: "search the nearby workshop area for the familiar crate before deciding what to do next",
        localCapabilityId: MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID,
      },
    }), { status: 200 }));
    await slice.waitForProviderArrival();

    // Arrival itself is still inert, even though transport has finished.
    expect(slice.phase()).toBe("provider_in_flight");
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      semanticRevision: 2,
      activeRunId: null,
    });
    expect(slice.diagnostics()).toMatchObject({
      arrivalPending: true,
      arrivalStatus: "decision",
      providerAttempts: 1,
      providerArrivals: 1,
      admissionTick: null,
    });

    const admissionBoundary = slice.world.tick;
    slice.advanceOneWorldTick();
    expect(slice.phase()).toBe("searching");
    expect(slice.diagnostics()).toMatchObject({
      admissionTick: admissionBoundary,
      admissionStatus: "applied",
      selectedCapabilityId: MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID,
      grounding: {
        capabilityId: MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID,
        offeredSemanticRevision: 2,
        admittedSemanticRevision: 3,
        binding: {
          matterId: MATTER_ID,
          runId: SEARCH_RUN_ID,
          semanticRevision: 3,
        },
      },
      providerAttempts: 0,
      providerArrivals: 0,
    });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      semanticRevision: 3,
      activeRunId: SEARCH_RUN_ID,
    });

    advanceUntil(slice, "reacquired", 800);
    expect(slice.materialKnowledge.observation("crate.workshop.01")).toMatchObject({
      currentlyVisible: true,
    });
    expect(slice.materialKnowledge.lastKnownPosition("crate.workshop.01")?.x).toBeGreaterThan(2_500);
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 4,
      activeRunId: null,
    });
    expect(slice.kernel.lastOutcomeEvidence(MATTER_ID)).toMatchObject({
      kind: "task_outcome",
      summary: expect.stringContaining("reacquired"),
    });
    expect(slice.authority.recentActionFacts()).toHaveLength(0);
  });

  it("keeps a valid semantic revision without inventing execution when the provider selects no offered competence", async () => {
    const fetcher: SemanticFetch = async (_input, init) => {
      const run = JSON.parse(String(init?.body ?? "{}")) as { providerRunId?: string };
      return new Response(JSON.stringify({
        ok: true,
        providerRunId: run.providerRunId,
        decision: {
          semanticCourse: "wait and reconsider before choosing a physical method",
          localCapabilityId: null,
        },
      }), { status: 200 });
    };
    const slice = createFiveResidentJanekMissingCrateLiveProviderSlice({ fetcher });

    advanceUntil(slice, "provider_in_flight");
    await slice.waitForProviderArrival();
    const admissionBoundary = slice.world.tick;
    slice.advanceOneWorldTick();

    expect(slice.phase()).toBe("semantic_only");
    expect(slice.diagnostics()).toMatchObject({
      admissionTick: admissionBoundary,
      admissionStatus: "applied",
      selectedCapabilityId: null,
      grounding: null,
    });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 3,
      semanticCourse: "wait and reconsider before choosing a physical method",
      activeRunId: null,
    });
    expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toBeNull();
  });

  it("turns transport failure into explicit provider failure on a resident tick without mutating matter meaning", async () => {
    const fetcher: SemanticFetch = async () => {
      throw new Error("provider offline");
    };
    const slice = createFiveResidentJanekMissingCrateLiveProviderSlice({ fetcher });

    advanceUntil(slice, "provider_in_flight");
    const beforeArrival = slice.kernel.matter(MATTER_ID)!;
    await slice.waitForProviderArrival();
    expect(slice.kernel.matter(MATTER_ID)).toEqual(beforeArrival);
    expect(slice.kernel.pendingSemanticProposals()).toHaveLength(1);

    const admissionBoundary = slice.world.tick;
    slice.advanceOneWorldTick();
    expect(slice.phase()).toBe("provider_error");
    expect(slice.diagnostics()).toMatchObject({
      arrivalStatus: "provider_error",
      admissionTick: admissionBoundary,
      admissionStatus: "provider_error",
      providerAttempts: 0,
      providerArrivals: 0,
    });
    expect(slice.kernel.matter(MATTER_ID)).toEqual(beforeArrival);
    expect(slice.kernel.pendingSemanticProposals()).toHaveLength(0);
    expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toBeNull();
  });
});
