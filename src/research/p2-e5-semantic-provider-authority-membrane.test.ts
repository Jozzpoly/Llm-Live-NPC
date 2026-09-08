import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import { P2E5SemanticProviderAuthorityMembrane } from "./p2-e5-semantic-provider-authority-membrane";

describe("P2-E5 semantic provider authority membrane", () => {
  it("shows the model only semantic content while the original causal ticket remains local and alone authorizes commit", () => {
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
    if (!origin) throw new Error("P2-E5 fixture requires origin heard evidence.");

    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });
    const revision = communication.speak(
      { speakerId: "player.jozz", text: "Actually, the red one." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!revision) throw new Error("P2-E5 fixture requires revision heard evidence.");
    resident.advanceSemanticContext(matter.id, revision.id);

    const ticket = resident.beginSemanticProposal(matter.id);
    const contextResult = new P2E4SemanticProposalContextSeam().build(resident, ticket);
    if (contextResult.status !== "ready") {
      throw new Error(`P2-E5 fixture requires ready P2-E4 context: ${contextResult.reason}`);
    }

    const membrane = new P2E5SemanticProviderAuthorityMembrane();
    const prepared = membrane.prepare(contextResult.context);

    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    expect(prepared.run.localAuthority).toEqual(ticket);
    expect(prepared.run.modelInput).toEqual({
      currentSemanticCourse: "fetch blue mug",
      semanticEvidence: {
        kind: "heard",
        source: { kind: "actor", actorId: "player.jozz" },
        summary: "player.jozz said: Actually, the red one."
      }
    });

    const serializedModelInput = JSON.stringify(prepared.run.modelInput);
    expect(serializedModelInput).not.toContain(matter.id);
    expect(serializedModelInput).not.toContain(ticket.proposalId.toString());
    expect(serializedModelInput).not.toContain(revision.id);
    expect(serializedModelInput).not.toContain("speech.2");
    expect(serializedModelInput).not.toContain("semanticRevision");

    const settlement = membrane.settle(resident, prepared.run, {
      semanticCourse: "fetch red mug"
    });

    expect(settlement).toMatchObject({
      status: "applied",
      matter: {
        id: matter.id,
        semanticCourse: "fetch red mug"
      }
    });
  });
});
