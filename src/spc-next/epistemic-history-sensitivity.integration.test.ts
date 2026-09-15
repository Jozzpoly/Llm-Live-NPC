import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import type { SpcWorldRuntime } from "./spc-world-runtime";

const JANEK_ID = "resident.janek";
const CRATE_ID = "crate.workshop.01";
const MATTER_ID = "matter.janek.history-sensitive-crate";
const FIXTURE_ID = "player.history-fixture";
const FINAL_HIDDEN_X = 3_000;
const CRATE_Y = 720;

describe("epistemic history sensitivity", () => {
  it("lets different legally acquired histories drive different local behavior in the same current physical World", () => {
    const leftHistory = createHistoryVariant(1_500);
    const rightHistory = createHistoryVariant(2_300);

    // Current physical truth is intentionally the same. Only Janek's acquired
    // material history differs.
    expect(currentPhysicalProjection(leftHistory.world)).toEqual(currentPhysicalProjection(rightHistory.world));
    expect(leftHistory.kernel.matter(MATTER_ID)).toEqual(rightHistory.kernel.matter(MATTER_ID));

    expect(leftHistory.knowledge.lastKnownPosition(CRATE_ID)).toEqual({ x: 1_500, y: CRATE_Y });
    expect(rightHistory.knowledge.lastKnownPosition(CRATE_ID)).toEqual({ x: 2_300, y: CRATE_Y });

    const leftStep = leftHistory.executor.step();
    const rightStep = rightHistory.executor.step();
    expect(leftStep).toMatchObject({ status: "running", phase: "approach" });
    expect(rightStep).toMatchObject({ status: "running", phase: "approach" });

    leftHistory.world.step();
    rightHistory.world.step();

    const leftJanek = actor(leftHistory.world, JANEK_ID);
    const rightJanek = actor(rightHistory.world, JANEK_ID);

    // Same current World, same matter, same skill implementation — different
    // resident history alone is sufficient to produce a different embodied move.
    expect(leftJanek.position.x).toBeLessThan(rightJanek.position.x);
    expect(leftJanek.velocity.x).toBeLessThan(0);
    expect(rightJanek.velocity.x).toBeGreaterThan(0);

    // Hidden current truth remains identical; the behavioral divergence is caused
    // by private history rather than a physical difference at execution time.
    expect(freeCratePosition(leftHistory.world)).toEqual(freeCratePosition(rightHistory.world));
  });
});

function createHistoryVariant(observedCrateX: number) {
  const world = createFiveResidentRegionWorld();

  // Both variants keep Janek at the same observation origin. The fixture moves the
  // recognized crate to one of two visible but genuinely approach-distance positions.
  const dt = world.options.fixedDeltaSeconds;
  world.addPlayer(FIXTURE_ID, { x: 1_952, y: CRATE_Y }, { maxSpeed: 100_000 });

  mustSucceed(world.attemptMaterialAction(FIXTURE_ID, { kind: "pickup", objectId: CRATE_ID }));
  world.setActorMotionIntent(FIXTURE_ID, { x: (observedCrateX - 1_952) / dt, y: 0 });
  world.step();
  world.setActorMotionIntent(FIXTURE_ID, { x: 0, y: 0 });
  mustSucceed(world.attemptMaterialAction(FIXTURE_ID, {
    kind: "place",
    objectId: CRATE_ID,
    position: actor(world, FIXTURE_ID).position,
  }));

  const knowledge = new ResidentMaterialKnowledge(JANEK_ID, [CRATE_ID], world);
  knowledge.sample();
  expect(knowledge.lastKnownPosition(CRATE_ID)).toEqual({ x: observedCrateX, y: CRATE_Y });

  // Move the same crate to the same hidden final truth in both variants without
  // sampling during the move. This makes current physical state equal while the
  // resident histories remain legitimately different.
  mustSucceed(world.attemptMaterialAction(FIXTURE_ID, { kind: "pickup", objectId: CRATE_ID }));
  world.setActorMotionIntent(FIXTURE_ID, { x: (FINAL_HIDDEN_X - observedCrateX) / dt, y: 0 });
  world.step();
  world.setActorMotionIntent(FIXTURE_ID, { x: 0, y: 0 });
  mustSucceed(world.attemptMaterialAction(FIXTURE_ID, {
    kind: "place",
    objectId: CRATE_ID,
    position: actor(world, FIXTURE_ID).position,
  }));
  knowledge.sample();

  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:janek:history-sensitive-crate:origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Janek intends to recover the familiar crate from its last-known position.",
  });
  kernel.openMatter({
    id: MATTER_ID,
    originEvidenceId: origin.id,
    semanticCourse: "approach the familiar crate at its last-known position and pick it up",
  });
  kernel.bindRun({
    matterId: MATTER_ID,
    taskId: "task.janek.history-sensitive-pickup",
    runId: "run.janek.history-sensitive-pickup",
  });

  const authority = new ResidentWorldExecutionAuthority(JANEK_ID, kernel, world);
  const executor = new ResidentMaterialPickupExecutor(
    "run.janek.history-sensitive-pickup",
    CRATE_ID,
    knowledge,
    authority,
    world,
  );

  return { world, knowledge, kernel, executor };
}

function currentPhysicalProjection(world: SpcWorldRuntime) {
  return {
    tick: world.tick,
    actors: world.publicSnapshot().actors.map((entry) => ({
      id: entry.id,
      position: entry.position,
      velocity: entry.velocity,
    })),
    crate: world.materialObject(CRATE_ID),
  };
}

function actor(world: SpcWorldRuntime, actorId: string) {
  const found = world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!found) throw new Error(`actor missing: ${actorId}`);
  return found;
}

function freeCratePosition(world: SpcWorldRuntime) {
  const crate = world.materialObject(CRATE_ID);
  if (!crate || crate.location.kind !== "free") throw new Error("crate is not free");
  return crate.location.position;
}

function mustSucceed(result: { status: string; code?: string }) {
  if (result.status !== "succeeded") throw new Error(`fixture material action failed: ${result.code ?? result.status}`);
}
