import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";

function evidence(id: string, tick: number, summary = id) {
  return { id, tick, kind: "test", summary };
}

function openMatter(
  kernel: ResidentContinuityKernel,
  id: string,
  evidenceId: string,
  course = `handle ${id}`,
) {
  kernel.recordEvidence(evidence(evidenceId, 1));
  return kernel.openMatter({ id, originEvidenceId: evidenceId, semanticCourse: course });
}

describe("ResidentContinuityKernel recovery authority", () => {
  it("scopes semantic proposal authority to the exact matter revision instead of the whole resident", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    openMatter(kernel, "matter.b", "evidence.b");

    const proposalA = kernel.beginSemanticProposal("matter.a");

    kernel.recordEvidence(evidence("evidence.b.2", 2));
    kernel.advanceSemanticContext("matter.b", "evidence.b.2");

    expect(kernel.commitSemanticProposal(proposalA, { semanticCourse: "continue a" })).toMatchObject({
      status: "applied",
      matter: { id: "matter.a", semanticCourse: "continue a" },
    });

    const staleA = kernel.beginSemanticProposal("matter.a");
    kernel.recordEvidence(evidence("evidence.a.2", 3));
    kernel.advanceSemanticContext("matter.a", "evidence.a.2");

    expect(kernel.commitSemanticProposal(staleA, { semanticCourse: "stale decision" })).toEqual({
      status: "rejected",
      reason: "semantic_authority_stale",
    });
  });

  it("lets exactly one same-revision proposal win and makes its siblings stale", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");

    const first = kernel.beginSemanticProposal("matter.a");
    const sibling = kernel.beginSemanticProposal("matter.a");

    const applied = kernel.commitSemanticProposal(first, { semanticCourse: "first wins" });
    expect(applied).toMatchObject({
      status: "applied",
      matter: { semanticRevision: 2, semanticCourse: "first wins" },
    });
    expect(kernel.commitSemanticProposal(sibling, { semanticCourse: "late sibling" })).toEqual({
      status: "rejected",
      reason: "semantic_authority_stale",
    });
  });

  it("preserves the exact run across activity-only suspension and restores authority only after the interrupt is terminal", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.work", "evidence.work");
    openMatter(kernel, "matter.interrupt", "evidence.interrupt");
    const binding = kernel.bindRun({ matterId: "matter.work", taskId: "task.work", runId: "run.work" });

    expect(kernel.canRunMutateWorld(binding.runId)).toBe(true);
    kernel.suspendMatter("matter.work", "matter.interrupt");
    expect(kernel.canRunMutateWorld(binding.runId)).toBe(false);
    expect(kernel.resumeMatter("matter.work")).toBe(false);

    kernel.resolveMatter("matter.interrupt");
    expect(kernel.canResumeMatter("matter.work")).toBe(true);
    expect(kernel.resumeMatter("matter.work")).toBe(true);
    expect(kernel.runBinding(binding.runId)).toEqual(binding);
    expect(kernel.canRunMutateWorld(binding.runId)).toBe(true);
  });

  it("does not revive an old run after semantic meaning changes while the matter is suspended", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.work", "evidence.work");
    openMatter(kernel, "matter.interrupt", "evidence.interrupt");
    kernel.bindRun({ matterId: "matter.work", taskId: "task.work", runId: "run.work" });

    kernel.suspendMatter("matter.work", "matter.interrupt");
    kernel.recordEvidence(evidence("evidence.work.changed", 4));
    kernel.advanceSemanticContext("matter.work", "evidence.work.changed");

    const reconsideration = kernel.beginSemanticProposal("matter.work");
    expect(kernel.commitSemanticProposal(reconsideration, { semanticCourse: "do something else" })).toMatchObject({
      status: "applied",
      matter: { status: "suspended", semanticCourse: "do something else", semanticRevision: 3 },
    });

    kernel.resolveMatter("matter.interrupt");
    expect(kernel.resumeMatter("matter.work")).toBe(true);
    expect(kernel.canRunMutateWorld("run.work")).toBe(false);
    expect(kernel.runBinding("run.work")).toMatchObject({ semanticRevision: 1 });
  });

  it("makes terminal state monotonic and revokes execution authority before mechanical retirement", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.work", "evidence.work");
    kernel.bindRun({ matterId: "matter.work", taskId: "task.work", runId: "run.work" });

    expect(kernel.canRunMutateWorld("run.work")).toBe(true);
    expect(kernel.cancelMatter("matter.work")).toMatchObject({
      status: "cancelled",
      activeRunId: "run.work",
    });

    // The run is still mechanically registered, but semantic authority is already gone.
    expect(kernel.runBinding("run.work")).not.toBeNull();
    expect(kernel.canRunMutateWorld("run.work")).toBe(false);

    // A contradictory later terminalization cannot rewrite the first terminal cause.
    expect(kernel.resolveMatter("matter.work")).toMatchObject({ status: "cancelled" });

    expect(kernel.retireRun("run.work")).toMatchObject({
      matterId: "matter.work",
      taskId: "task.work",
      runId: "run.work",
    });
    expect(kernel.matter("matter.work")).toMatchObject({
      status: "cancelled",
      activeRunId: null,
    });
  });

  it("retains current semantic evidence for a live matter after recent-evidence churn and releases it at terminal state", () => {
    const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 2 });
    openMatter(kernel, "matter.work", "evidence.origin");

    kernel.recordEvidence(evidence("filler.1", 2));
    kernel.recordEvidence(evidence("filler.2", 3));
    kernel.recordEvidence(evidence("filler.3", 4));

    expect(kernel.recentEvidenceSnapshot().some((item) => item.id === "evidence.origin")).toBe(false);
    expect(kernel.semanticEvidence("matter.work")).toEqual(evidence("evidence.origin", 1));

    kernel.recordEvidence(evidence("evidence.revision", 5));
    kernel.advanceSemanticContext("matter.work", "evidence.revision");
    expect(kernel.semanticEvidence("matter.work")).toEqual(evidence("evidence.revision", 5));

    kernel.resolveMatter("matter.work");
    expect(kernel.semanticEvidence("matter.work")).toBeNull();
  });

  it("keeps run ownership exact and refuses partial replacement by duplicate matter or run identity", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    openMatter(kernel, "matter.b", "evidence.b");

    const original = kernel.bindRun({ matterId: "matter.a", taskId: "task.a", runId: "run.1" });

    expect(() => kernel.bindRun({ matterId: "matter.a", taskId: "task.a.2", runId: "run.2" }))
      .toThrow("matter already owns run");
    expect(() => kernel.bindRun({ matterId: "matter.b", taskId: "task.b", runId: "run.1" }))
      .toThrow("run already bound");

    expect(kernel.runBinding("run.1")).toEqual(original);
    expect(kernel.matter("matter.a")?.activeRunId).toBe("run.1");
    expect(kernel.matter("matter.b")?.activeRunId).toBeNull();
  });

  it("prevents suspension cycles and requires a real terminal interrupt before resume", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    openMatter(kernel, "matter.b", "evidence.b");
    openMatter(kernel, "matter.c", "evidence.c");

    kernel.suspendMatter("matter.a", "matter.b");
    kernel.suspendMatter("matter.b", "matter.c");
    expect(() => kernel.suspendMatter("matter.c", "matter.a")).toThrow("matter suspension cycle");
    expect(kernel.resumeMatter("matter.a")).toBe(false);

    kernel.cancelMatter("matter.b");
    expect(kernel.resumeMatter("matter.a")).toBe(true);
  });
});
