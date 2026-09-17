import { describe, expect, it } from "vitest";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const MATTER_A = "matter.mira.a";
const MATTER_B = "matter.mira.b";
const RUN_A = "run.mira.a";
const RUN_B = "run.mira.b";

describe("resident multi-matter body-focus characterization", () => {
  it("shows that two active matters can currently authorize competing runs and frame order decides the one body", () => {
    const ab = setupTwoActiveRuns();
    expect(ab.kernel.canRunMutateWorld(RUN_A)).toBe(true);
    expect(ab.kernel.canRunMutateWorld(RUN_B)).toBe(true);

    expect(ab.authority.apply({
      runId: RUN_A,
      effects: [{ kind: "motion", desiredVelocity: { x: 80, y: 0 } }],
    }).status).toBe("applied");
    expect(ab.authority.apply({
      runId: RUN_B,
      effects: [{ kind: "motion", desiredVelocity: { x: -80, y: 0 } }],
    }).status).toBe("applied");
    expect(ab.authority.motionOwner()).toBe(RUN_B);
    ab.world.step();

    const ba = setupTwoActiveRuns();
    expect(ba.authority.apply({
      runId: RUN_B,
      effects: [{ kind: "motion", desiredVelocity: { x: -80, y: 0 } }],
    }).status).toBe("applied");
    expect(ba.authority.apply({
      runId: RUN_A,
      effects: [{ kind: "motion", desiredVelocity: { x: 80, y: 0 } }],
    }).status).toBe("applied");
    expect(ba.authority.motionOwner()).toBe(RUN_A);
    ba.world.step();

    const abActor = miraActor(ab.world);
    const baActor = miraActor(ba.world);
    expect(abActor.velocity.x).toBeLessThan(0);
    expect(baActor.velocity.x).toBeGreaterThan(0);
    expect(ab.authority.lastMotionOutcome()).toMatchObject({ runId: RUN_B });
    expect(ba.authority.lastMotionOutcome()).toMatchObject({ runId: RUN_A });

    // Both Worlds have the same two active matters and exact run bindings. The
    // divergent body result comes only from frame order because no per-resident
    // body-focus policy exists above the continuity kernel yet.
    expect(ab.kernel.matter(MATTER_A)).toEqual(ba.kernel.matter(MATTER_A));
    expect(ab.kernel.matter(MATTER_B)).toEqual(ba.kernel.matter(MATTER_B));
    expect(ab.kernel.runBinding(RUN_A)).toEqual(ba.kernel.runBinding(RUN_A));
    expect(ab.kernel.runBinding(RUN_B)).toEqual(ba.kernel.runBinding(RUN_B));
  });
});

function setupTwoActiveRuns() {
  const world = createFiveResidentRegionWorld();
  const kernel = new ResidentContinuityKernel();
  kernel.recordEvidence({ id: "evidence.a", tick: world.tick, kind: "test", summary: "matter a" });
  kernel.recordEvidence({ id: "evidence.b", tick: world.tick, kind: "test", summary: "matter b" });
  kernel.openMatter({ id: MATTER_A, originEvidenceId: "evidence.a", semanticCourse: "continue a" });
  kernel.openMatter({ id: MATTER_B, originEvidenceId: "evidence.b", semanticCourse: "continue b" });
  kernel.bindRun({ matterId: MATTER_A, taskId: "task.a", runId: RUN_A });
  kernel.bindRun({ matterId: MATTER_B, taskId: "task.b", runId: RUN_B });
  const authority = new ResidentWorldExecutionAuthority(MIRA_ID, kernel, world);
  return { world, kernel, authority };
}

function miraActor(world: ReturnType<typeof createFiveResidentRegionWorld>) {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return actor;
}
