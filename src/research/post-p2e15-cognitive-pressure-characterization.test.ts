import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import {
  P2E5SemanticProviderAuthorityMembrane,
  type P2E5LocalProviderRun
} from "./p2-e5-semantic-provider-authority-membrane";

function openMatter(resident: P2E0ResidentCausalKernel, semanticCourse = "interpret request") {
  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.origin" },
    summary: "player.jozz said: consider this request"
  });
  return resident.openMatter({
    id: "matter.audit",
    originEvidenceId: origin.id,
    semanticCourse
  });
}

describe("post-P2-E15 cognitive pressure characterization", () => {
  it("can represent at least 128 genuinely-live same-revision provider authorities until semantic state changes", () => {
    const resident = new P2E0ResidentCausalKernel();
    const matter = openMatter(resident);
    const contextSeam = new P2E4SemanticProposalContextSeam();
    const membrane = new P2E5SemanticProviderAuthorityMembrane();
    const runs: P2E5LocalProviderRun[] = [];
    const tickets = [];

    for (let index = 0; index < 128; index += 1) {
      const ticket = resident.beginSemanticProposal(matter.id);
      const context = contextSeam.build(resident, ticket);
      expect(context.status).toBe("ready");
      if (context.status !== "ready") return;
      tickets.push(ticket);
      runs.push(membrane.prepare(context.context).run);
    }

    expect(resident.pendingSemanticProposals()).toHaveLength(128);
    expect(resident.pendingSemanticProposals()).toEqual(tickets);
    expect(new Set(tickets.map((ticket) => ticket.proposalId)).size).toBe(128);
    expect(new Set(tickets.map((ticket) => ticket.semanticRevision))).toEqual(
      new Set([matter.semanticRevision])
    );

    // Malformed provider output does not consume genuinely-live local authority,
    // so a formatting/transport retry path can remain live while its resident
    // ticket is still current.
    expect(membrane.settle(resident, runs[0], { semanticCourse: 7 })).toEqual({
      status: "provider_output_rejected",
      reason: "invalid_semantic_course"
    });
    expect(resident.pendingSemanticProposals()).toHaveLength(128);

    // The kernel does correctly collapse known-dead authority as soon as the
    // semantic dependency changes. This distinguishes lifecycle safety from
    // admission/backpressure policy. Exact stale-reason provenance is separately
    // bounded to the most recent 32 revocations, so old delayed runs remain safe
    // but eventually degrade to the generic proposal_not_pending reason.
    const revision = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.revision" },
      summary: "player.jozz changed the request"
    });
    resident.advanceSemanticContext(matter.id, revision.id);

    expect(resident.pendingSemanticProposals()).toEqual([]);
    const revocations = resident.recentSemanticProposalRevocations();
    expect(revocations).toHaveLength(32);
    expect(revocations[0]?.proposal.proposalId).toBe(tickets[96]?.proposalId);
    expect(revocations[31]?.proposal.proposalId).toBe(tickets[127]?.proposalId);

    expect(
      membrane.settle(resident, runs[0], { semanticCourse: "new course" })
    ).toEqual({ status: "stale", reason: "proposal_not_pending" });
    expect(
      membrane.settle(resident, runs[127], { semanticCourse: "other course" })
    ).toEqual({ status: "stale", reason: "semantic_revision_changed" });
  });

  it("passes large grounded speech and initial semantic course into model-visible input without an input-size bound", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", resident]])
    );
    const speechText = "s".repeat(32_768);
    const initialCourse = "c".repeat(32_768);

    const spoken = communication.speak(
      { speakerId: "player.jozz", text: speechText },
      ({ observer }) => observer.id === "npc.001"
    );
    const evidence = spoken.residentEvidence[0]?.evidence;
    if (!evidence) throw new Error("Payload characterization requires grounded heard evidence.");

    expect(spoken.frame.occurrence.text).toHaveLength(32_768);
    expect(evidence.summary).toBe(`player.jozz said: ${speechText}`);

    const matter = resident.openMatter({
      id: "matter.large-input",
      originEvidenceId: evidence.id,
      semanticCourse: initialCourse
    });
    const ticket = resident.beginSemanticProposal(matter.id);
    const context = new P2E4SemanticProposalContextSeam().build(resident, ticket);
    expect(context.status).toBe("ready");
    if (context.status !== "ready") return;

    const run = new P2E5SemanticProviderAuthorityMembrane().prepare(context.context).run;
    expect(run.modelInput.currentSemanticCourse).toHaveLength(32_768);
    expect(run.modelInput.semanticEvidence.summary).toHaveLength(
      "player.jozz said: ".length + 32_768
    );
    expect(run.modelInput.semanticEvidence.summary.endsWith(speechText)).toBe(true);

    // P2-E5's existing 512-character bound is output-only; this assertion makes
    // the asymmetry explicit without selecting a future provider-input limit.
    expect(JSON.stringify(run.modelInput).length).toBeGreaterThan(65_536);
  });
});
