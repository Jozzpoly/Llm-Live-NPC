import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import { P2E5SemanticProviderAuthorityMembrane } from "./p2-e5-semantic-provider-authority-membrane";

function openMatter(resident: P2E0ResidentCausalKernel, id = "matter.mug") {
  const origin = resident.recordEvidence({
    kind: "heard",
    source: {
      kind: "actor",
      actorId: "player.jozz",
      occurrenceId: "speech.1"
    },
    summary: "player.jozz said: Bring me the red mug."
  });
  const matter = resident.openMatter({
    id,
    originEvidenceId: origin.id,
    semanticCourse: "interpret the grounded request"
  });
  return { origin, matter };
}

describe("post-P2-E17 causal observability characterization", () => {
  it("does not retain the winning semantic proposal identity after a successful commit", () => {
    const resident = new P2E0ResidentCausalKernel();
    const contextBoundary = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const { matter } = openMatter(resident);

    const ticket = resident.beginSemanticProposal(matter.id);
    const built = contextBoundary.build(resident, ticket);
    expect(built.status).toBe("ready");
    if (built.status !== "ready") return;
    const run = provider.prepare(built.context).run;

    const settled = provider.settle(resident, run, { semanticCourse: "fetch Red mug" });
    expect(settled).toMatchObject({
      status: "applied",
      matter: {
        id: matter.id,
        semanticCourse: "fetch Red mug",
        semanticRevision: matter.semanticRevision + 1
      }
    });

    // Active authority is correctly gone, but successful proposal provenance is
    // not retained by either of the resident's proposal readouts. The bounded
    // revocation ledger records only stale/dead authority, not applied authority.
    expect(resident.pendingSemanticProposals()).toEqual([]);
    expect(resident.recentSemanticProposalRevocations()).toEqual([]);

    const proposalIdsStillObservable = [
      ...resident.pendingSemanticProposals().map((proposal) => proposal.proposalId),
      ...resident.recentSemanticProposalRevocations().map((record) => record.proposal.proposalId)
    ];
    expect(proposalIdsStillObservable).not.toContain(ticket.proposalId);

    // The semantic result and dependency remain visible, so semantic correctness
    // is not lost; the missing piece is the explicit "which proposal won" join.
    expect(resident.matter(matter.id)).toMatchObject({
      semanticCourse: "fetch Red mug",
      semanticRevision: ticket.semanticRevision + 1,
      latestSemanticEvidenceId: ticket.semanticEvidenceId
    });
  });

  it("retains losing sibling revocation provenance while the same-revision winning proposal identity disappears", () => {
    const resident = new P2E0ResidentCausalKernel();
    const contextBoundary = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const { matter } = openMatter(resident, "matter.race");

    const winnerTicket = resident.beginSemanticProposal(matter.id);
    const loserTicket = resident.beginSemanticProposal(matter.id);
    const winnerContext = contextBoundary.build(resident, winnerTicket);
    const loserContext = contextBoundary.build(resident, loserTicket);
    expect(winnerContext.status).toBe("ready");
    expect(loserContext.status).toBe("ready");
    if (winnerContext.status !== "ready" || loserContext.status !== "ready") return;

    const winnerRun = provider.prepare(winnerContext.context).run;
    const loserRun = provider.prepare(loserContext.context).run;
    expect(
      provider.settle(resident, winnerRun, { semanticCourse: "fetch Red mug" })
    ).toMatchObject({ status: "applied" });

    const revocations = resident.recentSemanticProposalRevocations();
    expect(revocations).toEqual([
      expect.objectContaining({
        proposal: loserTicket,
        reason: "semantic_revision_changed"
      })
    ]);
    expect(revocations.map((record) => record.proposal.proposalId)).not.toContain(
      winnerTicket.proposalId
    );

    expect(
      provider.settle(resident, loserRun, { semanticCourse: "fetch Blue mug" })
    ).toEqual({ status: "stale", reason: "semantic_revision_changed" });

    // The project can explain why the loser lost, but resident readouts alone do
    // not preserve the exact proposal identity responsible for the winning change.
    expect(resident.pendingSemanticProposals()).toEqual([]);
    expect(resident.matter(matter.id)?.semanticCourse).toBe("fetch Red mug");
  });

  it("consumes task binding provenance after factual outcome, leaving runId but not taskId in resident readouts", () => {
    const resident = new P2E0ResidentCausalKernel();
    const { matter } = openMatter(resident, "matter.task");
    const runId = 41;
    const taskId = "fetch:item.mug";

    resident.bindTask(matter.id, { taskId, runId });
    expect(resident.taskBinding(runId)).toMatchObject({ matterId: matter.id, taskId, runId });

    const outcome = resident.recordTaskOutcome({
      runId,
      status: "succeeded",
      code: "picked_up_item",
      message: "The item was picked up."
    });

    expect(resident.taskBinding(runId)).toBeNull();
    expect(outcome).toMatchObject({
      kind: "task_outcome",
      source: { kind: "task", runId },
      matterId: matter.id
    });
    expect(resident.matter(matter.id)?.lastTaskOutcomeEvidenceId).toBe(outcome.id);

    const residentReadout = {
      matter: resident.matter(matter.id),
      recentEvidence: resident.recentEvidence(),
      binding: resident.taskBinding(runId),
      pending: resident.pendingSemanticProposals(),
      revocations: resident.recentSemanticProposalRevocations()
    };
    expect(JSON.stringify(residentReadout)).toContain(String(runId));
    expect(JSON.stringify(residentReadout)).not.toContain(taskId);
  });

  it("allows lastTaskOutcomeEvidenceId to outlive the bounded evidence record it names", () => {
    const resident = new P2E0ResidentCausalKernel(2);
    const { matter } = openMatter(resident, "matter.eviction");
    const runId = 77;

    resident.bindTask(matter.id, { taskId: "fetch:item.mug", runId });
    const outcome = resident.recordTaskOutcome({
      runId,
      status: "failed",
      code: "target_unavailable",
      message: "The requested mug is no longer available."
    });
    expect(resident.recentEvidence().map((record) => record.id)).toContain(outcome.id);

    resident.recordEvidence({
      kind: "observed",
      source: { kind: "world", occurrenceId: "world.unrelated.1" },
      summary: "An unrelated event happened."
    });
    resident.recordEvidence({
      kind: "elapsed",
      source: { kind: "clock" },
      summary: "Some unrelated time passed."
    });

    expect(resident.matter(matter.id)?.lastTaskOutcomeEvidenceId).toBe(outcome.id);
    expect(resident.recentEvidence().map((record) => record.id)).not.toContain(outcome.id);
    expect(resident.semanticEvidenceAnchor(matter.id, outcome.id)).toBeNull();

    // This is a post-hoc observability limitation, not a causal decision defect:
    // current semantic continuity still retains its own exact semantic anchor.
    expect(
      resident.semanticEvidenceAnchor(
        matter.id,
        resident.matter(matter.id)?.latestSemanticEvidenceId ?? ""
      )
    ).not.toBeNull();
  });
});
