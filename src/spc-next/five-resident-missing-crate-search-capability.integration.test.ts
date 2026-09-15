import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateSlice } from "./five-resident-missing-crate-slice";
import { ResidentMaterialSearchCapability } from "./resident-material-search-capability";
import { ResidentSemanticLiveHost, type SemanticFetch } from "./resident-semantic-live-host";

const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const CAPABILITY_ID = "local.material.search.remembered-workshop-area";
const SEARCH_TASK_ID = "task.janek.search-nearby-workshop";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop.live-capability";

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

function offerSearch(slice: ReturnType<typeof createFiveResidentJanekMissingCrateSlice>) {
  const offered = ResidentMaterialSearchCapability.offer({
    capabilityId: CAPABILITY_ID,
    summary: "Search the remembered workshop area for the familiar crate using local embodied movement and perception; this does not imply the crate is there.",
    matterId: MATTER_ID,
    taskId: SEARCH_TASK_ID,
    runId: SEARCH_RUN_ID,
    objectId: CRATE_ID,
    kernel: slice.kernel,
    knowledge: slice.materialKnowledge,
    authority: slice.authority,
    world: slice.world,
  });
  expect(offered.status).toBe("offered");
  if (offered.status !== "offered") throw new Error(`search capability unavailable: ${offered.reason}`);
  return offered.capability;
}

function selectingFetch(capabilityId: string | null): SemanticFetch {
  return async (_input, init) => {
    const run = JSON.parse(String(init?.body ?? "{}")) as {
      providerRunId?: string;
      localCapabilities?: Array<{ id: string; summary: string }>;
    };
    if (capabilityId !== null) {
      expect(run.localCapabilities?.map((offer) => offer.id)).toContain(capabilityId);
    }
    return new Response(JSON.stringify({
      ok: true,
      providerRunId: run.providerRunId,
      decision: {
        semanticCourse: capabilityId === null
          ? "pause and reconsider before choosing a physical method"
          : "search the nearby workshop area for the familiar crate before deciding what to do next",
        localCapabilityId: capabilityId,
      },
    }), { status: 200 });
  };
}

