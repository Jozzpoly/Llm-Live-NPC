import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel, type P2E0MatterStatus } from "./p2-e0-resident-causal-kernel";

type TerminalMatterStatus = Extract<P2E0MatterStatus, "resolved" | "cancelled">;

function openMatter(resident: P2E0ResidentCausalKernel, id: string) {
  const evidence = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: `${id}.origin` },
    summary: `open ${id}`
  });
  return resident.openMatter({
    id,
    originEvidenceId: evidence.id,
    semanticCourse: `handle ${id}`
  });
}

function terminalize(
  resident: P2E0ResidentCausalKernel,
  matterId: string,
  status: TerminalMatterStatus
) {
  return status === "resolved"
    ? resident.resolveMatter(matterId)
    : resident.cancelMatter(matterId);
}

describe("post-P2-E13 terminal state monotonicity re-attack", () => {
  for (const first of ["resolved", "cancelled"] as const) {
    const opposite: TerminalMatterStatus = first === "resolved" ? "cancelled" : "resolved";

    it(`makes ${first} idempotent and refuses later ${opposite} authority without duplicate revocation`, () => {
      const resident = new P2E0ResidentCausalKernel();
      const matter = openMatter(resident, `matter.${first}.idempotent`);
      const firstTicket = resident.beginSemanticProposal(matter.id);
      const secondTicket = resident.beginSemanticProposal(matter.id);

      expect(terminalize(resident, matter.id, first)).toMatchObject({ status: first });
      const revocationsAfterFirst = resident.recentSemanticProposalRevocations();
      expect(revocationsAfterFirst).toHaveLength(2);
      expect(revocationsAfterFirst).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ proposal: firstTicket, reason: "matter_terminal", matterStatus: first }),
          expect.objectContaining({ proposal: secondTicket, reason: "matter_terminal", matterStatus: first })
        ])
      );

      expect(terminalize(resident, matter.id, first)).toMatchObject({ status: first });
      expect(terminalize(resident, matter.id, opposite)).toMatchObject({ status: first });
      expect(resident.matter(matter.id)).toMatchObject({ status: first });
      expect(resident.recentSemanticProposalRevocations()).toEqual(revocationsAfterFirst);
    });
  }

  it("still allows the first terminalization directly from suspended state and clears suspension causally", () => {
    const resident = new P2E0ResidentCausalKernel();
    const suspended = openMatter(resident, "matter.suspended");
    const interrupt = openMatter(resident, "matter.interrupt");
    const ticket = resident.beginSemanticProposal(suspended.id);

    resident.suspendMatter(suspended.id, interrupt.id);
    expect(resident.matter(suspended.id)).toMatchObject({
      status: "suspended",
      suspendedByMatterId: interrupt.id
    });

    expect(resident.cancelMatter(suspended.id)).toMatchObject({
      status: "cancelled",
      suspendedByMatterId: null
    });
    expect(resident.pendingSemanticProposals()).not.toContainEqual(ticket);
    expect(resident.recentSemanticProposalRevocations()).toContainEqual(
      expect.objectContaining({
        proposal: ticket,
        reason: "matter_terminal",
        matterStatus: "cancelled"
      })
    );
  });

  it("preserves resume eligibility when an interrupt reaches its first terminal state", () => {
    const resident = new P2E0ResidentCausalKernel();
    const earlier = openMatter(resident, "matter.earlier");
    const interrupt = openMatter(resident, "matter.resume-interrupt");

    resident.suspendMatter(earlier.id, interrupt.id);
    expect(resident.canResumeMatter(earlier.id)).toBe(false);

    resident.resolveMatter(interrupt.id);
    expect(resident.canResumeMatter(earlier.id)).toBe(true);

    // A later contradictory terminalization attempt cannot rewrite the cause,
    // but the earlier matter remains resumable because the interrupt is terminal.
    expect(resident.cancelMatter(interrupt.id)).toMatchObject({ status: "resolved" });
    expect(resident.canResumeMatter(earlier.id)).toBe(true);
    expect(resident.resumeMatter(earlier.id)).toBe(true);
    expect(resident.matter(earlier.id)).toMatchObject({
      status: "active",
      suspendedByMatterId: null
    });
  });
});
