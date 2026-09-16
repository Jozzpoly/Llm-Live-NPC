import { describe, expect, it } from "vitest";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const MATTER_ID = "matter.mira.autonomous-continuation";
const RUN_ID = "run.mira.autonomous-continuation.travel";
const DESTINATION = { x: 1_050, y: 760 } as const;

describe("resident grounded travel executor", () => {
  it("moves only under exact run authority and exposes factual arrival for later reconciliation", () => {
    const { world, kernel, authority } = setup();
    const before = actorPosition(world);
    const executor = new ResidentGroundedTravelExecutor(RUN_ID, DESTINATION, authority, world);

    let step = executor.step();
    let guard = 0;
    while (step.status === "running" && guard < 360) {
      expect(authority.motionOwner()).toBe(RUN_ID);
      world.step();
      step = executor.step();
      guard += 1;
    }

    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(360);
    expect(step).toMatchObject({ status: "arrived", runId: RUN_ID, destination: DESTINATION });
    const after = actorPosition(world);
    expect(after).not.toEqual(before);
    expect(Math.hypot(after.x - DESTINATION.x, after.y - DESTINATION.y)).toBeLessThanOrEqual(18);

    const reconciliation = kernel.reconcileRunOutcome({
      runId: RUN_ID,
      tick: world.tick,
      status: "succeeded",
      summary: "Mira physically arrived at the already-grounded continuation destination.",
    });
    expect(reconciliation).toMatchObject({ status: "recorded" });
    expect(kernel.resolveMatter(MATTER_ID)).toMatchObject({ status: "resolved" });
    expect(kernel.canRunMutateWorld(RUN_ID)).toBe(false);
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: RUN_ID });
  });

  it("loses body authority immediately when the matter's semantic revision changes", () => {
    const { world, kernel, authority } = setup();
    const executor = new ResidentGroundedTravelExecutor(RUN_ID, DESTINATION, authority, world);

    expect(executor.step().status).toBe("running");
    world.step();
    const beforeRevision = actorPosition(world);

    kernel.recordEvidence({
      id: "evidence:mira:continuation-changed",
      tick: world.tick,
      kind: "direct_world_change",
      summary: "New evidence requires reconsidering the continuation before further movement.",
    });
    kernel.advanceSemanticContext(MATTER_ID, "evidence:mira:continuation-changed");

    expect(kernel.canRunMutateWorld(RUN_ID)).toBe(false);
    expect(executor.step()).toEqual({ status: "authority_lost", runId: RUN_ID });
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: RUN_ID });
    world.step();
    expect(actorPosition(world)).toEqual(beforeRevision);
  });
});

function setup() {
  const world = createFiveResidentRegionWorld();
  const kernel = new ResidentContinuityKernel();
  kernel.recordEvidence({
    id: "evidence:mira:continuation-origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Mira has a grounded reason to continue toward a known settlement position.",
  });
  kernel.openMatter({
    id: MATTER_ID,
    originEvidenceId: "evidence:mira:continuation-origin",
    semanticCourse: "continue to the grounded settlement destination",
  });
  kernel.bindRun({
    matterId: MATTER_ID,
    taskId: "task.mira.autonomous-continuation.travel",
    runId: RUN_ID,
  });
  const authority = new ResidentWorldExecutionAuthority(MIRA_ID, kernel, world);
  return { world, kernel, authority };
}

function actorPosition(world: ReturnType<typeof createFiveResidentRegionWorld>) {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return { ...actor.position };
}
