import { describe, expect, it } from "vitest";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const MIRA_ID = "resident.mira";
const MATTER_A = "matter.mira.first-body-demand";
const MATTER_B = "matter.mira.deferred-body-demand";
const RUN_A = "run.mira.first-body-demand.travel";
const RUN_B = "run.mira.deferred-body-demand.travel";
const DESTINATION_A = { x: 1_000, y: 650 } as const;
const DESTINATION_B = { x: 800, y: 900 } as const;
const MAX_STEPS = 420;

describe("resident execution arbitration on factual Mira body", () => {
  it("hands the freed coarse body from completed run A to the one still-current deferred run B", () => {
    const world = createFiveResidentRegionWorld();
    const kernel = new ResidentContinuityKernel();
    openRun(kernel, MATTER_A, RUN_A, world.tick);
    openRun(kernel, MATTER_B, RUN_B, world.tick);

    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);

    expect(arbitrator.request(RUN_A)).toEqual({ status: "acquired", runId: RUN_A });
    expect(arbitrator.request(RUN_B)).toEqual({
      status: "busy",
      runId: RUN_B,
      focusedRunId: RUN_A,
    });
    expect(arbitrator.deferredRunIds()).toEqual([RUN_B]);

    const authority = new ResidentWorldExecutionAuthority(MIRA_ID, arbitrator, world);
    const executorA = new ResidentGroundedTravelExecutor(RUN_A, DESTINATION_A, authority, world);
    const beforeA = miraPosition(world);
    const terminalA = driveToTerminal(executorA, world);

    expect(terminalA).toMatchObject({ status: "arrived", runId: RUN_A });
    const afterA = miraPosition(world);
    expect(afterA).not.toEqual(beforeA);
    expect(distance(afterA, DESTINATION_A)).toBeLessThanOrEqual(18);
    expect(authority.motionOwner()).toBe(RUN_A);

    expect(kernel.reconcileRunOutcome({
      runId: RUN_A,
      tick: world.tick,
      status: "succeeded",
      summary: "Mira physically completed the first body demand.",
    }).status).toBe("recorded");
    kernel.resolveMatter(MATTER_A);

    expect(kernel.canRunMutateWorld(RUN_B)).toBe(true);
    expect(arbitrator.reconcile()).toEqual({ status: "acquired_deferred", runId: RUN_B });
    expect(focus.focusedRun()).toBe(RUN_B);
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: RUN_A });
    expect(authority.motionOwner()).toBeNull();

    const executorB = new ResidentGroundedTravelExecutor(RUN_B, DESTINATION_B, authority, world);
    const beforeB = miraPosition(world);
    const firstB = executorB.step();
    expect(firstB).toMatchObject({ status: "running", runId: RUN_B });
    expect(authority.motionOwner()).toBe(RUN_B);
    world.step();
    expect(miraPosition(world)).not.toEqual(beforeB);

    const terminalB = driveToTerminal(executorB, world);
    expect(terminalB).toMatchObject({ status: "arrived", runId: RUN_B });
    const afterB = miraPosition(world);
    expect(distance(afterB, DESTINATION_B)).toBeLessThanOrEqual(18);
    expect(distance(afterB, DESTINATION_A)).toBeGreaterThan(100);

    expect(kernel.reconcileRunOutcome({
      runId: RUN_B,
      tick: world.tick,
      status: "succeeded",
      summary: "Mira physically completed the deferred body demand after factual handoff.",
    }).status).toBe("recorded");
    kernel.resolveMatter(MATTER_B);
    expect(arbitrator.reconcile()).toEqual({ status: "idle" });
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: RUN_B });
    expect(authority.motionOwner()).toBeNull();
  });
});

function openRun(
  kernel: ResidentContinuityKernel,
  matterId: string,
  runId: string,
  tick: number,
) {
  const evidenceId = `evidence:${matterId}`;
  kernel.recordEvidence({
    id: evidenceId,
    tick,
    kind: "bounded_integration_pressure",
    summary: `${matterId} is a separately grounded continuing demand on Mira's body.`,
  });
  kernel.openMatter({
    id: matterId,
    originEvidenceId: evidenceId,
    semanticCourse: `continue ${matterId}`,
  });
  kernel.bindRun({ matterId, taskId: `task:${matterId}`, runId });
}

function driveToTerminal(
  executor: ResidentGroundedTravelExecutor,
  world: ReturnType<typeof createFiveResidentRegionWorld>,
) {
  let step = executor.step();
  let guard = 0;
  while (step.status === "running" && guard < MAX_STEPS) {
    world.step();
    step = executor.step();
    guard += 1;
  }
  expect(guard).toBeLessThan(MAX_STEPS);
  return step;
}

function miraPosition(world: ReturnType<typeof createFiveResidentRegionWorld>) {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return { ...actor.position };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
