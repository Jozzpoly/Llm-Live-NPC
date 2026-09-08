import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";

function openMatter(
  resident: P2E0ResidentCausalKernel,
  id: string,
  semanticCourse = "clarify request",
  actorId = "player.jozz"
) {
  const evidence = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId, occurrenceId: `${id}.origin` },
    summary: `${actorId} opened ${id}`
  });
  return resident.openMatter({ id, originEvidenceId: evidence.id, semanticCourse });
}

describe("P2-E12 pending cognition authority lifecycle RED", () => {
  for (const terminal of ["resolved", "cancelled"] as const) {
    it(`does not report never-returning proposals as actively pending after their matter becomes ${terminal}`, () => {
      const resident = new P2E0ResidentCausalKernel();
      const matter = openMatter(resident, `matter.${terminal}`);
      const first = resident.beginSemanticProposal(matter.id);
      const second = resident.beginSemanticProposal(matter.id);

      expect(resident.pendingSemanticProposals()).toEqual([first, second]);

      if (terminal === "resolved") resident.resolveMatter(matter.id);
      else resident.cancelMatter(matter.id);

      expect(resident.matter(matter.id)?.status).toBe(terminal);
      expect(
        resident.pendingSemanticProposals().filter((ticket) => ticket.matterId === matter.id)
      ).toEqual([]);
    });
  }

  it("revokes only the terminal matter's active pending authority and leaves unrelated cognition in flight", () => {
    const resident = new P2E0ResidentCausalKernel();
    const terminalMatter = openMatter(resident, "matter.terminal", "interpret Jozz request");
    const liveMatter = openMatter(resident, "matter.live", "interpret Bob request", "player.bob");
    const terminalTicket = resident.beginSemanticProposal(terminalMatter.id);
    const liveTicket = resident.beginSemanticProposal(liveMatter.id);

    expect(resident.pendingSemanticProposals()).toEqual([terminalTicket, liveTicket]);
    resident.cancelMatter(terminalMatter.id);

    expect(resident.pendingSemanticProposals()).toEqual([liveTicket]);
    expect(
      resident.commitSemanticProposal(liveTicket, { semanticCourse: "help Bob with lantern" })
    ).toMatchObject({ status: "applied" });
  });

  it("does not confuse suspension with terminal revocation: pending clarification can still land while interrupted", () => {
    const resident = new P2E0ResidentCausalKernel();
    const first = openMatter(resident, "matter.first", "place mug by crate");
    const interrupt = openMatter(resident, "matter.interrupt", "help Bob", "player.bob");
    const ticket = resident.beginSemanticProposal(first.id);

    resident.suspendMatter(first.id, interrupt.id);

    expect(resident.pendingSemanticProposals()).toEqual([ticket]);
    expect(
      resident.commitSemanticProposal(ticket, { semanticCourse: "place mug by north crate" })
    ).toMatchObject({ status: "applied" });
    expect(resident.matter(first.id)).toMatchObject({
      status: "suspended",
      semanticCourse: "place mug by north crate"
    });
  });

  it("removes an older proposal from the active pending set as soon as newer semantic evidence supersedes its dependency", () => {
    const resident = new P2E0ResidentCausalKernel();
    const matter = openMatter(resident, "matter.revision", "fetch blue mug");
    const oldTicket = resident.beginSemanticProposal(matter.id);

    const newerSpeech = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.revision.newer" },
      summary: "No, red after all.",
      matterId: matter.id
    });
    resident.advanceSemanticContext(matter.id, newerSpeech.id);

    expect(resident.pendingSemanticProposals()).toEqual([]);
    const late = resident.commitSemanticProposal(oldTicket, { semanticCourse: "fetch blue mug" });
    expect(late.status).toBe("stale");
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch blue mug",
      semanticRevision: oldTicket.semanticRevision + 1,
      latestSemanticEvidenceId: newerSpeech.id
    });
  });

  it("removes losing same-revision siblings from active pending authority once one proposal commits", () => {
    const resident = new P2E0ResidentCausalKernel();
    const matter = openMatter(resident, "matter.siblings", "fetch mug");
    const winner = resident.beginSemanticProposal(matter.id);
    const loser = resident.beginSemanticProposal(matter.id);

    expect(resident.pendingSemanticProposals()).toEqual([winner, loser]);
    expect(
      resident.commitSemanticProposal(winner, { semanticCourse: "fetch red mug" })
    ).toMatchObject({ status: "applied" });

    expect(resident.pendingSemanticProposals()).toEqual([]);
    const lateLoser = resident.commitSemanticProposal(loser, { semanticCourse: "fetch blue mug" });
    expect(lateLoser.status).toBe("stale");
    expect(resident.matter(matter.id)?.semanticCourse).toBe("fetch red mug");
  });

  it("does not accumulate active pending cognition from repeated terminal matters whose providers never return", () => {
    const resident = new P2E0ResidentCausalKernel();

    for (let index = 0; index < 12; index += 1) {
      const matter = openMatter(resident, `matter.dead.${index}`);
      resident.beginSemanticProposal(matter.id);
      resident.beginSemanticProposal(matter.id);
      if (index % 2 === 0) resident.resolveMatter(matter.id);
      else resident.cancelMatter(matter.id);
    }

    expect(resident.pendingSemanticProposals()).toEqual([]);
  });
});
