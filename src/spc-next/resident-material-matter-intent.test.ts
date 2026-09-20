import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";

describe("resident material matter intent", () => {
  it("stores one recognized material identity as durable semantic meaning without embedding execution policy", () => {
    const kernel = new ResidentContinuityKernel();
    kernel.recordEvidence({
      id: "evidence.material.intent",
      tick: 1,
      kind: "life_context",
      summary: "The resident already intends to recover one familiar object.",
    });

    expect(kernel.openMatter({
      id: "matter.material.intent",
      originEvidenceId: "evidence.material.intent",
      semanticCourse: "recover the familiar object",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "have the familiar workshop crate in hand",
        objectId: "crate.workshop.familiar",
      },
    })).toMatchObject({
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: "crate.workshop.familiar",
      },
      activeRunId: null,
    });

    const snapshot = kernel.snapshotCommittedState();
    const restored = new ResidentContinuityKernel({ committedSnapshot: snapshot });
    expect(restored.matter("matter.material.intent")?.semanticIntent).toEqual({
      kind: "acquire_material_object",
      goal: "have the familiar workshop crate in hand",
      objectId: "crate.workshop.familiar",
    });
  });

  it("rejects an empty material identity", () => {
    const kernel = new ResidentContinuityKernel();
    kernel.recordEvidence({
      id: "evidence.material.invalid",
      tick: 1,
      kind: "life_context",
      summary: "invalid fixture",
    });

    expect(() => kernel.openMatter({
      id: "matter.material.invalid",
      originEvidenceId: "evidence.material.invalid",
      semanticCourse: "recover something",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "recover it",
        objectId: "",
      },
    })).toThrow("matter intent material object id must be non-empty");
  });
});
