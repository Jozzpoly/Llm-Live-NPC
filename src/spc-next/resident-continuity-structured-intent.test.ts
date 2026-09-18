import { describe, expect, it } from "vitest";
import {
  ResidentContinuityKernel,
  type ResidentMatterIntent,
} from "./resident-continuity-kernel";

describe("ResidentContinuityKernel structured semantic intent", () => {
  it("persists resident-owned structured intent with the semantic revision instead of reducing durable meaning to a summary string", () => {
    const kernel = new ResidentContinuityKernel();
    const origin = kernel.recordEvidence({
      id: "evidence:mira:request:fields",
      tick: 12,
      kind: "accepted_cognition_commitment",
      summary: "Mira accepted an addressed request concerning the familiar fields.",
    });
    const firstIntent = {
      kind: "travel_region",
      goal: "check the familiar fields after the current work",
      targetRegionId: "fields",
    } satisfies ResidentMatterIntent;

    const opened = kernel.openMatter({
      id: "matter:mira:fields",
      originEvidenceId: origin.id,
      semanticCourse: "honor the accepted request to check the familiar fields",
      semanticIntent: firstIntent,
    });

    expect(opened.semanticIntent).toEqual(firstIntent);
    expect(kernel.matter(opened.id)?.semanticIntent).toEqual(firstIntent);

    const ticket = kernel.beginSemanticProposal(opened.id);
    const revisedIntent = {
      kind: "travel_region",
      goal: "return to the familiar fields after the interruption",
      targetRegionId: "fields",
    } satisfies ResidentMatterIntent;
    const committed = kernel.commitSemanticProposal(ticket, {
      semanticCourse: "return to the accepted fields request after the interruption",
      semanticIntent: revisedIntent,
    });

    expect(committed.status).toBe("applied");
    if (committed.status !== "applied") return;
    expect(committed.matter.semanticRevision).toBe(2);
    expect(committed.matter.semanticCourse).toBe("return to the accepted fields request after the interruption");
    expect(committed.matter.semanticIntent).toEqual(revisedIntent);
    expect(kernel.matter(opened.id)?.semanticIntent).toEqual(revisedIntent);
  });
});
