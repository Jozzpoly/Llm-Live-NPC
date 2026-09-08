import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";

function heard(
  resident: P2E0ResidentCausalKernel,
  occurrenceId: string,
  summary: string,
  actorId = "player.jozz"
) {
  return resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId, occurrenceId },
    summary
  });
}

function churn(resident: P2E0ResidentCausalKernel, prefix: string) {
  resident.recordEvidence({
    kind: "observed",
    source: { kind: "world", occurrenceId: `${prefix}.world` },
    summary: `${prefix} unrelated world evidence`
  });
  resident.recordEvidence({
    kind: "elapsed",
    source: { kind: "clock" },
    summary: `${prefix} unrelated elapsed evidence`
  });
}

describe("P2-E8 matter semantic anchor re-attack", () => {
  it("replaces the anchor when semantic context advances instead of retaining an evidence history", () => {
    const resident = new P2E0ResidentCausalKernel(2);
    const origin = heard(resident, "speech.1", "Bring me the blue mug.");
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });

    const revision = heard(resident, "speech.2", "Actually, the red one.");
    resident.advanceSemanticContext(matter.id, revision.id);
    churn(resident, "churn.1");

    expect(resident.recentEvidence().map((evidence) => evidence.id)).not.toContain(revision.id);
    expect(resident.semanticEvidenceAnchor(matter.id, origin.id)).toBeNull();
    expect(resident.semanticEvidenceAnchor(matter.id, revision.id)).toEqual(revision);
  });

  it("keeps the current semantic anchor while an unresolved matter is suspended", () => {
    const resident = new P2E0ResidentCausalKernel(2);
    const seam = new P2E4SemanticProposalContextSeam();

    const mugOrigin = heard(resident, "speech.1", "Bring me the blue mug.");
    const mug = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: mugOrigin.id,
      semanticCourse: "fetch blue mug"
    });
    const interruptOrigin = heard(
      resident,
      "speech.2",
      "Help me with the lantern.",
      "player.bob"
    );
    const interrupt = resident.openMatter({
      id: "matter.lantern",
      originEvidenceId: interruptOrigin.id,
      semanticCourse: "help Bob with lantern"
    });

    resident.suspendMatter(mug.id, interrupt.id);
    churn(resident, "churn.2");
    const ticket = resident.beginSemanticProposal(mug.id);

    expect(resident.recentEvidence().map((evidence) => evidence.id)).not.toContain(mugOrigin.id);
    expect(resident.matter(mug.id)?.status).toBe("suspended");
    expect(seam.build(resident, ticket)).toMatchObject({
      status: "ready",
      context: { semanticEvidence: mugOrigin }
    });
  });

  it("does not allow one matter to retrieve another matter's retained semantic dependency", () => {
    const resident = new P2E0ResidentCausalKernel(2);
    const mugOrigin = heard(resident, "speech.1", "Bring me the mug.");
    const mug = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: mugOrigin.id,
      semanticCourse: "fetch mug"
    });
    const lanternOrigin = heard(
      resident,
      "speech.2",
      "Bring me the lantern.",
      "player.bob"
    );
    const lantern = resident.openMatter({
      id: "matter.lantern",
      originEvidenceId: lanternOrigin.id,
      semanticCourse: "fetch lantern"
    });
    churn(resident, "churn.3");

    expect(resident.semanticEvidenceAnchor(mug.id, lanternOrigin.id)).toBeNull();
    expect(resident.semanticEvidenceAnchor(lantern.id, mugOrigin.id)).toBeNull();
    expect(resident.semanticEvidenceAnchor(mug.id, mugOrigin.id)).toEqual(mugOrigin);
    expect(resident.semanticEvidenceAnchor(lantern.id, lanternOrigin.id)).toEqual(lanternOrigin);
  });

  it("releases the semantic anchor once the matter becomes terminal", () => {
    const resident = new P2E0ResidentCausalKernel(1);
    const seam = new P2E4SemanticProposalContextSeam();
    const origin = heard(resident, "speech.1", "Bring me the mug.");
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch mug"
    });
    const ticket = resident.beginSemanticProposal(matter.id);

    resident.recordEvidence({
      kind: "elapsed",
      source: { kind: "clock" },
      summary: "origin leaves recent ring"
    });
    expect(resident.semanticEvidenceAnchor(matter.id, origin.id)).toEqual(origin);

    resident.resolveMatter(matter.id);

    expect(resident.semanticEvidenceAnchor(matter.id, origin.id)).toBeNull();
    expect(seam.build(resident, ticket)).toEqual({
      status: "rejected",
      reason: "matter_terminal"
    });
  });
});
