import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";

describe("resident life structured intent projection", () => {
  it("preserves resident-owned structured matter meaning for higher cognition without exposing an execution method", () => {
    const kernel = new ResidentContinuityKernel();
    kernel.recordEvidence({
      id: "evidence:mira:fields",
      tick: 21,
      kind: "accepted_cognition_commitment",
      summary: "Mira accepted the addressed fields request.",
    });
    kernel.openMatter({
      id: "matter:mira:fields",
      originEvidenceId: "evidence:mira:fields",
      semanticCourse: "honor the accepted request to check the familiar fields",
      semanticIntent: {
        kind: "travel_region",
        goal: "check the familiar fields after the current work",
        targetRegionId: "fields",
      },
    });
    const focus = new ResidentExecutionFocusAuthority(kernel);

    const life = captureResidentLifeCognitionView({
      kernel,
      focus,
      matterIds: ["matter:mira:fields"],
    });

    expect(life.matters[0]?.semanticIntent).toEqual({
      kind: "travel_region",
      goal: "check the familiar fields after the current work",
      targetRegionId: "fields",
    });
    expect(life.matters[0]).not.toHaveProperty("routeRegionIds");
    expect(life.matters[0]).not.toHaveProperty("destination");
  });
});
