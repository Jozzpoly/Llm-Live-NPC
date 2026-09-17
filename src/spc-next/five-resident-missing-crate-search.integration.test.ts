import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateSlice } from "./five-resident-missing-crate-slice";
import { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import {
  radialMaterialSearchWaypoints,
  ResidentMaterialSearchExecutor,
} from "./resident-material-search-executor";
import { ResidentSemanticProviderMembrane } from "./resident-semantic-provider-membrane";

const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop";
const PICKUP_RUN_ID = "run.janek.pickup-reacquired-crate";
const SEARCH_COURSE = "search the nearby workshop area for the familiar crate before deciding what to do next";
const PICKUP_COURSE = "pick up the reacquired workshop crate";
const MAX_MISSING_CRATE_STEPS = 520;
const MAX_SEARCH_STEPS = 420;
const MAX_PICKUP_STEPS = 420;

describe("five-resident missing-crate search composition", () => {
  it("reconsiders stale knowledge, searches through the body, reacquires by sight, then requires a second semantic decision before pickup", () => {
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

    const searchBinding = slice.kernel.bindRun({
      matterId: MATTER_ID,
      taskId: "task.janek.search-nearby-workshop",
      runId: SEARCH_RUN_ID,
    });
    expect(searchBinding).toMatchObject({
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

    const searchReconciled = slice.kernel.reconcileRunOutcome({
      runId: SEARCH_RUN_ID,
      tick: slice.world.tick,
      status: "succeeded",
      summary: `legally reacquired ${CRATE_ID} through local search`,
    });
    expect(searchReconciled.status).toBe("recorded");

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

    // Reacquisition does not silently grant permission to manipulate the object.
    // A second semantic decision has to turn the new evidence into a pickup course.
    const nextProviderRun = provider.prepare(slice.kernel, MATTER_ID);
    expect(nextProviderRun).toMatchObject({
      matter: { id: MATTER_ID, semanticCourse: SEARCH_COURSE },
      semanticEvidence: { kind: "material_reacquired" },
    });
    const pickupDecision = provider.settle(slice.kernel, nextProviderRun.providerRunId, {
      semanticCourse: PICKUP_COURSE,
    });
    expect(pickupDecision).toMatchObject({
      status: "applied",
      matter: {
        status: "active",
        semanticRevision: 5,
        semanticCourse: PICKUP_COURSE,
        activeRunId: null,
      },
    });

    const pickupBinding = slice.kernel.bindRun({
      matterId: MATTER_ID,
      taskId: "task.janek.pickup-reacquired-crate",
      runId: PICKUP_RUN_ID,
    });
    expect(pickupBinding.semanticRevision).toBe(5);

    const pickup = new ResidentMaterialPickupExecutor(
      PICKUP_RUN_ID,
      CRATE_ID,
      slice.materialKnowledge,
      slice.authority,
      slice.world,
    );
    let pickupState = pickup.step();
    let pickupGuard = 0;
    while (pickupState.status === "running" && pickupGuard < MAX_PICKUP_STEPS) {
      slice.world.step();
      slice.materialKnowledge.sample();
      pickupState = pickup.step();
      pickupGuard += 1;
    }

    expect(pickupGuard).toBeLessThan(MAX_PICKUP_STEPS);
    expect(pickupState.status).toBe("succeeded");
    if (pickupState.status !== "succeeded") throw new Error(`unexpected pickup state: ${pickupState.status}`);
    expect(pickupState.materialOutcome).toMatchObject({
      status: "succeeded",
      code: "picked_up",
      actorId: "resident.janek",
      objectId: CRATE_ID,
    });
    expect(slice.authority.recentActionFacts()).toHaveLength(1);
    expect(slice.authority.recentActionFacts()[0]).toMatchObject({
      runId: PICKUP_RUN_ID,
      action: { kind: "material_pickup", objectId: CRATE_ID },
      resolution: { status: "resolved", outcomeStatus: "succeeded", code: "picked_up" },
    });
    expect(slice.world.materialObject(CRATE_ID)?.location).toEqual({ kind: "held", actorId: "resident.janek" });

    const pickupReconciled = slice.kernel.reconcileRunOutcome({
      runId: PICKUP_RUN_ID,
      tick: pickupState.materialOutcome.tick,
      status: "succeeded",
      summary: `picked up legally reacquired ${CRATE_ID}`,
    });
    expect(pickupReconciled.status).toBe("recorded");
    slice.kernel.resolveMatter(MATTER_ID);
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "resolved",
      semanticRevision: 5,
      activeRunId: null,
    });
  });
});
