import { describe, expect, it } from "vitest";
import {
  createFiveResidentJanekMissingCrateSlice,
  type FiveResidentJanekMissingCrateSlice,
} from "./five-resident-missing-crate-slice";
import {
  radialMaterialSearchWaypoints,
  ResidentMaterialSearchExecutor,
} from "./resident-material-search-executor";
import { ResidentSemanticProviderMembrane } from "./resident-semantic-provider-membrane";

const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop";
const SEARCH_COURSE = "search the nearby workshop area for the familiar crate before deciding what to do next";
const MAX_MISSING_STEPS = 520;
const MAX_SEARCH_STEPS = 420;

describe("material search epistemic non-interference", () => {
  it("keeps search motion identical across different hidden crate positions until legal sight can distinguish the worlds", () => {
    const near = prepareSearchWorld(48_000);
    const far = prepareSearchWorld(54_000);

    const nearCrate = freeCratePosition(near.slice);
    const farCrate = freeCratePosition(far.slice);
    expect(nearCrate).not.toEqual(farCrate);
    expect(near.plan).toEqual(far.plan);
    expect(near.slice.materialKnowledge.snapshot()).toEqual(far.slice.materialKnowledge.snapshot());
    expect(actorState(near.slice)).toEqual(actorState(far.slice));

    let nearStep = near.executor.step();
    let farStep = far.executor.step();
    let guard = 0;
    let legalDivergenceObserved = false;

    while (guard < MAX_SEARCH_STEPS) {
      expect(nearStep).toEqual(farStep);
      expect(actorState(near.slice)).toEqual(actorState(far.slice));
      expect(near.slice.materialKnowledge.snapshot()).toEqual(far.slice.materialKnowledge.snapshot());
      expect(near.slice.authority.recentActionFacts()).toEqual([]);
      expect(far.slice.authority.recentActionFacts()).toEqual([]);

      if (nearStep.status !== "running" || farStep.status !== "running") break;

      near.slice.world.step();
      far.slice.world.step();
      near.slice.materialKnowledge.sample();
      far.slice.materialKnowledge.sample();
      guard += 1;

      const nearVisible = near.slice.materialKnowledge.observation(CRATE_ID)?.currentlyVisible ?? false;
      const farVisible = far.slice.materialKnowledge.observation(CRATE_ID)?.currentlyVisible ?? false;

      // The body received the same command before this perception boundary, so even
      // the first legally distinguishable frame must have identical physical state.
      expect(actorState(near.slice)).toEqual(actorState(far.slice));

      if (nearVisible !== farVisible) {
        expect(nearVisible).toBe(true);
        expect(farVisible).toBe(false);
        nearStep = near.executor.step();
        farStep = far.executor.step();
        expect(nearStep.status).toBe("found");
        expect(farStep.status).toBe("running");
        legalDivergenceObserved = true;
        break;
      }

      expect(near.slice.materialKnowledge.snapshot()).toEqual(far.slice.materialKnowledge.snapshot());
      nearStep = near.executor.step();
      farStep = far.executor.step();
    }

    expect(guard).toBeLessThan(MAX_SEARCH_STEPS);
    expect(legalDivergenceObserved).toBe(true);
    expect(near.slice.authority.recentActionFacts()).toEqual([]);
    expect(far.slice.authority.recentActionFacts()).toEqual([]);
  });
});

function prepareSearchWorld(hiddenRelocationSpeed: number) {
  const slice = createFiveResidentJanekMissingCrateSlice({ hiddenRelocationSpeed });
  let state = slice.stepJanek();
  let guard = 0;
  while (state.status === "running" && guard < MAX_MISSING_STEPS) {
    slice.world.step();
    state = slice.stepJanek();
    guard += 1;
  }
  if (state.status !== "semantic_pressure") throw new Error(`missing-crate frontier failed: ${state.status}`);

  const memory = slice.materialKnowledge.observation(CRATE_ID);
  if (!memory || memory.currentlyVisible) throw new Error("search setup lacks stale private material memory");

  const provider = new ResidentSemanticProviderMembrane();
  const providerRun = provider.prepare(slice.kernel, MATTER_ID);
  const settled = provider.settle(slice.kernel, providerRun.providerRunId, { semanticCourse: SEARCH_COURSE });
  if (settled.status !== "applied") throw new Error(`search semantic settlement failed: ${settled.status}`);

  slice.kernel.bindRun({
    matterId: MATTER_ID,
    taskId: "task.janek.search-nearby-workshop",
    runId: SEARCH_RUN_ID,
  });
  const plan = radialMaterialSearchWaypoints(memory.lastKnownPosition, 400, 8);
  const executor = new ResidentMaterialSearchExecutor(
    SEARCH_RUN_ID,
    CRATE_ID,
    plan,
    slice.materialKnowledge,
    slice.authority,
    slice.world,
  );
  return { slice, plan, executor };
}

function freeCratePosition(slice: FiveResidentJanekMissingCrateSlice) {
  const crate = slice.world.materialObject(CRATE_ID);
  if (!crate || crate.location.kind !== "free") throw new Error("crate is not free");
  return crate.location.position;
}

function actorState(slice: FiveResidentJanekMissingCrateSlice) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === "resident.janek");
  if (!actor) throw new Error("Janek missing");
  return { position: actor.position, velocity: actor.velocity };
}
