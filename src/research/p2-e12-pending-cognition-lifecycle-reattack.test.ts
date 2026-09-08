import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel, type P2E0ProposalTicket } from "./p2-e0-resident-causal-kernel";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import { P2E5SemanticProviderAuthorityMembrane } from "./p2-e5-semantic-provider-authority-membrane";

function openMatter(
  resident: P2E0ResidentCausalKernel,
  id: string,
  semanticCourse = "interpret request",
  actorId = "player.jozz"
) {
  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId, occurrenceId: `${id}.origin` },
    summary: `${actorId} opened ${id}`
  });
  return resident.openMatter({ id, originEvidenceId: origin.id, semanticCourse });
}

function prepareRun(resident: P2E0ResidentCausalKernel, matterId: string) {
  const ticket = resident.beginSemanticProposal(matterId);
  const seam = new P2E4SemanticProposalContextSeam();
  const context = seam.build(resident, ticket);
  if (context.status !== "ready") {
    throw new Error(`P2-E12 fixture requires ready context: ${context.reason}`);
  }
  const membrane = new P2E5SemanticProviderAuthorityMembrane();
  return { ticket, seam, membrane, run: membrane.prepare(context.context).run };
}

function proposalIds(tickets: P2E0ProposalTicket[]) {
  return tickets.map((ticket) => ticket.proposalId);
}

describe("P2-E12 pending cognition lifecycle re-attack", () => {
  it("preserves causal rejection for an exact recently-revoked ticket without lending that provenance to a forged identity", () => {
    const resident = new P2E0ResidentCausalKernel();
    const seam = new P2E4SemanticProposalContextSeam();

    const terminalMatter = openMatter(resident, "matter.terminal");
    const terminalTicket = resident.beginSemanticProposal(terminalMatter.id);
    resident.cancelMatter(terminalMatter.id);

    expect(seam.build(resident, terminalTicket)).toEqual({
      status: "rejected",
      reason: "matter_terminal"
    });
    expect(
      seam.build(resident, {
        ...terminalTicket,
        semanticEvidenceId: `${terminalTicket.semanticEvidenceId}.forged`
      })
    ).toEqual({ status: "rejected", reason: "proposal_not_pending" });

    const revisedMatter = openMatter(resident, "matter.revised");
    const revisedTicket = resident.beginSemanticProposal(revisedMatter.id);
    const newerEvidence = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "matter.revised.newer" },
      summary: "Jozz superseded the earlier semantic dependency.",
      matterId: revisedMatter.id
    });
    resident.advanceSemanticContext(revisedMatter.id, newerEvidence.id);

    expect(seam.build(resident, revisedTicket)).toEqual({
      status: "rejected",
      reason: "semantic_dependency_changed"
    });
    expect(
      seam.build(resident, {
        ...revisedTicket,
        matterId: terminalMatter.id
      })
    ).toEqual({ status: "rejected", reason: "proposal_not_pending" });
  });

  it("rejects a valid late provider return after terminalization without restoring dead resident authority", () => {
    const resident = new P2E0ResidentCausalKernel();
    const matter = openMatter(resident, "matter.provider-terminal", "fetch blue mug");
    const { ticket, membrane, run } = prepareRun(resident, matter.id);

    resident.resolveMatter(matter.id);
    expect(resident.pendingSemanticProposals()).not.toContainEqual(ticket);

    expect(
      membrane.settle(resident, run, { semanticCourse: "fetch red mug" })
    ).toEqual({ status: "stale", reason: "matter_terminal" });
    expect(resident.matter(matter.id)).toMatchObject({
      status: "resolved",
      semanticCourse: "fetch blue mug"
    });
    expect(
      membrane.settle(resident, run, { semanticCourse: "fetch green mug" })
    ).toEqual({ status: "local_run_rejected", reason: "unknown_local_run" });
  });

  it("keeps the revocation ledger bounded while active pending state remains truthful after older provenance is evicted", () => {
    const resident = new P2E0ResidentCausalKernel(32, 2);
    const tickets: P2E0ProposalTicket[] = [];

    for (let index = 0; index < 3; index += 1) {
      const matter = openMatter(resident, `matter.eviction.${index}`);
      const ticket = resident.beginSemanticProposal(matter.id);
      tickets.push(ticket);
      resident.cancelMatter(matter.id);
    }

    expect(resident.pendingSemanticProposals()).toEqual([]);
    expect(proposalIds(resident.recentSemanticProposalRevocations().map((entry) => entry.proposal))).toEqual([
      tickets[1]!.proposalId,
      tickets[2]!.proposalId
    ]);

    expect(
      resident.commitSemanticProposal(tickets[0]!, { semanticCourse: "too late" })
    ).toEqual({ status: "stale", reason: "proposal_not_pending" });
    expect(
      resident.commitSemanticProposal(tickets[1]!, { semanticCourse: "too late" })
    ).toEqual({ status: "stale", reason: "matter_terminal" });
    expect(
      resident.commitSemanticProposal(tickets[2]!, { semanticCourse: "too late" })
    ).toEqual({ status: "stale", reason: "matter_terminal" });
  });

  it("terminalizing one matter does not disturb an unrelated provider run that still owns live scoped authority", () => {
    const resident = new P2E0ResidentCausalKernel();
    const terminalMatter = openMatter(resident, "matter.a", "interpret Jozz request");
    const liveMatter = openMatter(resident, "matter.b", "interpret Bob request", "player.bob");
    const terminal = prepareRun(resident, terminalMatter.id);
    const live = prepareRun(resident, liveMatter.id);

    resident.cancelMatter(terminalMatter.id);

    expect(new P2E4SemanticProposalContextSeam().build(resident, terminal.ticket)).toEqual({
      status: "rejected",
      reason: "matter_terminal"
    });
    expect(resident.pendingSemanticProposals()).toEqual([live.ticket]);
    expect(
      live.membrane.settle(resident, live.run, { semanticCourse: "help Bob with lantern" })
    ).toMatchObject({
      status: "applied",
      matter: { id: liveMatter.id, semanticCourse: "help Bob with lantern" }
    });
  });

  it("revokes a losing same-revision provider run from active pending authority while preserving its late stale cause", () => {
    const resident = new P2E0ResidentCausalKernel();
    const matter = openMatter(resident, "matter.siblings", "fetch mug");
    const firstTicket = resident.beginSemanticProposal(matter.id);
    const secondTicket = resident.beginSemanticProposal(matter.id);
    const seam = new P2E4SemanticProposalContextSeam();
    const firstContext = seam.build(resident, firstTicket);
    const secondContext = seam.build(resident, secondTicket);
    if (firstContext.status !== "ready" || secondContext.status !== "ready") {
      throw new Error("P2-E12 fixture requires two ready same-revision contexts.");
    }
    const membrane = new P2E5SemanticProviderAuthorityMembrane();
    const firstRun = membrane.prepare(firstContext.context).run;
    const secondRun = membrane.prepare(secondContext.context).run;

    expect(
      membrane.settle(resident, firstRun, { semanticCourse: "fetch red mug" })
    ).toMatchObject({ status: "applied" });

    expect(resident.pendingSemanticProposals()).toEqual([]);
    expect(seam.build(resident, secondTicket)).toEqual({
      status: "rejected",
      reason: "semantic_dependency_changed"
    });
    expect(
      membrane.settle(resident, secondRun, { semanticCourse: "fetch green mug" })
    ).toEqual({ status: "stale", reason: "semantic_revision_changed" });
    expect(resident.matter(matter.id)?.semanticCourse).toBe("fetch red mug");
  });
});
