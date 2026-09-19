import { describe, expect, it } from "vitest";
import { deriveSpcIdentifier } from "./identity-contract";
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

  it("joins a factual task outcome back to the exact matter without pretending that semantic meaning is resolved", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.work", "evidence.work", "inspect the workshop station");
    const binding = kernel.bindRun({ matterId: "matter.work", taskId: "task.inspect", runId: "run.inspect" });

    const result = kernel.reconcileRunOutcome({
      runId: binding.runId,
      tick: 20,
      status: "succeeded",
      summary: "station inspection completed physically",
    });

    const outcomeEvidenceId = deriveSpcIdentifier("task-outcome", binding.runId, "20");
    expect(result).toMatchObject({
      status: "recorded",
      binding,
      evidence: {
        id: outcomeEvidenceId,
        kind: "task_outcome",
        summary: "succeeded: station inspection completed physically",
        sourceRunId: "run.inspect",
      },
      matter: {
        id: "matter.work",
        status: "active",
        semanticCourse: "inspect the workshop station",
        activeRunId: null,
        lastOutcomeEvidenceId: outcomeEvidenceId,
      },
    });
    expect(kernel.runBinding(binding.runId)).toBeNull();
    expect(kernel.matter("matter.work")?.status).toBe("active");
  });

  it("records one factual outcome exactly once and does not manufacture outcomes during neutral retirement", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    kernel.bindRun({ matterId: "matter.a", taskId: "task.a", runId: "run.a" });

    expect(kernel.reconcileRunOutcome({
      runId: "run.a",
      tick: 10,
      status: "blocked",
      summary: "authoritative World action was blocked",
    }).status).toBe("recorded");

    expect(kernel.reconcileRunOutcome({
      runId: "run.a",
      tick: 11,
      status: "succeeded",
      summary: "duplicate late claim",
    })).toEqual({ status: "rejected", reason: "run_missing" });

    openMatter(kernel, "matter.b", "evidence.b");
    kernel.bindRun({ matterId: "matter.b", taskId: "task.b", runId: "run.b" });
    kernel.cancelMatter("matter.b");
    kernel.retireRun("run.b");

    expect(kernel.matter("matter.b")).toMatchObject({
      status: "cancelled",
      activeRunId: null,
      lastOutcomeEvidenceId: null,
    });
    expect(kernel.recentEvidenceSnapshot().filter((item) => item.id.includes("run.b"))).toEqual([]);
  });

  it("keeps pending cognition authority explicit and scoped while unrelated matter changes happen", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    openMatter(kernel, "matter.b", "evidence.b");
    const a = kernel.beginSemanticProposal("matter.a");
    const b = kernel.beginSemanticProposal("matter.b");

    kernel.recordEvidence(evidence("evidence.b.new", 5));
    kernel.advanceSemanticContext("matter.b", "evidence.b.new");

    expect(kernel.pendingSemanticProposals()).toEqual([a]);
    expect(kernel.recentSemanticProposalRevocations()).toContainEqual(
      expect.objectContaining({
        ticket: b,
        reason: "semantic_dependency_changed",
        currentSemanticRevision: 2,
      }),
    );
    expect(kernel.commitSemanticProposal(a, { semanticCourse: "a remains current" })).toMatchObject({
      status: "applied",
    });
  });

  it("does not revoke a same-revision semantic clarification merely because its matter is suspended", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    openMatter(kernel, "matter.interrupt", "evidence.interrupt");
    const pending = kernel.beginSemanticProposal("matter.a");

    kernel.suspendMatter("matter.a", "matter.interrupt");
    expect(kernel.pendingSemanticProposals()).toEqual([pending]);
    expect(kernel.commitSemanticProposal(pending, { semanticCourse: "clarified while waiting" })).toMatchObject({
      status: "applied",
      matter: { status: "suspended", semanticCourse: "clarified while waiting" },
    });
  });

  it("revokes all same-matter siblings after one proposal wins while preserving the exact stale cause", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    const winner = kernel.beginSemanticProposal("matter.a");
    const sibling = kernel.beginSemanticProposal("matter.a");

    expect(kernel.commitSemanticProposal(winner, { semanticCourse: "winner" })).toMatchObject({ status: "applied" });
    expect(kernel.pendingSemanticProposals()).toEqual([]);
    expect(kernel.recentSemanticProposalRevocations()).toContainEqual(
      expect.objectContaining({ ticket: sibling, reason: "sibling_committed" }),
    );
    expect(kernel.commitSemanticProposal(sibling, { semanticCourse: "too late" })).toEqual({
      status: "rejected",
      reason: "semantic_authority_stale",
    });
  });

  it("terminalizes proposal authority for only the owning matter and preserves unrelated pending cognition", () => {
    const kernel = new ResidentContinuityKernel();
    openMatter(kernel, "matter.a", "evidence.a");
    openMatter(kernel, "matter.b", "evidence.b");
    const a = kernel.beginSemanticProposal("matter.a");
    const b = kernel.beginSemanticProposal("matter.b");

    kernel.cancelMatter("matter.a");

    expect(kernel.pendingSemanticProposals()).toEqual([b]);
    expect(kernel.recentSemanticProposalRevocations()).toContainEqual(
      expect.objectContaining({ ticket: a, reason: "matter_terminal", matterStatus: "cancelled" }),
    );
    expect(kernel.commitSemanticProposal(a, { semanticCourse: "resurrect" })).toEqual({
      status: "rejected",
      reason: "matter_terminal",
    });
    expect(kernel.commitSemanticProposal(b, { semanticCourse: "still alive" })).toMatchObject({ status: "applied" });
  });

  it("abandons one exact provider attempt without changing matter meaning or disturbing a sibling", () => {
    const kernel = new ResidentContinuityKernel();
    const matter = openMatter(kernel, "matter.a", "evidence.a");
    const abandoned = kernel.beginSemanticProposal("matter.a");
    const sibling = kernel.beginSemanticProposal("matter.a");

    expect(kernel.abandonSemanticProposal(abandoned)).toEqual({ status: "abandoned", ticket: abandoned });
    expect(kernel.matter("matter.a")).toEqual(matter);
    expect(kernel.pendingSemanticProposals()).toEqual([sibling]);
    expect(kernel.recentSemanticProposalRevocations()).toContainEqual(
      expect.objectContaining({ ticket: abandoned, reason: "abandoned" }),
    );
    expect(kernel.abandonSemanticProposal(abandoned)).toEqual({
      status: "rejected",
      reason: "proposal_not_pending",
    });

    expect(kernel.commitSemanticProposal(sibling, { semanticCourse: "sibling survives" })).toMatchObject({
      status: "applied",
    });
  });

  it("keeps proposal revocation history bounded without pretending to remember an evicted stale cause", () => {
    const kernel = new ResidentContinuityKernel({ revocationLimit: 2 });
    const tickets = [];
    for (let index = 0; index < 3; index += 1) {
      openMatter(kernel, `matter.${index}`, `evidence.${index}`);
      const ticket = kernel.beginSemanticProposal(`matter.${index}`);
      tickets.push(ticket);
      kernel.cancelMatter(`matter.${index}`);
    }

    expect(kernel.pendingSemanticProposals()).toEqual([]);
    expect(kernel.recentSemanticProposalRevocations().map((entry) => entry.ticket.attemptId)).toEqual([
      tickets[1]!.attemptId,
      tickets[2]!.attemptId,
    ]);
    expect(kernel.commitSemanticProposal(tickets[0]!, { semanticCourse: "too late" })).toEqual({
      status: "rejected",
      reason: "semantic_authority_stale",
    });
  });
});
