import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";

function evidence(id: string, tick: number) {
  return { id, tick, kind: "test", summary: id };
}

describe("ResidentContinuityKernel live matter evidence", () => {
  it("keeps origin, current semantic dependency and latest factual outcome reconstructable through recent-evidence churn", () => {
    const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 1 });
    const origin = kernel.recordEvidence(evidence("evidence.origin", 1));
    kernel.openMatter({
      id: "matter.work",
      originEvidenceId: origin.id,
      semanticCourse: "inspect workshop station",
    });

    const revision = kernel.recordEvidence(evidence("evidence.revision", 2));
    kernel.advanceSemanticContext("matter.work", revision.id);
    kernel.bindRun({ matterId: "matter.work", taskId: "task.inspect", runId: "run.inspect" });

    const reconciled = kernel.reconcileRunOutcome({
      runId: "run.inspect",
      tick: 3,
      status: "succeeded",
      summary: "physical inspection completed",
    });
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;

    kernel.recordEvidence(evidence("filler.4", 4));
    kernel.recordEvidence(evidence("filler.5", 5));

    expect(kernel.recentEvidenceSnapshot()).toEqual([evidence("filler.5", 5)]);
    expect(kernel.originEvidence("matter.work")).toEqual(origin);
    expect(kernel.semanticEvidence("matter.work")).toEqual(revision);
    expect(kernel.lastOutcomeEvidence("matter.work")).toEqual(reconciled.evidence);
  });

  it("can explicitly promote a still-live pinned factual outcome into the next semantic dependency after it left recent memory", () => {
    const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 1 });
    const origin = kernel.recordEvidence(evidence("evidence.origin", 1));
    kernel.openMatter({
      id: "matter.work",
      originEvidenceId: origin.id,
      semanticCourse: "inspect workshop station",
    });
    kernel.bindRun({ matterId: "matter.work", taskId: "task.inspect", runId: "run.inspect" });

    const reconciled = kernel.reconcileRunOutcome({
      runId: "run.inspect",
      tick: 2,
      status: "blocked",
      summary: "station could not be reached",
    });
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;

    kernel.recordEvidence(evidence("filler.3", 3));
    expect(kernel.recentEvidenceSnapshot().some((item) => item.id === reconciled.evidence.id)).toBe(false);

    const advanced = kernel.advanceSemanticContext("matter.work", reconciled.evidence.id);
    expect(advanced.semanticEvidenceId).toBe(reconciled.evidence.id);
    expect(kernel.semanticEvidence("matter.work")).toEqual(reconciled.evidence);
  });

  it("replaces the previous latest-outcome pin instead of retaining an outcome archive", () => {
    const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 1 });
    const origin = kernel.recordEvidence(evidence("evidence.origin", 1));
    kernel.openMatter({ id: "matter.work", originEvidenceId: origin.id, semanticCourse: "continue work" });

    kernel.bindRun({ matterId: "matter.work", taskId: "task.1", runId: "run.1" });
    const first = kernel.reconcileRunOutcome({
      runId: "run.1",
      tick: 2,
      status: "blocked",
      summary: "first attempt blocked",
    });
    expect(first.status).toBe("recorded");
    if (first.status !== "recorded") return;

    kernel.bindRun({ matterId: "matter.work", taskId: "task.2", runId: "run.2" });
    const second = kernel.reconcileRunOutcome({
      runId: "run.2",
      tick: 3,
      status: "succeeded",
      summary: "second attempt succeeded",
    });
    expect(second.status).toBe("recorded");
    if (second.status !== "recorded") return;

    kernel.recordEvidence(evidence("filler.4", 4));
    expect(kernel.lastOutcomeEvidence("matter.work")).toEqual(second.evidence);
    expect(() => kernel.advanceSemanticContext("matter.work", first.evidence.id)).toThrow("unknown evidence");
  });

  it("releases all live evidence pins when a matter terminalizes instead of silently becoming a historical archive", () => {
    const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 1 });
    const origin = kernel.recordEvidence(evidence("evidence.origin", 1));
    kernel.openMatter({ id: "matter.work", originEvidenceId: origin.id, semanticCourse: "work" });
    const revision = kernel.recordEvidence(evidence("evidence.revision", 2));
    kernel.advanceSemanticContext("matter.work", revision.id);
    kernel.bindRun({ matterId: "matter.work", taskId: "task.work", runId: "run.work" });
    const outcome = kernel.reconcileRunOutcome({
      runId: "run.work",
      tick: 3,
      status: "succeeded",
      summary: "work step complete",
    });
    expect(outcome.status).toBe("recorded");

    kernel.resolveMatter("matter.work");
    kernel.recordEvidence(evidence("filler.4", 4));

    expect(kernel.originEvidence("matter.work")).toBeNull();
    expect(kernel.semanticEvidence("matter.work")).toBeNull();
    expect(kernel.lastOutcomeEvidence("matter.work")).toBeNull();
  });

  it("does not create a new live outcome pin when a factual run result is reconciled after semantic terminalization", () => {
    const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 1 });
    const origin = kernel.recordEvidence(evidence("evidence.origin", 1));
    kernel.openMatter({ id: "matter.work", originEvidenceId: origin.id, semanticCourse: "work" });
    kernel.bindRun({ matterId: "matter.work", taskId: "task.work", runId: "run.work" });

    kernel.cancelMatter("matter.work");
    const outcome = kernel.reconcileRunOutcome({
      runId: "run.work",
      tick: 2,
      status: "succeeded",
      summary: "already factual before retirement was observed",
    });
    expect(outcome.status).toBe("recorded");
    expect(kernel.lastOutcomeEvidence("matter.work")).toBeNull();

    kernel.recordEvidence(evidence("filler.3", 3));
    expect(kernel.recentEvidenceSnapshot().some((item) => item.id.startsWith("task-outcome:"))).toBe(false);
  });
});
