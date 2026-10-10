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

  it("pins one exact archived same-object outcome only while the current descendant matter needs it", () => {
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 1,
    });

    const oldOrigin = kernel.recordEvidence({
      id: "evidence.archive.material-old.origin",
      tick: 1,
      kind: "life_context",
      summary: "old material episode",
    });
    kernel.openMatter({
      id: "matter.archive.material-old",
      originEvidenceId: oldOrigin.id,
      semanticCourse: "one old bounded crate attempt",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try crate once",
        objectId: "crate.archive.shared",
      },
    });
    kernel.bindRun({
      matterId: "matter.archive.material-old",
      taskId: "task.archive.material-old",
      runId: "run.archive.material-old",
    });
    const oldResult = kernel.reconcileRunOutcome({
      runId: "run.archive.material-old",
      tick: 2,
      status: "blocked",
      summary: "factual same-object failure",
    });
    expect(oldResult.status).toBe("recorded");
    if (oldResult.status !== "recorded") return;
    kernel.resolveMatter("matter.archive.material-old");
    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.material-old"))
      .toEqual(oldResult.evidence);

    const currentOrigin = kernel.recordEvidence({
      id: "evidence.archive.material-current.origin",
      tick: 10,
      kind: "accepted_cognition_commitment",
      summary: "current exact same-object future",
    });
    const current = kernel.openMatter({
      id: "matter.archive.material-current",
      originEvidenceId: currentOrigin.id,
      semanticCourse: "one current bounded retry",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try the same crate again",
        objectId: "crate.archive.shared",
      },
      historicalSupport: [{
        relation: "prior_same_material_outcome",
        sourceMatterId: "matter.archive.material-old",
        evidenceId: oldResult.evidence.id,
      }],
    });
    expect(current.historicalSupport).toEqual([{
      relation: "prior_same_material_outcome",
      sourceMatterId: "matter.archive.material-old",
      evidenceId: oldResult.evidence.id,
    }]);
    expect(kernel.historicalSupportEvidence(current.id)).toEqual([{
      relation: "prior_same_material_outcome",
      sourceMatterId: "matter.archive.material-old",
      evidence: oldResult.evidence,
    }]);

    // New terminal history evicts A from the bounded archive, but the exact old fact
    // remains pinned because it is still a causal dependency of CURRENT matter C.
    createTerminalOutcome(kernel, "newer-than-material-old", 20);
    expect(kernel.archivedTerminalOutcomeEvidence("matter.archive.material-old")).toBeNull();
    expect(kernel.historicalSupportEvidence(current.id)).toEqual([{
      relation: "prior_same_material_outcome",
      sourceMatterId: "matter.archive.material-old",
      evidence: oldResult.evidence,
    }]);

    const restored = new ResidentContinuityKernel({
      committedSnapshot: kernel.snapshotCommittedState(),
    });
    expect(restored.archivedTerminalOutcomeEvidence("matter.archive.material-old")).toBeNull();
    expect(restored.historicalSupportEvidence(current.id)).toEqual([{
      relation: "prior_same_material_outcome",
      sourceMatterId: "matter.archive.material-old",
      evidence: oldResult.evidence,
    }]);

    restored.cancelMatter(current.id);
    expect(restored.matter(current.id)).toMatchObject({
      status: "cancelled",
    });
    expect(restored.matter(current.id)?.historicalSupport).toBeUndefined();
    expect(restored.historicalSupportEvidence(current.id)).toEqual([]);
  });

  it("rejects historical support that is not the exact terminal same-object factual outcome", () => {
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 4,
    });

    const origin = kernel.recordEvidence({
      id: "evidence.archive.validation-old.origin",
      tick: 1,
      kind: "life_context",
      summary: "old material episode for validation",
    });
    kernel.openMatter({
      id: "matter.archive.validation-old",
      originEvidenceId: origin.id,
      semanticCourse: "old crate attempt",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try old crate",
        objectId: "crate.archive.validation-a",
      },
    });
    kernel.bindRun({
      matterId: "matter.archive.validation-old",
      taskId: "task.archive.validation-old",
      runId: "run.archive.validation-old",
    });
    const old = kernel.reconcileRunOutcome({
      runId: "run.archive.validation-old",
      tick: 2,
      status: "blocked",
      summary: "factual validation failure",
    });
    expect(old.status).toBe("recorded");
    if (old.status !== "recorded") return;
    kernel.resolveMatter("matter.archive.validation-old");

    const newOrigin = kernel.recordEvidence({
      id: "evidence.archive.validation-new.origin",
      tick: 5,
      kind: "accepted_cognition_commitment",
      summary: "new candidate",
    });

    expect(() => kernel.openMatter({
      id: "matter.archive.validation-wrong-object",
      originEvidenceId: newOrigin.id,
      semanticCourse: "wrong object candidate",
      semanticIntent: {
        kind: "acquire_material_object",
        goal: "try another crate",
        objectId: "crate.archive.validation-b",
      },
      historicalSupport: [{
        relation: "prior_same_material_outcome",
        sourceMatterId: "matter.archive.validation-old",
        evidenceId: old.evidence.id,
      }],
    })).toThrow("prior material history does not match exact terminal same-object matter");

    expect(() => kernel.openMatter({
      id: "matter.archive.validation-travel",
      originEvidenceId: newOrigin.id,
      semanticCourse: "unrelated travel",
      semanticIntent: {
        kind: "travel_region",
        goal: "visit workshop",
        targetRegionId: "workshop",
      },
      historicalSupport: [{
        relation: "prior_same_material_outcome",
        sourceMatterId: "matter.archive.validation-old",
        evidenceId: old.evidence.id,
      }],
    })).toThrow("prior material history requires a material candidate and factual task outcome");
  });

  it("pins several exact same-actor factual outcomes only to one current communication matter", () => {
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 8,
    });
    const first = createTerminalCommunicationOutcome(
      kernel,
      "social-old-a",
      "resident.ida",
      1,
    );
    const second = createTerminalCommunicationOutcome(
      kernel,
      "social-old-b",
      "resident.ida",
      10,
    );

    const origin = kernel.recordEvidence({
      id: "evidence.archive.social-current.origin",
      tick: 30,
      kind: "accepted_cognition_commitment",
      summary: "current bounded communication with Ida",
    });
    const current = kernel.openMatter({
      id: "matter.archive.social-current",
      originEvidenceId: origin.id,
      semanticCourse: "speak with Ida about the current situation",
      semanticIntent: {
        kind: "communicate_actor",
        goal: "speak with Ida now",
        targetActorId: "resident.ida",
        text: "Ida, porozmawiajmy o tym, co dzieje się teraz.",
      },
      historicalSupport: [
        {
          relation: "prior_same_actor_outcome",
          sourceMatterId: "matter.archive.social-old-a",
          evidenceId: first.id,
        },
        {
          relation: "prior_same_actor_outcome",
          sourceMatterId: "matter.archive.social-old-b",
          evidenceId: second.id,
        },
      ],
    });

    expect(current.historicalSupport).toEqual([
      {
        relation: "prior_same_actor_outcome",
        sourceMatterId: "matter.archive.social-old-a",
        evidenceId: first.id,
      },
      {
        relation: "prior_same_actor_outcome",
        sourceMatterId: "matter.archive.social-old-b",
        evidenceId: second.id,
      },
    ]);
    expect(kernel.historicalSupportEvidence(current.id)).toEqual([
      {
        relation: "prior_same_actor_outcome",
        sourceMatterId: "matter.archive.social-old-a",
        evidence: first,
      },
      {
        relation: "prior_same_actor_outcome",
        sourceMatterId: "matter.archive.social-old-b",
        evidence: second,
      },
    ]);

    const restored = new ResidentContinuityKernel({
      committedSnapshot: kernel.snapshotCommittedState(),
    });
    expect(restored.historicalSupportEvidence(current.id)).toEqual([
      {
        relation: "prior_same_actor_outcome",
        sourceMatterId: "matter.archive.social-old-a",
        evidence: first,
      },
      {
        relation: "prior_same_actor_outcome",
        sourceMatterId: "matter.archive.social-old-b",
        evidence: second,
      },
    ]);

    restored.cancelMatter(current.id);
    expect(restored.matter(current.id)?.historicalSupport).toBeUndefined();
    expect(restored.historicalSupportEvidence(current.id)).toEqual([]);
  });

  it("rejects same-actor support for a different actor or a non-communication current matter", () => {
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 1,
      terminalOutcomeArchiveLimit: 8,
    });
    const old = createTerminalCommunicationOutcome(
      kernel,
      "social-validation-old",
      "resident.ida",
      1,
    );
    const origin = kernel.recordEvidence({
      id: "evidence.archive.social-validation-current.origin",
      tick: 20,
      kind: "accepted_cognition_commitment",
      summary: "current validation candidate",
    });

    expect(() => kernel.openMatter({
      id: "matter.archive.social-wrong-actor",
      originEvidenceId: origin.id,
      semanticCourse: "speak with Nela",
      semanticIntent: {
        kind: "communicate_actor",
        goal: "speak with Nela",
        targetActorId: "resident.nela",
        text: "Nela, porozmawiajmy.",
      },
      historicalSupport: [{
        relation: "prior_same_actor_outcome",
        sourceMatterId: "matter.archive.social-validation-old",
        evidenceId: old.id,
      }],
    })).toThrow("prior actor history does not match exact terminal same-actor matter");

    expect(() => kernel.openMatter({
      id: "matter.archive.social-wrong-kind",
      originEvidenceId: origin.id,
      semanticCourse: "visit workshop",
      semanticIntent: {
        kind: "travel_region",
        goal: "visit workshop",
        targetRegionId: "workshop",
      },
      historicalSupport: [{
        relation: "prior_same_actor_outcome",
        sourceMatterId: "matter.archive.social-validation-old",
        evidenceId: old.id,
      }],
    })).toThrow("prior actor history requires a communication candidate and factual task outcome");
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

function createTerminalCommunicationOutcome(
  kernel: ResidentContinuityKernel,
  suffix: string,
  targetActorId: string,
  tick: number,
) {
  const matterId = `matter.archive.${suffix}`;
  const runId = `run.archive.${suffix}`;
  const origin = kernel.recordEvidence({
    id: `evidence.archive.${suffix}.origin`,
    tick,
    kind: "life_context",
    summary: `old factual communication episode ${suffix}`,
  });
  kernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: `old communication ${suffix}`,
    semanticIntent: {
      kind: "communicate_actor",
      goal: `communicate in episode ${suffix}`,
      targetActorId,
      text: `message ${suffix}`,
    },
  });
  kernel.bindRun({
    matterId,
    taskId: `task.archive.${suffix}`,
    runId,
  });
  const reconciled = kernel.reconcileRunOutcome({
    runId,
    tick: tick + 1,
    status: "succeeded",
    summary: `factually delivered communication episode ${suffix}`,
  });
  expect(reconciled.status).toBe("recorded");
  if (reconciled.status !== "recorded") {
    throw new Error("social archive fixture outcome was not recorded");
  }
  kernel.resolveMatter(matterId);
  return reconciled.evidence;
}
