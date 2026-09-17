import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";

describe("resident exact run identity lifetime", () => {
  it("does not let a later task reuse a run id after factual reconciliation", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    openMatter(kernel, "matter.b", "evidence.b");

    kernel.bindRun({ matterId: "matter.a", taskId: "task.a", runId: "run.shared" });
    expect(kernel.reconcileRunOutcome({
      runId: "run.shared",
      tick: 1,
      status: "succeeded",
      summary: "the first exact run completed",
    }).status).toBe("recorded");

    expect(() => kernel.bindRun({
      matterId: "matter.b",
      taskId: "task.b",
      runId: "run.shared",
    })).toThrow("run identity already used");
  });

  it("does not let a later task reuse a run id after neutral retirement", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    openMatter(kernel, "matter.b", "evidence.b");

    kernel.bindRun({ matterId: "matter.a", taskId: "task.a", runId: "run.shared" });
    expect(kernel.retireRun("run.shared")).not.toBeNull();

    expect(() => kernel.bindRun({
      matterId: "matter.b",
      taskId: "task.b",
      runId: "run.shared",
    })).toThrow("run identity already used");
  });
});

function openMatter(kernel: ResidentContinuityKernel, matterId: string, evidenceId: string) {
  kernel.recordEvidence({
    id: evidenceId,
    tick: 0,
    kind: "test",
    summary: matterId,
  });
  kernel.openMatter({ matterId, id: matterId, originEvidenceId: evidenceId, semanticCourse: `continue ${matterId}` } as never);
}
