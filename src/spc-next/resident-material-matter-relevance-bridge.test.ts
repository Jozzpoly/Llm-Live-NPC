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


function terminalBlockedMaterialMatter(
  kernel: ResidentContinuityKernel,
  matterId: string,
  runId: string,
  objectId: string,
): void {
  blockedMaterialMatter(kernel, matterId, runId, objectId);
  kernel.resolveMatter(matterId);
  expect(kernel.matter(matterId)).toMatchObject({
    status: "resolved",
    activeRunId: null,
  });
}

function emptyLife(kernel: ResidentContinuityKernel) {
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  return captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: [],
  });
}

describe("ResidentMaterialMatterRelevanceBridge", () => {

  it("fails closed when two archived terminal same-object failures could explain one delayed reacquisition", () => {
    const resident = new ResidentRuntime({
      ...DEFAULT_RESIDENT_PROFILE,
      id: "resident.material-archive-ambiguity",
      name: "Material Archive Ambiguity",
    });
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 4,
    });
    terminalBlockedMaterialMatter(
      kernel,
      "matter.material.archive.a",
      "run.material.archive.a",
      "crate.shared-archive",
    );
    terminalBlockedMaterialMatter(
      kernel,
      "matter.material.archive.b",
      "run.material.archive.b",
      "crate.shared-archive",
    );
    kernel.recordEvidence({
      id: "evidence.material.archive.churn",
      tick: 20,
      kind: "later_life",
      summary: "ordinary later resident life moved both old outcomes out of recent evidence",
    });

    expect(kernel.terminalOutcomeArchiveSnapshot().map((entry) => entry.matterId)).toEqual([
      "matter.material.archive.a",
      "matter.material.archive.b",
    ]);

    const bridge = new ResidentMaterialMatterRelevanceBridge(resident, kernel);
    expect(bridge.observeReacquisition(
      {
        objectId: "crate.shared-archive",
        lastKnownPosition: { x: 10, y: 10 },
        observedAtTick: 19,
        currentlyVisible: false,
      },
      {
        objectId: "crate.shared-archive",
        lastKnownPosition: { x: 30, y: 10 },
        observedAtTick: 21,
        currentlyVisible: true,
      },
      emptyLife(kernel),
    )).toEqual({
      status: "ambiguous",
      objectId: "crate.shared-archive",
      matterIds: [
        "matter.material.archive.a",
        "matter.material.archive.b",
      ],
    });
    expect(resident.pendingCognitionReasons()).toEqual([]);
  });

  it("cannot recall an evicted terminal outcome merely because the old matter record still exists", () => {
    const resident = new ResidentRuntime({
      ...DEFAULT_RESIDENT_PROFILE,
      id: "resident.material-archive-eviction",
      name: "Material Archive Eviction",
    });
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 1,
    });
    terminalBlockedMaterialMatter(
      kernel,
      "matter.material.evicted",
      "run.material.evicted",
      "crate.evicted",
    );
    terminalBlockedMaterialMatter(
      kernel,
      "matter.material.newer",
      "run.material.newer",
      "crate.newer",
    );
    kernel.recordEvidence({
      id: "evidence.material.eviction.churn",
      tick: 20,
      kind: "later_life",
      summary: "later factual life after bounded archive eviction",
    });

    expect(kernel.matter("matter.material.evicted")).toMatchObject({
      status: "resolved",
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: "crate.evicted",
      },
    });
    expect(kernel.archivedTerminalOutcomeEvidence("matter.material.evicted")).toBeNull();

    const bridge = new ResidentMaterialMatterRelevanceBridge(resident, kernel);
    expect(bridge.observeReacquisition(
      {
        objectId: "crate.evicted",
        lastKnownPosition: { x: 10, y: 10 },
        observedAtTick: 19,
        currentlyVisible: false,
      },
      {
        objectId: "crate.evicted",
        lastKnownPosition: { x: 30, y: 10 },
        observedAtTick: 21,
        currentlyVisible: true,
      },
      emptyLife(kernel),
    )).toEqual({
      status: "not_relevant",
      objectId: "crate.evicted",
    });
    expect(resident.pendingCognitionReasons()).toEqual([]);
  });

  it("does not use archived history to manufacture another future while a current same-object matter is already open", () => {
    const resident = new ResidentRuntime({
      ...DEFAULT_RESIDENT_PROFILE,
      id: "resident.material-current-wins",
      name: "Material Current Wins",
    });
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 4,
    });
    terminalBlockedMaterialMatter(
      kernel,
      "matter.material.historical",
      "run.material.historical",
      "crate.current-wins",
    );
    kernel.recordEvidence({
      id: "evidence.material.current.origin",
      tick: 10,
      kind: "life_context",
      summary: "a genuinely current same-object material matter already exists",
    });
    kernel.openMatter({
      id: "matter.material.current",
      originEvidenceId: "evidence.material.current.origin",
      semanticCourse: "current bounded attempt",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "current attempt for the same exact object",
        objectId: "crate.current-wins",
      },
    });

    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const life = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: ["matter.material.current"],
    });
    const bridge = new ResidentMaterialMatterRelevanceBridge(resident, kernel);

    expect(bridge.observeReacquisition(
      {
        objectId: "crate.current-wins",
        lastKnownPosition: { x: 10, y: 10 },
        observedAtTick: 9,
        currentlyVisible: false,
      },
      {
        objectId: "crate.current-wins",
        lastKnownPosition: { x: 30, y: 10 },
        observedAtTick: 11,
        currentlyVisible: true,
      },
      life,
    )).toEqual({
      status: "not_relevant",
      objectId: "crate.current-wins",
    });
    expect(kernel.matter("matter.material.current")).toMatchObject({
      status: "active",
      activeRunId: null,
    });
    expect(resident.pendingCognitionReasons()).toEqual([]);
  });

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
