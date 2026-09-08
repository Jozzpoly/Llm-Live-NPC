import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";

describe("P2-E8 open-matter semantic evidence continuity", () => {
  it("keeps the exact semantic evidence of an unresolved matter usable after unrelated evidence evicts it from the recent ring", () => {
    const resident = new P2E0ResidentCausalKernel(2);
    const seam = new P2E4SemanticProposalContextSeam();

    const origin = resident.recordEvidence({
      kind: "heard",
      source: {
        kind: "actor",
        actorId: "player.jozz",
        occurrenceId: "speech.1"
      },
      summary: "player.jozz said: Bring me the blue mug."
    });
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });

    resident.recordEvidence({
      kind: "observed",
      source: { kind: "world", occurrenceId: "world.unrelated.1" },
      summary: "Bob crossed the far side of the workshop."
    });
    resident.recordEvidence({
      kind: "elapsed",
      source: { kind: "clock" },
      summary: "A little unrelated time passed."
    });

    expect(resident.recentEvidence().map((evidence) => evidence.id)).not.toContain(origin.id);
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      originEvidenceId: origin.id,
      latestSemanticEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });

    const ticket = resident.beginSemanticProposal(matter.id);
    const context = seam.build(resident, ticket);

    expect(context.status).toBe("ready");
    if (context.status !== "ready") return;
    expect(context.context.semanticEvidence).toEqual(origin);
    expect(context.context.proposal.semanticEvidenceId).toBe(origin.id);
  });
});
