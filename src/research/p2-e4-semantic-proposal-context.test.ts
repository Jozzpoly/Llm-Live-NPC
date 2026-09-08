import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";

describe("P2-E4 semantic proposal context seam", () => {
  it("projects one explicitly selected matter and its exact grounded semantic dependency without World/perception spill", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", resident]])
    );
    const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";
    const seam = new P2E4SemanticProposalContextSeam();

    const origin = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the blue mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!origin) throw new Error("P2-E4 fixture requires origin heard evidence.");

    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });

    const revision = communication.speak(
      { speakerId: "player.jozz", text: "Actually, the red one." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!revision) throw new Error("P2-E4 fixture requires revision heard evidence.");
    resident.advanceSemanticContext(matter.id, revision.id);

    const unrelated = resident.recordEvidence({
      kind: "observed",
      source: { kind: "world", occurrenceId: "world.unrelated.1" },
      summary: "Bob moved on the other side of the room."
    });
    const ticket = resident.beginSemanticProposal(matter.id);

    const result = seam.build(resident, ticket);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.context).toEqual({
      proposal: ticket,
      matter: {
        id: matter.id,
        status: "active",
        semanticCourse: "fetch blue mug",
        semanticRevision: ticket.semanticRevision
      },
      semanticEvidence: revision
    });
    expect(result.context.semanticEvidence.id).toBe(ticket.semanticEvidenceId);
    expect(result.context.semanticEvidence.source).toMatchObject({
      kind: "actor",
      actorId: "player.jozz",
      occurrenceId: "speech.2"
    });
    expect(JSON.stringify(result.context)).not.toContain(unrelated.id);
    expect(Object.keys(result.context).sort()).toEqual(["matter", "proposal", "semanticEvidence"]);
  });
});
