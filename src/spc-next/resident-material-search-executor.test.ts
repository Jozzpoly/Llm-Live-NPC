import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentMaterialSearchExecutor } from "./resident-material-search-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const RESIDENT_ID = "resident.janek";
const CRATE_ID = "crate.workshop.01";
const RUN_ID = "run.janek.search-crate";

function setup(hiddenCratePosition: { x: number; y: number }, searchWaypoints: readonly { x: number; y: number }[]) {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_400, maxY: 1_000 },
    regions: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 30,
  });
  world.addResident(RESIDENT_ID, "Janek", { x: 100, y: 100 }, { sightRadius: 260, maxSpeed: 120, brainIntervalTicks: 99 });
  world.addPlayer("player.helper", { x: 200, y: 100 }, { maxSpeed: 300 });
  world.addMaterialObject({
    id: CRATE_ID,
    label: "Workshop crate",
    radius: 16,
    location: { kind: "free", position: { x: 200, y: 100 } },
  });

  const knowledge = new ResidentMaterialKnowledge(RESIDENT_ID, [CRATE_ID], world);
  knowledge.sample();
  expect(knowledge.observation(CRATE_ID)).toMatchObject({
    lastKnownPosition: { x: 200, y: 100 },
    currentlyVisible: true,
  });

  expect(world.attemptMaterialAction("player.helper", { kind: "pickup", objectId: CRATE_ID }))
    .toMatchObject({ status: "succeeded", code: "picked_up" });
  world.setActorMotionIntent("player.helper", { x: 300, y: 0 });
  while (world.publicSnapshot().actors.find((actor) => actor.id === "player.helper")!.position.x < hiddenCratePosition.x) {
    world.step();
  }
  world.setActorMotionIntent("player.helper", { x: 0, y: 0 });
  const helper = world.publicSnapshot().actors.find((actor) => actor.id === "player.helper")!;
  expect(world.attemptMaterialAction("player.helper", {
    kind: "place",
    objectId: CRATE_ID,
    position: hiddenCratePosition,
  })).toMatchObject({ status: "succeeded", code: "placed" });
  knowledge.sample();
  expect(knowledge.observation(CRATE_ID)).toMatchObject({
    lastKnownPosition: { x: 200, y: 100 },
    currentlyVisible: false,
  });

  const kernel = new ResidentContinuityKernel();
  const evidence = kernel.recordEvidence({
    id: "evidence:search-course",
    tick: world.tick,
    kind: "checked_absence",
    summary: "The familiar crate was not at its last-known point.",
  });
  kernel.openMatter({
    id: "matter.janek.crate",
    originEvidenceId: evidence.id,
    semanticCourse: "search the nearby work area for the familiar crate",
  });
  kernel.bindRun({ matterId: "matter.janek.crate", taskId: "task.search", runId: RUN_ID });
  const authority = new ResidentWorldExecutionAuthority(RESIDENT_ID, kernel, world);
  const executor = new ResidentMaterialSearchExecutor(
    RUN_ID,
    CRATE_ID,
    searchWaypoints,
    knowledge,
    authority,
    world,
  );
  return { world, kernel, knowledge, authority, executor, helper };
}

describe("ResidentMaterialSearchExecutor", () => {
  it("reacquires a hidden-moved material object only after legal sight while executing a grounded search plan", () => {
    const { world, knowledge, authority, executor } = setup(
      { x: 900, y: 100 },
      [{ x: 420, y: 100 }, { x: 680, y: 100 }],
    );

    let state = executor.step();
    let guard = 0;
    while (state.status === "running" && guard < 240) {
      world.step();
      knowledge.sample();
      state = executor.step();
      guard += 1;
    }

    expect(guard).toBeLessThan(240);
    expect(state.status).toBe("found");
    if (state.status !== "found") throw new Error(`unexpected search state: ${state.status}`);
    expect(state.observation).toMatchObject({
      objectId: CRATE_ID,
      lastKnownPosition: { x: 900, y: 100 },
      currentlyVisible: true,
    });
    expect(state.observation.observedAtTick).toBe(world.tick);
    expect(authority.recentActionFacts()).toEqual([]);
    expect(world.diagnostics().recentMaterialActions.filter((action) => action.actorId === RESIDENT_ID)).toEqual([]);
  });

  it("exhausts the supplied search plan without inventing knowledge or probing hidden object truth", () => {
    const { world, knowledge, authority, executor } = setup(
      { x: 1_250, y: 100 },
      [{ x: 350, y: 100 }, { x: 500, y: 220 }],
    );
    const privateBefore = knowledge.snapshot();

    let state = executor.step();
    let guard = 0;
    while (state.status === "running" && guard < 240) {
      world.step();
      knowledge.sample();
      state = executor.step();
      guard += 1;
    }

    expect(guard).toBeLessThan(240);
    expect(state).toEqual({ status: "exhausted", runId: RUN_ID, searchedWaypointCount: 2 });
    expect(knowledge.snapshot()).toEqual(privateBefore);
    expect(authority.recentActionFacts()).toEqual([]);
    expect(world.diagnostics().recentMaterialActions.filter((action) => action.actorId === RESIDENT_ID)).toEqual([]);
  });

  it("loses body authority immediately when its exact search run becomes stale", () => {
    const { world, kernel, knowledge, authority, executor } = setup(
      { x: 1_250, y: 100 },
      [{ x: 500, y: 100 }, { x: 700, y: 100 }],
    );
    expect(executor.step()).toMatchObject({ status: "running", phase: "search" });
    world.step(3);
    knowledge.sample();

    const changed = kernel.recordEvidence({
      id: "evidence:new-course",
      tick: world.tick,
      kind: "world_change",
      summary: "New evidence changes the search course.",
    });
    kernel.advanceSemanticContext("matter.janek.crate", changed.id);

    expect(executor.step()).toEqual({ status: "authority_lost", runId: RUN_ID });
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: RUN_ID });
  });
});
