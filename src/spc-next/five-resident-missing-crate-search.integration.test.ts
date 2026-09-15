import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateSlice } from "./five-resident-missing-crate-slice";
import {
  radialMaterialSearchWaypoints,
  ResidentMaterialSearchExecutor,
} from "./resident-material-search-executor";
import { ResidentSemanticProviderMembrane } from "./resident-semantic-provider-membrane";

const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop";
const SEARCH_COURSE = "search the nearby workshop area for the familiar crate before deciding what to do next";
const MAX_MISSING_CRATE_STEPS = 520;
const MAX_SEARCH_STEPS = 420;

describe("five-resident missing-crate search composition", () => {
  it("turns checked absence into a new semantic course, embodied search, and legal material reacquisition", () => {
    const slice = createFiveResidentJanekMissingCrateSlice({ hiddenRelocationSpeed: 48_000 });

    let missing = slice.stepJanek();
    let missingGuard = 0;
    while (missing.status === "running" && missingGuard < MAX_MISSING_CRATE_STEPS) {
      slice.world.step();
      missing = slice.stepJanek();
      missingGuard += 1;
    }
    expect(missingGuard).toBeLessThan(MAX_MISSING_CRATE_STEPS);
    expect(missing.status).toBe("semantic_pressure");

    const staleKnowledge = slice.materialKnowledge.observation(CRATE_ID);
    expect(staleKnowledge).toMatchObject({
      lastKnownPosition: { x: 1_952, y: 720 },
      currentlyVisible: false,
    });
    if (!staleKnowledge) throw new Error("missing stale material knowledge");

    const actualBeforeSearch = slice.world.materialObject(CRATE_ID);
    expect(actualBeforeSearch?.location.kind).toBe("free");
    if (!actualBeforeSearch || actualBeforeSearch.location.kind !== "free") {
      throw new Error("hidden crate is not free before search");
    }
    expect(actualBeforeSearch.location.position).not.toEqual(staleKnowledge.lastKnownPosition);

    const provider = new ResidentSemanticProviderMembrane();
    const providerRun = provider.prepare(slice.kernel, MATTER_ID);
    expect(providerRun.semanticEvidence).toMatchObject({ kind: "checked_absence" });
    const settled = provider.settle(slice.kernel, providerRun.providerRunId, {
      semanticCourse: SEARCH_COURSE,
    });
    expect(settled).toMatchObject({
      status: "applied",
      matter: {
        id: MATTER_ID,
        status: "active",
        semanticRevision: 3,
        semanticCourse: SEARCH_COURSE,
        activeRunId: null,
      },
    });

    const searchPlan = radialMaterialSearchWaypoints(staleKnowledge.lastKnownPosition, 400, 8);
    expect(searchPlan).toHaveLength(8);
    expect(searchPlan[0]).toEqual({ x: 2_352, y: 720 });

    const binding = slice.kernel.bindRun({
      matterId: MATTER_ID,
      taskId: "task.janek.search-nearby-workshop",
      runId: SEARCH_RUN_ID,
    });
    expect(binding).toMatchObject({
      matterId: MATTER_ID,
      runId: SEARCH_RUN_ID,
      semanticRevision: 3,
    });

    const search = new ResidentMaterialSearchExecutor(
      SEARCH_RUN_ID,
      CRATE_ID,
      searchPlan,
      slice.materialKnowledge,
      slice.authority,
      slice.world,
    );

    let state = search.step();
    let searchGuard = 0;
    while (state.status === "running" && searchGuard < MAX_SEARCH_STEPS) {
      slice.world.step();
      slice.materialKnowledge.sample();
      state = search.step();
      searchGuard += 1;
    }

    expect(searchGuard).toBeGreaterThan(0);
    expect(searchGuard).toBeLessThan(MAX_SEARCH_STEPS);
    expect(state.status).toBe("found");
    if (state.status !== "found") throw new Error(`unexpected search state: ${state.status}`);

    // The private record may change to hidden World truth only now, after legal sight.
    expect(state.observation.currentlyVisible).toBe(true);
    expect(state.observation.lastKnownPosition).toEqual(actualBeforeSearch.location.position);
    expect(state.observation.observedAtTick).toBe(slice.world.tick);
    expect(state.observation.lastKnownPosition).not.toEqual(staleKnowledge.lastKnownPosition);

    // Search itself never manipulates or probes the material object.
    expect(slice.authority.recentActionFacts()).toEqual([]);
    expect(slice.world.diagnostics().recentMaterialActions.filter((action) => action.actorId === "resident.janek"))
      .toEqual([]);
    expect(slice.world.materialObject(CRATE_ID)).toEqual(actualBeforeSearch);

    const reconciled = slice.kernel.reconcileRunOutcome({
      runId: SEARCH_RUN_ID,
      tick: slice.world.tick,
      status: "succeeded",
      summary: `legally reacquired ${CRATE_ID} through local search`,
    });
    expect(reconciled.status).toBe("recorded");

    const reacquiredEvidence = slice.kernel.recordEvidence({
      id: `evidence:janek:material-reacquired:${CRATE_ID}:${slice.world.tick}`,
      tick: slice.world.tick,
      kind: "material_reacquired",
      summary: `The familiar workshop crate is visible again at (${state.observation.lastKnownPosition.x}, ${state.observation.lastKnownPosition.y}).`,
    });
    slice.kernel.advanceSemanticContext(MATTER_ID, reacquiredEvidence.id);

    const frontier = slice.kernel.matter(MATTER_ID);
    expect(frontier).toMatchObject({
      status: "active",
      semanticRevision: 4,
      semanticCourse: SEARCH_COURSE,
      activeRunId: null,
      semanticEvidenceId: reacquiredEvidence.id,
    });
    expect(slice.kernel.semanticEvidence(MATTER_ID)).toEqual(reacquiredEvidence);
    expect(slice.kernel.lastOutcomeEvidence(MATTER_ID)).toMatchObject({ kind: "task_outcome" });

    // This is the next semantic frontier: finding the crate does not silently grant
    // permission to pick it up. A new semantic decision must decide what happens next.
    const nextProviderRun = provider.prepare(slice.kernel, MATTER_ID);
    expect(nextProviderRun).toMatchObject({
      matter: { id: MATTER_ID, semanticCourse: SEARCH_COURSE },
      semanticEvidence: { kind: "material_reacquired" },
    });
    provider.abandon(slice.kernel, nextProviderRun.providerRunId);
  });
});
