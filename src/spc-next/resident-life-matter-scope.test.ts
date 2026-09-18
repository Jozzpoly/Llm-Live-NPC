import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";

describe("ResidentLifeMatterScope", () => {
  it("keeps nonterminal matters and only recent outcome-backed terminal matters in one resident-owned cognition scope", () => {
    const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 4 });
    const scope = new ResidentLifeMatterScope(kernel);

    open(kernel, "matter.active", "evidence.active", 1);
    open(kernel, "matter.done", "evidence.done", 2);
    open(kernel, "matter.cancelled", "evidence.cancelled", 3);

    kernel.bindRun({
      matterId: "matter.done",
      taskId: "task.done",
      runId: "run.done",
    });
    const outcome = kernel.reconcileRunOutcome({
      runId: "run.done",
      tick: 4,
      status: "succeeded",
      summary: "finished factual work",
    });
    expect(outcome.status).toBe("recorded");
    kernel.resolveMatter("matter.done");
    kernel.cancelMatter("matter.cancelled");

    scope.track("matter.active");
    scope.track("matter.done");
    scope.track("matter.cancelled");
    scope.track("matter.active");

    expect(scope.matterIds()).toEqual(["matter.active", "matter.done"]);

    // Churn only the bounded recent-evidence cache. Active continuity survives,
    // while terminal history naturally leaves higher cognition once its factual
    // outcome is no longer resident-recent evidence.
    for (let index = 0; index < 6; index += 1) {
      kernel.recordEvidence({
        id: `evidence.churn.${index}`,
        tick: 10 + index,
        kind: "churn",
        summary: `bounded churn ${index}`,
      });
    }

    expect(kernel.recentEvidenceSnapshot().some((entry) => (
      outcome.status === "recorded" && entry.id === outcome.evidence.id
    ))).toBe(false);
    expect(scope.matterIds()).toEqual(["matter.active"]);
  });

  it("rejects unknown matters instead of becoming a second source of continuity truth", () => {
    const kernel = new ResidentContinuityKernel();
    const scope = new ResidentLifeMatterScope(kernel);

    expect(() => scope.track("matter.unknown")).toThrow("unknown resident life matter");
    expect(scope.matterIds()).toEqual([]);
  });
});

function open(
  kernel: ResidentContinuityKernel,
  matterId: string,
  evidenceId: string,
  tick: number,
) {
  kernel.recordEvidence({
    id: evidenceId,
    tick,
    kind: "test_origin",
    summary: `${matterId} exists`,
  });
  kernel.openMatter({
    id: matterId,
    originEvidenceId: evidenceId,
    semanticCourse: `continue ${matterId}`,
  });
}
