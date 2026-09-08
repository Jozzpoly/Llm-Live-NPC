import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import { P2E5SemanticProviderAuthorityMembrane } from "./p2-e5-semantic-provider-authority-membrane";

function prepareRun() {
  const resident = new P2E0ResidentCausalKernel();
  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.origin" },
    summary: "Jozz asked for the mug."
  });
  const matter = resident.openMatter({
    id: "matter.mug",
    originEvidenceId: origin.id,
    semanticCourse: "fetch mug"
  });
  const ticket = resident.beginSemanticProposal(matter.id);
  const context = new P2E4SemanticProposalContextSeam().build(resident, ticket);
  if (context.status !== "ready") {
    throw new Error(`P2-E12 fixture requires ready context: ${context.reason}`);
  }
  const membrane = new P2E5SemanticProviderAuthorityMembrane();
  const run = membrane.prepare(context.context).run;
  return { resident, matter, ticket, membrane, run };
}

describe("P2-E12 revoked provider-run lifecycle RED", () => {
  it("does not preserve a formatting-retry path after terminalization already killed the resident authority", () => {
    const { resident, matter, ticket, membrane, run } = prepareRun();
    resident.cancelMatter(matter.id);

    expect(resident.pendingSemanticProposals()).not.toContainEqual(ticket);
    expect(
      membrane.settle(resident, run, {
        semanticCourse: "fetch red mug",
        unexpectedAuthority: "smuggled"
      })
    ).toEqual({ status: "stale", reason: "matter_terminal" });
    expect(
      membrane.settle(resident, run, { semanticCourse: "fetch red mug" })
    ).toEqual({ status: "local_run_rejected", reason: "unknown_local_run" });
  });

  it("does not preserve a formatting-retry path after semantic supersession already killed the resident authority", () => {
    const { resident, matter, ticket, membrane, run } = prepareRun();
    const newer = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.newer" },
      summary: "Jozz changed the request.",
      matterId: matter.id
    });
    resident.advanceSemanticContext(matter.id, newer.id);

    expect(resident.pendingSemanticProposals()).not.toContainEqual(ticket);
    expect(membrane.settle(resident, run, null)).toEqual({
      status: "stale",
      reason: "semantic_revision_changed"
    });
    expect(
      membrane.settle(resident, run, { semanticCourse: "obsolete result" })
    ).toEqual({ status: "local_run_rejected", reason: "unknown_local_run" });
  });
});
