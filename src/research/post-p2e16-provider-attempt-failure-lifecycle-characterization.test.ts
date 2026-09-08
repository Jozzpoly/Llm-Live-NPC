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

function prepareProviderRun(
  resident: P2E0ResidentCausalKernel,
  contextBoundary: P2E4SemanticProposalContextSeam,
  provider: P2E5SemanticProviderAuthorityMembrane,
  matterId: string
) {
  const ticket = resident.beginSemanticProposal(matterId);
  const built = contextBoundary.build(resident, ticket);
  expect(built.status).toBe("ready");
  if (built.status !== "ready") throw new Error("Expected provider context to be ready.");
  return { ticket, run: provider.prepare(built.context).run };
}

describe("post-P2-E16 provider attempt failure lifecycle characterization", () => {
  it("retains a still-current pending proposal when a prepared provider attempt ends without settle", () => {
    const resident = new P2E0ResidentCausalKernel();
    const contextBoundary = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const matter = openMatter(resident);

    const first = prepareProviderRun(resident, contextBoundary, provider, matter.id);

    // Characterize a transport failure / timeout: the provider attempt obtained
    // a local run but no model value ever reaches settle(). The semantic matter
    // itself remains current and has not been superseded or terminalized.
    expect(first.run.modelInput.currentSemanticCourse).toBe("interpret the player's request");
    expect(resident.pendingSemanticProposals()).toEqual([first.ticket]);
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "interpret the player's request",
      semanticRevision: matter.semanticRevision,
      latestSemanticEvidenceId: matter.latestSemanticEvidenceId
    });

    // A retry can be admitted for the exact same semantic dependency, but the
    // abandoned first authority remains resident-side as a second pending ticket.
    const retry = prepareProviderRun(resident, contextBoundary, provider, matter.id);
    expect(retry.ticket).toMatchObject({
      matterId: first.ticket.matterId,
      semanticRevision: first.ticket.semanticRevision,
      semanticEvidenceId: first.ticket.semanticEvidenceId
    });
    expect(retry.ticket.proposalId).not.toBe(first.ticket.proposalId);
    expect(resident.pendingSemanticProposals()).toEqual([first.ticket, retry.ticket]);
  });

  it("cleans abandoned attempts only after a later semantic invalidation, not because their transport attempt ended", () => {
    const resident = new P2E0ResidentCausalKernel();
    const contextBoundary = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const matter = openMatter(resident);

    const first = prepareProviderRun(resident, contextBoundary, provider, matter.id);
    const retry = prepareProviderRun(resident, contextBoundary, provider, matter.id);
    expect(resident.pendingSemanticProposals()).toHaveLength(2);

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
    expect(resident.recentSemanticProposalRevocations()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposal: first.ticket,
          reason: "semantic_revision_changed"
        }),
        expect.objectContaining({
          proposal: retry.ticket,
          reason: "semantic_revision_changed"
        })
      ])
    );

    // This later cleanup is correct stale-authority cleanup, but it is causally
    // different from transport-attempt completion while the dependency is still current.
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticRevision: matter.semanticRevision + 1,
      latestSemanticEvidenceId: correction.id
    });
  });
});
