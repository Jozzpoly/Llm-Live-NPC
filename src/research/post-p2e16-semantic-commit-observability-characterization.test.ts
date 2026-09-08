import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import { P2E5SemanticProviderAuthorityMembrane } from "./p2-e5-semantic-provider-authority-membrane";

describe("post-P2-E16 successful semantic commit observability characterization", () => {
  it("shows that successful proposal identity is consumed without leaving a P2-native durable commit record", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", resident]])
    );
    const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";

    const origin = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the blue mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!origin) throw new Error("Semantic-commit observability fixture requires origin evidence.");

    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });

    const revision = communication.speak(
      { speakerId: "player.jozz", text: "Actually, the red one." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!revision) throw new Error("Semantic-commit observability fixture requires revision evidence.");
    resident.advanceSemanticContext(matter.id, revision.id);

    const ticket = resident.beginSemanticProposal(matter.id);
    const context = new P2E4SemanticProposalContextSeam().build(resident, ticket);
    if (context.status !== "ready") {
      throw new Error(`Semantic-commit observability fixture requires ready context: ${context.reason}`);
    }

    const membrane = new P2E5SemanticProviderAuthorityMembrane();
    const run = membrane.prepare(context.context).run;
    const evidenceBeforeSettlement = resident.recentEvidence();

    const settlement = membrane.settle(resident, run, {
      semanticCourse: "fetch red mug"
    });

    expect(settlement).toMatchObject({
      status: "applied",
      matter: {
        id: matter.id,
        semanticCourse: "fetch red mug",
        semanticRevision: 3,
        latestSemanticEvidenceId: revision.id
      }
    });

    const after = resident.matter(matter.id);
    expect(after).toMatchObject({
      semanticCourse: "fetch red mug",
      semanticRevision: 3,
      latestSemanticEvidenceId: revision.id
    });

    // Successful authority is consumed rather than retained as pending or revoked history.
    expect(resident.pendingSemanticProposals()).not.toContainEqual(ticket);
    expect(
      resident.recentSemanticProposalRevocations().some(
        (record) => record.proposal.proposalId === ticket.proposalId
      )
    ).toBe(false);

    // The semantic commit itself does not append grounded evidence; the current
    // matter state records the result but not the successful proposal identity
    // that caused the transition.
    expect(resident.recentEvidence()).toEqual(evidenceBeforeSettlement);
    expect(resident.semanticEvidenceAnchor(matter.id, revision.id)).toEqual(revision);

    // The membrane's local capability has also been consumed, so later
    // inspection cannot recover the ticket by replaying the public run object.
    expect(
      membrane.settle(resident, run, { semanticCourse: "fetch green mug" })
    ).toEqual({ status: "local_run_rejected", reason: "unknown_local_run" });
  });
});