describe("missing-crate resident-offered search capability", () => {
  it("turns an admitted resident-offered competence into an exact embodied search run only after local re-grounding", async () => {
    const slice = createFiveResidentJanekMissingCrateSlice();
    advanceToSemanticPressure(slice);
    const capability = offerSearch(slice);
    const host = new ResidentSemanticLiveHost(
      slice.kernel,
      undefined,
      "/semantic",
      selectingFetch(CAPABILITY_ID),
    );

    const arrival = await host.requestMatter(MATTER_ID, {
      localCapabilities: [capability.offer()],
    });
    expect(arrival).toMatchObject({
      status: "decision",
      decision: { localCapabilityId: CAPABILITY_ID },
    });
    expect(slice.kernel.matter(MATTER_ID)?.activeRunId).toBeNull();

    const admission = host.admit(arrival, slice.world.tick);
    expect(admission).toMatchObject({
      status: "applied",
      settlement: {
        localCapabilityId: CAPABILITY_ID,
        matter: {
          semanticRevision: 3,
          activeRunId: null,
        },
      },
    });
    if (admission.status !== "applied") throw new Error(`unexpected admission: ${admission.status}`);

    // Model selection is still only semantic preference at this point.
    expect(slice.kernel.matter(MATTER_ID)?.activeRunId).toBeNull();
    expect(capability.lastGrounding()).toBeNull();

    const grounded = capability.ground(
      admission.settlement.localCapabilityId,
      admission.settlement.matter.semanticRevision,
    );
    expect(grounded).toMatchObject({
      status: "grounded",
      record: {
        capabilityId: CAPABILITY_ID,
        matterId: MATTER_ID,
        objectId: CRATE_ID,
        offeredSemanticRevision: 2,
        admittedSemanticRevision: 3,
        semanticEvidenceId: expect.stringContaining("checked-absence"),
        binding: {
          matterId: MATTER_ID,
          taskId: SEARCH_TASK_ID,
          runId: SEARCH_RUN_ID,
          semanticRevision: 3,
        },
      },
    });
    if (grounded.status !== "grounded") throw new Error(`capability grounding rejected: ${grounded.reason}`);
    expect(slice.kernel.matter(MATTER_ID)?.activeRunId).toBe(SEARCH_RUN_ID);
    expect(slice.kernel.canRunMutateWorld(SEARCH_RUN_ID)).toBe(true);

    let local = grounded.executor.step();
    let guard = 0;
    while (local.status === "running" && guard < 720) {
      slice.world.step();
      slice.materialKnowledge.sample();
      local = grounded.executor.step();
      guard += 1;
    }
    expect(guard).toBeLessThan(720);
    expect(local.status).toBe("found");
    if (local.status !== "found") throw new Error(`search did not legally reacquire crate: ${local.status}`);
    expect(local.observation.currentlyVisible).toBe(true);
    expect(local.observation.lastKnownPosition.x).toBeGreaterThan(2_500);
    expect(slice.authority.recentActionFacts()).toHaveLength(0);

    const reconciled = slice.kernel.reconcileRunOutcome({
      runId: SEARCH_RUN_ID,
      tick: slice.world.tick,
      status: "succeeded",
      summary: "resident-offered local search legally reacquired the familiar crate by sight",
    });
    expect(reconciled).toMatchObject({
      status: "recorded",
      binding: grounded.record.binding,
      matter: {
        status: "active",
        semanticRevision: 3,
        activeRunId: null,
      },
    });
  });

  it("lets the provider revise meaning while selecting no competence, without manufacturing a run", async () => {
    const slice = createFiveResidentJanekMissingCrateSlice();
    advanceToSemanticPressure(slice);
    const capability = offerSearch(slice);
    const host = new ResidentSemanticLiveHost(slice.kernel, undefined, "/semantic", selectingFetch(null));

    const arrival = await host.requestMatter(MATTER_ID, {
      localCapabilities: [capability.offer()],
    });
    const admission = host.admit(arrival, slice.world.tick);
    expect(admission).toMatchObject({
      status: "applied",
      settlement: {
        localCapabilityId: null,
        matter: { semanticRevision: 3, activeRunId: null },
      },
    });
    if (admission.status !== "applied") throw new Error(`unexpected admission: ${admission.status}`);

    expect(capability.ground(
      admission.settlement.localCapabilityId,
      admission.settlement.matter.semanticRevision,
    )).toEqual({ status: "rejected", reason: "not_selected" });
    expect(slice.kernel.matter(MATTER_ID)?.activeRunId).toBeNull();
  });

  it("revalidates locally after admission so a later semantic change cannot turn an old capability choice into execution authority", async () => {
    const slice = createFiveResidentJanekMissingCrateSlice();
    advanceToSemanticPressure(slice);
    const capability = offerSearch(slice);
    const host = new ResidentSemanticLiveHost(
      slice.kernel,
      undefined,
      "/semantic",
      selectingFetch(CAPABILITY_ID),
    );

    const arrival = await host.requestMatter(MATTER_ID, {
      localCapabilities: [capability.offer()],
    });
    const admission = host.admit(arrival, slice.world.tick);
    expect(admission.status).toBe("applied");
    if (admission.status !== "applied") throw new Error(`unexpected admission: ${admission.status}`);

    const newer = slice.kernel.recordEvidence({
      id: `evidence:janek:post-admission-reconsider:${slice.world.tick}`,
      tick: slice.world.tick,
      kind: "new_semantic_pressure",
      summary: "A newer resident-owned fact requires reconsideration before starting the offered search.",
    });
    slice.kernel.advanceSemanticContext(MATTER_ID, newer.id);

    expect(capability.ground(
      admission.settlement.localCapabilityId,
      admission.settlement.matter.semanticRevision,
    )).toEqual({ status: "rejected", reason: "semantic_revision_changed" });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      semanticRevision: 4,
      activeRunId: null,
    });
    expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toBeNull();
  });
});
