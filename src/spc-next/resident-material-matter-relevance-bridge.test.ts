import { describe, expect, it } from "vitest";
import { DEFAULT_RESIDENT_PROFILE } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentMaterialMatterRelevanceBridge } from "./resident-material-matter-relevance-bridge";
import { ResidentRuntime } from "./resident-runtime";

function blockedMaterialMatter(
  kernel: ResidentContinuityKernel,
  matterId: string,
  runId: string,
  objectId: string,
): void {
  const evidenceId = `evidence.${matterId}`;
  kernel.recordEvidence({
    id: evidenceId,
    tick: 1,
    kind: "life_context",
    summary: `fixture origin for ${matterId}`,
  });
  kernel.openMatter({
    id: matterId,
    originEvidenceId: evidenceId,
    semanticCourse: `acquire ${objectId}`,
    semanticIntent: {
      kind: "acquire_material_object",
      goal: `have ${objectId}`,
      objectId,
    },
  });
  kernel.bindRun({
    matterId,
    taskId: `task.${matterId}`,
    runId,
  });
  expect(kernel.reconcileRunOutcome({
    runId,
    tick: 2,
    status: "blocked",
    summary: "recognized object unavailable at the checked location",
  }).status).toBe("recorded");
}

describe("ResidentMaterialMatterRelevanceBridge", () => {
  it("refuses to choose between two blocked matters that target the same reacquired material identity", () => {
    const resident = new ResidentRuntime({
      ...DEFAULT_RESIDENT_PROFILE,
      id: "resident.material-ambiguity",
      name: "Material Ambiguity",
    });
    const kernel = new ResidentContinuityKernel();
    blockedMaterialMatter(kernel, "matter.material.a", "run.material.a", "crate.shared");
    blockedMaterialMatter(kernel, "matter.material.b", "run.material.b", "crate.shared");

    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const life = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: ["matter.material.a", "matter.material.b"],
    });
    const bridge = new ResidentMaterialMatterRelevanceBridge(resident, kernel);

    const beforeA = kernel.matter("matter.material.a");
    const beforeB = kernel.matter("matter.material.b");

    expect(bridge.observeReacquisition(
      {
        objectId: "crate.shared",
        lastKnownPosition: { x: 20, y: 20 },
        observedAtTick: 1,
        currentlyVisible: false,
      },
      {
        objectId: "crate.shared",
        lastKnownPosition: { x: 80, y: 40 },
        observedAtTick: 10,
        currentlyVisible: true,
      },
      life,
    )).toEqual({
      status: "ambiguous",
      objectId: "crate.shared",
      matterIds: ["matter.material.a", "matter.material.b"],
    });

    expect(kernel.matter("matter.material.a")).toEqual(beforeA);
    expect(kernel.matter("matter.material.b")).toEqual(beforeB);
    expect(resident.pendingCognitionReasons()).toEqual([]);
  });
});
