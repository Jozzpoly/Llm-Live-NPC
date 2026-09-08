import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import {
  P2E4SemanticProposalContextSeam,
  type P2E4SemanticProposalContext
} from "./p2-e4-semantic-proposal-context";

function makeCommunicationResident(recentEvidenceLimit = 32) {
  const world = new World(createP1Specimen());
  const resident = new P2E0ResidentCausalKernel(recentEvidenceLimit);
  const communication = new P2E2CommunicationRuntimeBoundary(
    world,
    new Map([["npc.001", resident]])
  );
  const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";
  return { resident, communication, heardByNpc };
}

function fakeSemanticProvider(context: P2E4SemanticProposalContext): { semanticCourse: string } {
  if (context.semanticEvidence.summary.includes("red one")) {
    return { semanticCourse: "fetch red mug" };
  }
  return { semanticCourse: context.matter.semanticCourse };
}

describe("P2-E4 semantic proposal context seam", () => {
  it("projects one explicitly selected matter and its exact grounded semantic dependency without World/perception spill", () => {
    const { resident, communication, heardByNpc } = makeCommunicationResident();
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
    expect(Object.keys(result.context.matter).sort()).toEqual([
      "id",
      "semanticCourse",
      "semanticRevision"
    ]);
  });

  it("rejects forged tickets and tickets whose resident semantic dependency changed before dispatch", () => {
    const resident = new P2E0ResidentCausalKernel();
    const seam = new P2E4SemanticProposalContextSeam();
    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.1" },
      summary: "Bring me the blue mug."
    });
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });
    const ticket = resident.beginSemanticProposal(matter.id);

    expect(
      seam.build(resident, { ...ticket, semanticEvidenceId: "evidence.forged" })
    ).toEqual({ status: "rejected", reason: "proposal_not_pending" });

    const revision = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.2" },
      summary: "Actually, the red one."
    });
    resident.advanceSemanticContext(matter.id, revision.id);

    expect(seam.build(resident, ticket)).toEqual({
      status: "rejected",
      reason: "semantic_dependency_changed"
    });
  });

  it("refuses to dispatch a pending proposal after its matter became terminal", () => {
    const resident = new P2E0ResidentCausalKernel();
    const seam = new P2E4SemanticProposalContextSeam();
    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.1" },
      summary: "Bring me the mug."
    });
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch mug"
    });
    const ticket = resident.beginSemanticProposal(matter.id);
    resident.resolveMatter(matter.id);

    expect(seam.build(resident, ticket)).toEqual({
      status: "rejected",
      reason: "matter_terminal"
    });
  });

  it("does not expose activity/focus status as an untracked provider dependency", () => {
    const resident = new P2E0ResidentCausalKernel();
    const seam = new P2E4SemanticProposalContextSeam();
    const mugOrigin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.1" },
      summary: "Bring me the mug."
    });
    const mug = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: mugOrigin.id,
      semanticCourse: "fetch mug"
    });
    const interruptOrigin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.bob", occurrenceId: "speech.2" },
      summary: "Help me with the lantern."
    });
    const interrupt = resident.openMatter({
      id: "matter.lantern",
      originEvidenceId: interruptOrigin.id,
      semanticCourse: "help Bob with lantern"
    });
    resident.suspendMatter(mug.id, interrupt.id);
    const ticket = resident.beginSemanticProposal(mug.id);

    const result = seam.build(resident, ticket);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(resident.matter(mug.id)?.status).toBe("suspended");
    expect(result.context.matter).toEqual({
      id: mug.id,
      semanticCourse: "fetch mug",
      semanticRevision: ticket.semanticRevision
    });
    expect("status" in result.context.matter).toBe(false);
  });

  it("rejects a proposal context when its exact semantic evidence is no longer retained", () => {
    const resident = new P2E0ResidentCausalKernel(2);
    const seam = new P2E4SemanticProposalContextSeam();
    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.1" },
      summary: "Bring me the blue mug."
    });
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });
    const revision = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.2" },
      summary: "Actually, the red one."
    });
    resident.advanceSemanticContext(matter.id, revision.id);
    const ticket = resident.beginSemanticProposal(matter.id);

    resident.recordEvidence({
      kind: "observed",
      source: { kind: "world", occurrenceId: "world.1" },
      summary: "unrelated world evidence"
    });
    resident.recordEvidence({
      kind: "elapsed",
      source: { kind: "clock" },
      summary: "unrelated elapsed evidence"
    });

    expect(resident.recentEvidence().map((evidence) => evidence.id)).not.toContain(revision.id);
    expect(seam.build(resident, ticket)).toEqual({
      status: "rejected",
      reason: "semantic_evidence_not_retained"
    });
  });

  it("keeps an already-built request immutable while a delayed provider result loses authority after later semantic supersession", () => {
    const { resident, communication, heardByNpc } = makeCommunicationResident();
    const seam = new P2E4SemanticProposalContextSeam();

    const origin = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the blue mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!origin) throw new Error("P2-E4 fixture requires origin evidence.");
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });

    const redRevision = communication.speak(
      { speakerId: "player.jozz", text: "Actually, the red one." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!redRevision) throw new Error("P2-E4 fixture requires red revision evidence.");
    resident.advanceSemanticContext(matter.id, redRevision.id);
    const redTicket = resident.beginSemanticProposal(matter.id);
    const built = seam.build(resident, redTicket);
    expect(built.status).toBe("ready");
    if (built.status !== "ready") return;
    const providerRequestSnapshot = structuredClone(built.context);

    const blueAgain = communication.speak(
      { speakerId: "player.jozz", text: "No, blue after all." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!blueAgain) throw new Error("P2-E4 fixture requires superseding evidence.");
    resident.advanceSemanticContext(matter.id, blueAgain.id);

    const delayedProposal = fakeSemanticProvider(built.context);

    expect(built.context).toEqual(providerRequestSnapshot);
    expect(delayedProposal).toEqual({ semanticCourse: "fetch red mug" });
    expect(resident.commitSemanticProposal(built.context.proposal, delayedProposal)).toEqual({
      status: "stale",
      reason: "semantic_revision_changed"
    });
    expect(resident.matter(matter.id)).toMatchObject({
      semanticCourse: "fetch blue mug",
      latestSemanticEvidenceId: blueAgain.id
    });
  });
});
