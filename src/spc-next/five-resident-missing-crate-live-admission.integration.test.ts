import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateSlice } from "./five-resident-missing-crate-slice";
import { ResidentSemanticLiveHost, type SemanticFetch } from "./resident-semantic-live-host";

const MATTER_ID = "matter.janek.missing-crate";
const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";

function advanceToSemanticPressure(slice: ReturnType<typeof createFiveResidentJanekMissingCrateSlice>) {
  let state = slice.stepJanek();
  let guard = 0;
  while (state.status === "running" && guard < 560) {
    slice.world.step();
    state = slice.stepJanek();
    guard += 1;
  }
  expect(guard).toBeLessThan(560);
  expect(state.status).toBe("semantic_pressure");
  if (state.status !== "semantic_pressure") throw new Error(`unexpected missing-crate frontier: ${state.status}`);
  return state;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("missing-crate live semantic arrival/admission timing", () => {
  it("lets World and private perception continue while provider is in flight and after arrival, then changes meaning only at explicit World-tick admission", async () => {
    const slice = createFiveResidentJanekMissingCrateSlice({ playerStart: { x: 1_900, y: 720 } });
    const pressure = advanceToSemanticPressure(slice);
    const frontier = slice.kernel.matter(MATTER_ID)!;
    expect(frontier).toMatchObject({
      status: "active",
      semanticRevision: 2,
      activeRunId: null,
      semanticEvidenceId: pressure.checkedAbsenceEvidence.id,
      semanticCourse: "go to the last-known workshop crate position and pick it up",
    });

    const transportGate = deferred<Response>();
    const transportObservation: { providerRunId: string | null } = { providerRunId: null };
    const fetcher: SemanticFetch = async (_input, init) => {
      const run = JSON.parse(String(init?.body ?? "{}")) as { providerRunId?: string };
      transportObservation.providerRunId = run.providerRunId ?? null;
      return await transportGate.promise;
    };
    const host = new ResidentSemanticLiveHost(slice.kernel, undefined, "/semantic", fetcher);

    const transport = host.requestMatter(MATTER_ID);
    expect(transportObservation.providerRunId).toBe("semantic-provider:0");
    expect(host.pendingProviderAttempts()).toBe(1);
    expect(host.pendingArrivals()).toBe(0);
    expect(slice.kernel.pendingSemanticProposals()).toHaveLength(1);

    const inFlightStartTick = slice.world.tick;
    const call = slice.world.speak(PLAYER_ID, "Janek, słyszysz mnie?", 420, [JANEK_ID]);
    slice.world.step();
    slice.world.step(11);

    expect(slice.world.tick).toBe(inFlightStartTick + 12);
    expect(slice.kernel.matter(MATTER_ID)).toEqual(frontier);
    expect(slice.kernel.pendingSemanticProposals()).toHaveLength(1);
    expect(slice.world.residentDiagnostics(JANEK_ID).recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: call.id,
      phenomenon: "speech",
      modality: "hearing",
      actorId: PLAYER_ID,
      text: "Janek, słyszysz mnie?",
      addressed: true,
    }));

    const providerRunId = transportObservation.providerRunId;
    if (!providerRunId) throw new Error("deferred provider transport did not capture correlation id");
    transportGate.resolve(new Response(JSON.stringify({
      ok: true,
      providerRunId,
      decision: {
        semanticCourse: "search the nearby workshop area for the familiar crate",
        localCapabilityId: null,
      },
    }), { status: 200 }));
    const arrival = await transport;

    expect(arrival).toMatchObject({
      status: "decision",
      providerRunId,
      decision: {
        semanticCourse: "search the nearby workshop area for the familiar crate",
        localCapabilityId: null,
      },
    });
    expect(host.pendingArrivals()).toBe(1);
    expect(host.pendingProviderAttempts()).toBe(1);
    expect(slice.kernel.matter(MATTER_ID)).toEqual(frontier);

    const arrivalTick = slice.world.tick;
    slice.world.step(7);
    expect(slice.world.tick).toBe(arrivalTick + 7);
    expect(slice.kernel.matter(MATTER_ID)).toEqual(frontier);
    expect(slice.kernel.pendingSemanticProposals()).toHaveLength(1);

    const admissionTick = slice.world.tick;
    expect(host.admit(arrival, admissionTick)).toMatchObject({
      status: "applied",
      admissionTick,
      settlement: {
        localCapabilityId: null,
        matter: {
          id: MATTER_ID,
          status: "active",
          semanticRevision: 3,
          semanticCourse: "search the nearby workshop area for the familiar crate",
          activeRunId: null,
        },
      },
    });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      semanticRevision: 3,
      semanticCourse: "search the nearby workshop area for the familiar crate",
      activeRunId: null,
    });
    expect(host.pendingProviderAttempts()).toBe(0);
    expect(host.pendingArrivals()).toBe(0);
    expect(host.recentAdmissions()).toEqual([expect.objectContaining({
      providerRunId,
      admissionTick,
      arrivalStatus: "decision",
      outcomeStatus: "applied",
    })]);
  });
});
