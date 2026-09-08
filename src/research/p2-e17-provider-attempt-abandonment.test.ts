import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import { P2E5SemanticProviderAuthorityMembrane } from "./p2-e5-semantic-provider-authority-membrane";

function openMatter(resident: P2E0ResidentCausalKernel) {
  const origin = resident.recordEvidence({
    kind: "heard",
    source: {
      kind: "actor",
      actorId: "player.jozz",
      occurrenceId: "speech.1"
    },
    summary: "player.jozz said: Bring me the red mug."
  });
  return resident.openMatter({
    id: "matter.mug",
    originEvidenceId: origin.id,
    semanticCourse: "interpret the player's request"
  });
}

function prepareRun(
  resident: P2E0ResidentCausalKernel,
  contextBoundary: P2E4SemanticProposalContextSeam,
  provider: P2E5SemanticProviderAuthorityMembrane,
  matterId: string
) {
  const ticket = resident.beginSemanticProposal(matterId);
  const built = contextBoundary.build(resident, ticket);
  expect(built.status).toBe("ready");
  if (built.status !== "ready") throw new Error("P2-E17 requires ready E4 context.");
  return { ticket, run: provider.prepare(built.context).run };
}

describe("P2-E17 provider attempt abandonment", () => {
  it("releases the exact still-current resident proposal without changing semantic state", () => {
    const resident = new P2E0ResidentCausalKernel();
    const contextBoundary = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const matter = openMatter(resident);
    const prepared = prepareRun(resident, contextBoundary, provider, matter.id);
    const matterBefore = resident.matter(matter.id);
    const revocationsBefore = resident.recentSemanticProposalRevocations();

    expect(resident.pendingSemanticProposals()).toEqual([prepared.ticket]);

    expect(provider.abandon(resident, prepared.run)).toEqual({
      status: "abandoned",
      residentAuthority: "released"
    });

    expect(resident.pendingSemanticProposals()).toEqual([]);
    expect(resident.matter(matter.id)).toEqual(matterBefore);
    expect(resident.recentSemanticProposalRevocations()).toEqual(revocationsBefore);

    expect(
      provider.settle(resident, prepared.run, { semanticCourse: "fetch Red mug" })
    ).toEqual({ status: "local_run_rejected", reason: "unknown_local_run" });
  });

  it("can retire local attempt identity after resident authority already became semantically stale", () => {
    const resident = new P2E0ResidentCausalKernel();
    const contextBoundary = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const matter = openMatter(resident);
    const prepared = prepareRun(resident, contextBoundary, provider, matter.id);

    const correction = resident.recordEvidence({
      kind: "heard",
      source: {
        kind: "actor",
        actorId: "player.jozz",
        occurrenceId: "speech.2"
      },
      summary: "player.jozz said: Actually, the blue mug."
    });
    resident.advanceSemanticContext(matter.id, correction.id);

    expect(resident.pendingSemanticProposals()).toEqual([]);
    expect(resident.recentSemanticProposalRevocations()).toEqual([
      expect.objectContaining({
        proposal: prepared.ticket,
        reason: "semantic_revision_changed"
      })
    ]);

    expect(provider.abandon(resident, prepared.run)).toEqual({
      status: "abandoned",
      residentAuthority: "already_inactive"
    });
    expect(
      provider.settle(resident, prepared.run, { semanticCourse: "fetch Red mug" })
    ).toEqual({ status: "local_run_rejected", reason: "unknown_local_run" });
  });
});
