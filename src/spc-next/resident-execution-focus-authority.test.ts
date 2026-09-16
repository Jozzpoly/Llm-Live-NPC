import { describe, expect, it } from "vitest";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const MATTER_A = "matter.mira.a";
const MATTER_B = "matter.mira.b";
const RUN_A = "run.mira.a";
const RUN_B = "run.mira.b";

describe("ResidentExecutionFocusAuthority", () => {
  it("keeps parallel matters legal while only the focused exact run can drive the current coarse body frame", () => {
    const fixture = setupTwoActiveRuns();

    expect(fixture.kernel.canRunMutateWorld(RUN_A)).toBe(true);
    expect(fixture.kernel.canRunMutateWorld(RUN_B)).toBe(true);
    expect(fixture.focus.claim(RUN_A)).toEqual({ status: "acquired", runId: RUN_A });
    expect(fixture.focus.claim(RUN_B)).toEqual({
      status: "busy",
      runId: RUN_B,
      focusedRunId: RUN_A,
    });

    expect(fixture.authority.apply({
      runId: RUN_B,
      effects: [{ kind: "motion", desiredVelocity: { x: -80, y: 0 } }],
    })).toEqual({ status: "rejected", runId: RUN_B, reason: "run_not_authorized" });
    expect(fixture.authority.apply({
      runId: RUN_A,
      effects: [{ kind: "motion", desiredVelocity: { x: 80, y: 0 } }],
    }).status).toBe("applied");

    fixture.world.step();
    expect(miraActor(fixture.world).velocity.x).toBeGreaterThan(0);
    expect(fixture.authority.lastMotionOutcome()).toMatchObject({ runId: RUN_A });
    expect(fixture.kernel.matter(MATTER_B)).toMatchObject({ status: "active", activeRunId: RUN_B });
  });

  it("transfers body focus to an interrupt only after suspension revokes the old run, then returns to the same exact run on resume", () => {
    const fixture = setupTwoActiveRuns();
    expect(fixture.focus.claim(RUN_A)).toMatchObject({ status: "acquired" });
    expect(fixture.authority.apply({
      runId: RUN_A,
      effects: [{ kind: "motion", desiredVelocity: { x: 70, y: 0 } }],
    }).status).toBe("applied");
    fixture.world.step();
    const beforeInterruptX = miraActor(fixture.world).position.x;

    fixture.kernel.suspendMatter(MATTER_A, MATTER_B);
    expect(fixture.kernel.canRunMutateWorld(RUN_A)).toBe(false);
    expect(fixture.focus.claim(RUN_B)).toEqual({ status: "acquired", runId: RUN_B });
    expect(fixture.focus.focusedRun()).toBe(RUN_B);

    // The old latched motion belongs to a now-unfocused run. World must revoke it
    // before integration even if the interrupt has not emitted its own motion yet.
    fixture.world.step();
    expect(miraActor(fixture.world).position.x).toBeCloseTo(beforeInterruptX, 8);
    expect(fixture.authority.motionOwner()).toBeNull();

    expect(fixture.authority.apply({
      runId: RUN_B,
      effects: [{ kind: "motion", desiredVelocity: { x: -60, y: 0 } }],
    }).status).toBe("applied");
    fixture.world.step();
    expect(miraActor(fixture.world).velocity.x).toBeLessThan(0);

    fixture.kernel.resolveMatter(MATTER_B);
    expect(fixture.focus.sync()).toEqual({ status: "released_stale", runId: RUN_B });
    expect(fixture.kernel.canResumeMatter(MATTER_A)).toBe(true);
    expect(fixture.kernel.resumeMatter(MATTER_A)).toBe(true);

    const binding = fixture.kernel.runBinding(RUN_A);
    expect(binding).toMatchObject({ matterId: MATTER_A, runId: RUN_A, semanticRevision: 1 });
    expect(fixture.kernel.canRunMutateWorld(RUN_A)).toBe(true);
    expect(fixture.focus.claim(RUN_A)).toEqual({ status: "acquired", runId: RUN_A });
    expect(fixture.authority.apply({
      runId: RUN_A,
      effects: [{ kind: "motion", desiredVelocity: { x: 70, y: 0 } }],
    }).status).toBe("applied");
    fixture.world.step();
    expect(miraActor(fixture.world).velocity.x).toBeGreaterThan(0);
    expect(fixture.authority.lastMotionOutcome()).toMatchObject({ runId: RUN_A });
  });

  it("drops a focused run after semantic revision changes and allows another still-current matter to acquire the body", () => {
    const fixture = setupTwoActiveRuns();
    expect(fixture.focus.claim(RUN_A)).toMatchObject({ status: "acquired" });

    fixture.kernel.recordEvidence({
      id: "evidence.a.changed",
      tick: fixture.world.tick,
      kind: "test",
      summary: "matter a meaning changed",
    });
    fixture.kernel.advanceSemanticContext(MATTER_A, "evidence.a.changed");

    expect(fixture.kernel.canRunMutateWorld(RUN_A)).toBe(false);
    expect(fixture.focus.sync()).toEqual({ status: "released_stale", runId: RUN_A });
    expect(fixture.focus.claim(RUN_B)).toEqual({ status: "acquired", runId: RUN_B });
    expect(fixture.authority.apply({
      runId: RUN_A,
      effects: [{ kind: "motion", desiredVelocity: { x: 80, y: 0 } }],
    })).toEqual({ status: "rejected", runId: RUN_A, reason: "run_not_authorized" });
    expect(fixture.authority.apply({
      runId: RUN_B,
      effects: [{ kind: "motion", desiredVelocity: { x: -80, y: 0 } }],
    }).status).toBe("applied");
  });

  it("releases only the exact focused run", () => {
    const fixture = setupTwoActiveRuns();
    expect(fixture.focus.claim(RUN_A)).toMatchObject({ status: "acquired" });
    expect(fixture.focus.release(RUN_B)).toBe(false);
    expect(fixture.focus.focusedRun()).toBe(RUN_A);
    expect(fixture.focus.release(RUN_A)).toBe(true);
    expect(fixture.focus.focusedRun()).toBeNull();
    expect(fixture.focus.claim(RUN_B)).toEqual({ status: "acquired", runId: RUN_B });
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
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const authority = new ResidentWorldExecutionAuthority(MIRA_ID, focus, world);
  return { world, kernel, focus, authority };
}

function miraActor(world: ReturnType<typeof createFiveResidentRegionWorld>) {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return actor;
}
