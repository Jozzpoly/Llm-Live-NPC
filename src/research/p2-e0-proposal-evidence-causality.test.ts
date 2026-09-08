import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";

describe("P2-E0 proposal evidence causality", () => {
  it("captures the semantic evidence dependency for each proposal ticket", () => {
    const kernel = new P2E0ResidentCausalKernel();
    const origin = kernel.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "Bring me the blue mug."
    });
    const opened = kernel.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });

    const beforeRevision = kernel.beginSemanticProposal(opened.id);

    const revisionEvidence = kernel.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "Actually, the red one.",
      matterId: opened.id
    });
    kernel.advanceSemanticContext(opened.id, revisionEvidence.id);
    const afterRevision = kernel.beginSemanticProposal(opened.id);

    expect(beforeRevision.semanticEvidenceId).toBe(opened.latestSemanticEvidenceId);
    expect(afterRevision.semanticEvidenceId).toBe(revisionEvidence.id);
  });

  it("treats semantic evidence provenance as part of proposal causal identity", () => {
    const kernel = new P2E0ResidentCausalKernel();
    const origin = kernel.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "Bring me the mug."
    });
    const opened = kernel.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch mug"
    });
    const ticket = kernel.beginSemanticProposal(opened.id);

    expect(
      kernel.commitSemanticProposal(
        { ...ticket, semanticEvidenceId: "evidence.forged" },
        { semanticCourse: "forged semantic course" }
      )
    ).toEqual({ status: "stale", reason: "proposal_not_pending" });
    expect(kernel.pendingSemanticProposals()).toEqual([ticket]);

    expect(kernel.commitSemanticProposal(ticket, { semanticCourse: "fetch red mug" })).toMatchObject({
      status: "applied"
    });
  });
});
