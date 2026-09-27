import { describe, expect, it } from "vitest";
import {
  ResidentContinuityKernel,
  type ResidentContinuityKernelCommittedSnapshot,
} from "./resident-continuity-kernel";

describe("ResidentContinuityKernel bounded terminal factual outcome archive", () => {
  it("retains the exact factual terminal outcome after recent-evidence churn without restoring live matter evidence", () => {
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 2,
    });
    const outcome = createTerminalOutcome(kernel, "a", 1);

    expect(kernel.matter("matter.archive.a")).toMatchObject({
      status: "resolved",
      activeRunId: null,
      lastOutcomeEvidenceId: outcome.id,
    });
    expect(kernel.lastOutcomeEvidence("matter.archive.a")).toBeNull();
    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.a")).toEqual(outcome);

    kernel.recordEvidence({
      id: "evidence.archive.unrelated",
      tick: 4,
      kind: "later_life",
      summary: "ordinary later resident life",
    });
    expect(kernel.recentEvidenceSnapshot().some((evidence) => evidence.id === outcome.id)).toBe(false);
    expect(kernel.lastOutcomeEvidence("matter.archive.a")).toBeNull();
    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.a")).toEqual(outcome);
  });

  it("archives a factual outcome reconciled after semantic terminalization while keeping it non-live", () => {
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 2,
    });
    const origin = kernel.recordEvidence({
      id: "evidence.archive.late.origin",
      tick: 1,
      kind: "life_context",
      summary: "one bounded matter",
    });
    kernel.openMatter({
      id: "matter.archive.late",
      originEvidenceId: origin.id,
      semanticCourse: "finish the already-authorized mechanical attempt",
    });
    kernel.bindRun({
      matterId: "matter.archive.late",
      taskId: "task.archive.late",
      runId: "run.archive.late",
    });

    kernel.cancelMatter("matter.archive.late");
    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.late")).toBeNull();

    const reconciled = kernel.reconcileRunOutcome({
      runId: "run.archive.late",
      tick: 2,
      status: "succeeded",
      summary: "already factual before terminalization was observed",
    });
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;

    expect(kernel.lastOutcomeEvidence("matter.archive.late")).toBeNull();
    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.late"))
      .toEqual(reconciled.evidence);
  });

  it("does not invent archive history for a terminal matter that has no factual run outcome", () => {
    const kernel = new ResidentContinuityKernel({
      terminalOutcomeArchiveLimit: 2,
    });
    const origin = kernel.recordEvidence({
      id: "evidence.archive.empty.origin",
      tick: 1,
      kind: "life_context",
      summary: "matter that will end without a factual run outcome",
    });
    kernel.openMatter({
      id: "matter.archive.empty",
      originEvidenceId: origin.id,
      semanticCourse: "bounded semantic matter",
    });
    kernel.cancelMatter("matter.archive.empty");

    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.empty")).toBeNull();
    expect(kernel.terminalOutcomeArchiveSnapshot()).toEqual([]);
  });

  it("bounds terminal factual history independently of recent evidence and evicts the oldest archived matter", () => {
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 2,
    });
    const first = createTerminalOutcome(kernel, "one", 1);
    const second = createTerminalOutcome(kernel, "two", 10);
    const third = createTerminalOutcome(kernel, "three", 20);

    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.one")).toBeNull();
    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.two")).toEqual(second);
    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.three")).toEqual(third);
    expect(kernel.terminalOutcomeArchiveSnapshot().map((entry) => entry.matterId)).toEqual([
      "matter.archive.two",
      "matter.archive.three",
    ]);
    expect(kernel.recentEvidenceSnapshot().some((evidence) => evidence.id === first.id)).toBe(false);
  });

  it("persists the bounded factual archive across committed reconstruction while accepting legacy v1 snapshots with no archive fields", () => {
    const source = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 2,
    });
    const outcome = createTerminalOutcome(source, "persisted", 1);
    source.recordEvidence({
      id: "evidence.archive.persisted.churn",
      tick: 4,
      kind: "later_life",
      summary: "later unrelated life",
    });

    const snapshot = source.snapshotCommittedState();
    expect(snapshot.terminalOutcomeArchiveLimit).toBe(2);
    expect(snapshot.terminalOutcomeArchive).toEqual([{
      matterId: "matter.archive.persisted",
      evidence: outcome,
    }]);

    const restored = new ResidentContinuityKernel({ committedSnapshot: snapshot });
    expect(restored.lastOutcomeEvidence("matter.archive.persisted")).toBeNull();
    expect(restored.archivedTerminalOutcomeEvidence("matter.archive.persisted")).toEqual(outcome);

    const legacy = structuredClone(snapshot) as ResidentContinuityKernelCommittedSnapshot;
    delete legacy.terminalOutcomeArchiveLimit;
    delete legacy.terminalOutcomeArchive;
    const restoredLegacy = new ResidentContinuityKernel({ committedSnapshot: legacy });
    expect(restoredLegacy.matter("matter.archive.persisted")).toMatchObject({
      status: "resolved",
      lastOutcomeEvidenceId: outcome.id,
    });
    expect(restoredLegacy.archivedTerminalOutcomeEvidence("matter.archive.persisted")).toBeNull();
  });
});

function createTerminalOutcome(
  kernel: ResidentContinuityKernel,
  suffix: string,
  tick: number,
) {
  const matterId = `matter.archive.${suffix}`;
  const runId = `run.archive.${suffix}`;
  const origin = kernel.recordEvidence({
    id: `evidence.archive.${suffix}.origin`,
    tick,
    kind: "life_context",
    summary: `origin for archive episode ${suffix}`,
  });
  kernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: `bounded archive episode ${suffix}`,
  });
  kernel.bindRun({
    matterId,
    taskId: `task.archive.${suffix}`,
    runId,
  });
  const reconciled = kernel.reconcileRunOutcome({
    runId,
    tick: tick + 1,
    status: "blocked",
    summary: `factual archive outcome ${suffix}`,
  });
  expect(reconciled.status).toBe("recorded");
  if (reconciled.status !== "recorded") {
    throw new Error("archive fixture outcome was not recorded");
  }
  kernel.resolveMatter(matterId);
  return reconciled.evidence;
}
