import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";

const MATTER_A = "matter.mira.a";
const MATTER_B = "matter.mira.b";
const RUN_A = "run.mira.a";
const RUN_B = "run.mira.b";

describe("resident execution busy-orphan characterization", () => {
  it("keeps the busy run semantically legal but leaves it unfocused after the prior body owner finishes", () => {
    const kernel = new ResidentContinuityKernel();
    kernel.recordEvidence({ id: "evidence.a", tick: 0, kind: "test", summary: "matter a" });
    kernel.recordEvidence({ id: "evidence.b", tick: 0, kind: "test", summary: "matter b" });
    kernel.openMatter({ id: MATTER_A, originEvidenceId: "evidence.a", semanticCourse: "continue a" });
    kernel.openMatter({ id: MATTER_B, originEvidenceId: "evidence.b", semanticCourse: "continue b" });
    kernel.bindRun({ matterId: MATTER_A, taskId: "task.a", runId: RUN_A });
    kernel.bindRun({ matterId: MATTER_B, taskId: "task.b", runId: RUN_B });

    const focus = new ResidentExecutionFocusAuthority(kernel);
    expect(focus.claim(RUN_A)).toEqual({ status: "acquired", runId: RUN_A });
    expect(focus.claim(RUN_B)).toEqual({
      status: "busy",
      runId: RUN_B,
      focusedRunId: RUN_A,
    });

    const reconciledA = kernel.reconcileRunOutcome({
      runId: RUN_A,
      tick: 1,
      status: "succeeded",
      summary: "matter a body work completed",
    });
    expect(reconciledA.status).toBe("recorded");
    kernel.resolveMatter(MATTER_A);

    expect(focus.sync()).toEqual({ status: "released_stale", runId: RUN_A });
    expect(kernel.canRunMutateWorld(RUN_B)).toBe(true);
    expect(kernel.matter(MATTER_B)).toMatchObject({
      status: "active",
      activeRunId: RUN_B,
    });

    // Material gap: the focus layer correctly stops guessing policy, but nothing
    // resident-level remembers/reconsiders that the still-current RUN_B needs the
    // now-free coarse body resource. It remains legal yet unfocused indefinitely
    // until some external caller happens to claim it again.
    expect(focus.focusedRun()).toBeNull();
    expect(focus.sync()).toEqual({ status: "unchanged", focusedRunId: null });
    expect(focus.focusedRun()).toBeNull();

    // Manual recovery is possible; continuity of that recovery is what is missing.
    expect(focus.claim(RUN_B)).toEqual({ status: "acquired", runId: RUN_B });
  });
});
