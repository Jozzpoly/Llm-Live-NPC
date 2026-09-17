import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";

const MATTER_A = "matter.mira.a";
const MATTER_B = "matter.mira.b";
const MATTER_C = "matter.mira.c";
const RUN_A = "run.mira.a";
const RUN_B = "run.mira.b";
const RUN_C = "run.mira.c";

describe("ResidentExecutionArbitrator", () => {
  it("preserves one busy run and acquires it when the prior body owner finishes", () => {
    const fixture = setupRuns([RUN_A, RUN_B]);

    expect(fixture.arbitrator.request(RUN_A)).toEqual({ status: "acquired", runId: RUN_A });
    expect(fixture.arbitrator.request(RUN_B)).toEqual({
      status: "busy",
      runId: RUN_B,
      focusedRunId: RUN_A,
    });
    expect(fixture.arbitrator.deferredRunIds()).toEqual([RUN_B]);

    finishRun(fixture.kernel, MATTER_A, RUN_A, 1);

    expect(fixture.arbitrator.reconcile()).toEqual({
      status: "acquired_deferred",
      runId: RUN_B,
    });
    expect(fixture.focus.focusedRun()).toBe(RUN_B);
    expect(fixture.arbitrator.deferredRunIds()).toEqual([]);
    expect(fixture.arbitrator.canRunMutateWorld(RUN_B)).toBe(true);
  });

  it("does not invent FIFO priority when several still-current busy runs compete for the freed body", () => {
    const fixture = setupRuns([RUN_A, RUN_B, RUN_C]);

    expect(fixture.arbitrator.request(RUN_A).status).toBe("acquired");
    expect(fixture.arbitrator.request(RUN_C).status).toBe("busy");
    expect(fixture.arbitrator.request(RUN_B).status).toBe("busy");

    finishRun(fixture.kernel, MATTER_A, RUN_A, 1);

    expect(fixture.arbitrator.reconcile()).toEqual({
      status: "choice_required",
      candidateRunIds: [RUN_B, RUN_C],
    });
    expect(fixture.focus.focusedRun()).toBeNull();

    expect(fixture.arbitrator.choose(RUN_C)).toEqual({ status: "acquired", runId: RUN_C });
    expect(fixture.focus.focusedRun()).toBe(RUN_C);
    expect(fixture.arbitrator.deferredRunIds()).toEqual([RUN_B]);
  });

  it("drops deferred demand that loses semantic run authority before the body becomes free", () => {
    const fixture = setupRuns([RUN_A, RUN_B]);

    expect(fixture.arbitrator.request(RUN_A).status).toBe("acquired");
    expect(fixture.arbitrator.request(RUN_B).status).toBe("busy");

    fixture.kernel.recordEvidence({
      id: "evidence.b.changed",
      tick: 1,
      kind: "test",
      summary: "matter b meaning changed while waiting for the body",
    });
    fixture.kernel.advanceSemanticContext(MATTER_B, "evidence.b.changed");

    expect(fixture.kernel.canRunMutateWorld(RUN_B)).toBe(false);
    expect(fixture.arbitrator.deferredRunIds()).toEqual([]);

    finishRun(fixture.kernel, MATTER_A, RUN_A, 2);
    expect(fixture.arbitrator.reconcile()).toEqual({ status: "idle" });
    expect(fixture.focus.focusedRun()).toBeNull();
  });

  it("keeps deferred demand visible while another run remains focused", () => {
    const fixture = setupRuns([RUN_A, RUN_B]);

    expect(fixture.arbitrator.request(RUN_A).status).toBe("acquired");
    expect(fixture.arbitrator.request(RUN_B).status).toBe("busy");

    expect(fixture.arbitrator.reconcile()).toEqual({
      status: "focused",
      runId: RUN_A,
      deferredRunIds: [RUN_B],
    });
    expect(fixture.focus.focusedRun()).toBe(RUN_A);
    expect(fixture.kernel.canRunMutateWorld(RUN_B)).toBe(true);
  });
});

function setupRuns(runIds: readonly string[]) {
  const kernel = new ResidentContinuityKernel();
  const definitions = [
    { matterId: MATTER_A, runId: RUN_A, evidenceId: "evidence.a" },
    { matterId: MATTER_B, runId: RUN_B, evidenceId: "evidence.b" },
    { matterId: MATTER_C, runId: RUN_C, evidenceId: "evidence.c" },
  ].filter((entry) => runIds.includes(entry.runId));

  for (const entry of definitions) {
    kernel.recordEvidence({
      id: entry.evidenceId,
      tick: 0,
      kind: "test",
      summary: entry.matterId,
    });
    kernel.openMatter({
      id: entry.matterId,
      originEvidenceId: entry.evidenceId,
      semanticCourse: `continue ${entry.matterId}`,
    });
    kernel.bindRun({
      matterId: entry.matterId,
      taskId: `task:${entry.matterId}`,
      runId: entry.runId,
    });
  }

  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  return { kernel, focus, arbitrator };
}

function finishRun(
  kernel: ResidentContinuityKernel,
  matterId: string,
  runId: string,
  tick: number,
) {
  expect(kernel.reconcileRunOutcome({
    runId,
    tick,
    status: "succeeded",
    summary: `${runId} completed its body work`,
  }).status).toBe("recorded");
  kernel.resolveMatter(matterId);
}
