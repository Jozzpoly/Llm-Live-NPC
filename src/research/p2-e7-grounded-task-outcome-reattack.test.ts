import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import {
  ExecutionDriver,
  type ExecutionFrameResult
} from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder
} from "./p2-e6-grounded-task-start-causality";
import { P2E7GroundedTaskOutcomeBoundary } from "./p2-e7-grounded-task-outcome-causality";

const exactFetchLabelGrounder: P2E6LocalTaskGrounder = ({ semanticCourse, actorId, snapshot }) => {
  const match = /^fetch\s+(.+)$/i.exec(semanticCourse.trim());
  if (!match) return null;
  const requestedLabel = match[1].trim().toLocaleLowerCase();
  const matches = snapshot.entities.filter(
    (entity) => entity.kind === "item" && entity.label.toLocaleLowerCase() === requestedLabel
  );
  if (matches.length !== 1) return null;
  return {
    taskId: `fetch:${matches[0].id}`,
    task: {
      kind: "approach-and-interact",
      actorId,
      targetId: matches[0].id
    }
  };
};

function startedFetch(options: { near?: boolean; stepBudget?: number } = {}) {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
    throw new Error("P2-E7 fixture requires npc.001 and item.mug.");
  }
  if (options.near) mug.position = { x: npc.position.x + 36, y: npc.position.y };

  const world = new World(specimen);
  const resident = new P2E0ResidentCausalKernel();
  const executor = new DeterministicExecutor(options.stepBudget);
  const driver = new ExecutionDriver(world, executor);
  const startBoundary = new P2E6GroundedTaskStartBoundary();
  const outcomeBoundary = new P2E7GroundedTaskOutcomeBoundary();

  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.1" },
    summary: "player.jozz said: Bring me the red mug."
  });
  const matter = resident.openMatter({
    id: "matter.fetch",
    originEvidenceId: origin.id,
    semanticCourse: "fetch Red mug"
  });
  const prepared = startBoundary.prepare(
    resident,
    world.snapshot(),
    matter.id,
    npc.id,
    exactFetchLabelGrounder
  );
  if (prepared.status !== "ready") throw new Error(`P2-E7 fixture prepare failed: ${prepared.reason}`);
  const started = startBoundary.start(
    resident,
    world.snapshot(),
    executor,
    prepared.candidate,
    { kind: "cognition" }
  );
  if (started.status !== "started") throw new Error(`P2-E7 fixture start failed: ${started.reason}`);

  return { world, resident, executor, driver, outcomeBoundary, matter, started, npc, mug };
}

const emptyFrame: ExecutionFrameResult = {
  playerActionResults: [],
  executorActionResult: null,
  executorActionRun: null
};

describe("P2-E7 grounded task outcome re-attack", () => {
  it("does not manufacture task-outcome evidence while the exact bound executor run is still running", () => {
    const { resident, executor, outcomeBoundary, matter, started } = startedFetch();

    expect(executor.state().status).toBe("running");
    expect(outcomeBoundary.reconcile(resident, executor, emptyFrame)).toEqual({ status: "pending" });
    expect(resident.taskBinding(started.executorRun.runId)).toMatchObject({ matterId: matter.id });
    expect(resident.matter(matter.id)?.activeTaskRunId).toBe(started.executorRun.runId);
    expect(resident.recentEvidence().filter((entry) => entry.kind === "task_outcome")).toEqual([]);
  });

  it("does not let a foreign execution frame redirect the exact terminal run's factual outcome", () => {
    const { resident, executor, driver, outcomeBoundary, started } = startedFetch({ near: true });
    const realFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(executor.state().status).toBe("succeeded");
    if (!realFrame.executorActionRun || !realFrame.executorActionResult) {
      throw new Error("P2-E7 fixture requires a real terminal World action.");
    }

    const foreignFrame: ExecutionFrameResult = {
      playerActionResults: [],
      executorActionRun: {
        ...realFrame.executorActionRun,
        runId: realFrame.executorActionRun.runId + 1000
      },
      executorActionResult: {
        ...realFrame.executorActionResult,
        code: "already_holding_item",
        message: "FORGED FOREIGN FRAME"
      }
    };

    const reconciled = outcomeBoundary.reconcile(resident, executor, foreignFrame);
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;
    expect(reconciled.evidence.source).toEqual({ kind: "task", runId: started.executorRun.runId });
    expect(reconciled.evidence.summary).toContain("executor_succeeded");
    expect(reconciled.evidence.summary).not.toContain("FORGED FOREIGN FRAME");
    expect(reconciled.evidence.summary).not.toContain("already_holding_item");
  });

  it("records a deterministic local failure without inventing a World action and consumes the binding only once", () => {
    const { resident, executor, driver, outcomeBoundary, matter, started } = startedFetch({ stepBudget: 1 });

    const movementFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(executor.state().status).toBe("running");
    expect(outcomeBoundary.reconcile(resident, executor, movementFrame)).toEqual({ status: "pending" });

    const failureFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(failureFrame.executorActionResult).toBeNull();
    expect(failureFrame.executorActionRun).toBeNull();
    expect(executor.state()).toMatchObject({
      status: "failed",
      failureCode: "step_budget_exhausted",
      run: { runId: started.executorRun.runId }
    });

    const reconciled = outcomeBoundary.reconcile(resident, executor, failureFrame);
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;
    expect(reconciled.evidence.summary).toContain("failed · step_budget_exhausted");
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: reconciled.evidence.id
    });

    expect(outcomeBoundary.reconcile(resident, executor, failureFrame)).toEqual({
      status: "rejected",
      reason: "task_binding_missing"
    });
    expect(resident.recentEvidence().filter((entry) => entry.kind === "task_outcome")).toHaveLength(1);
  });

  it("records an older real run as history after semantic revision without restoring the old semantic authority", () => {
    const { resident, executor, driver, outcomeBoundary, matter, started } = startedFetch({ near: true });

    const revision = resident.beginSemanticProposal(matter.id);
    expect(
      resident.commitSemanticProposal(revision, { semanticCourse: "fetch Lantern" })
    ).toMatchObject({ status: "applied" });
    expect(resident.matter(matter.id)?.semanticRevision).toBe(matter.semanticRevision + 1);
    expect(resident.taskBinding(started.executorRun.runId)?.semanticRevision).toBe(matter.semanticRevision);

    const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(executor.state().status).toBe("succeeded");
    const reconciled = outcomeBoundary.reconcile(resident, executor, frame);
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;

    expect(reconciled.evidence).toMatchObject({
      kind: "task_outcome",
      source: { kind: "task", runId: started.executorRun.runId },
      matterId: matter.id
    });
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Lantern",
      semanticRevision: matter.semanticRevision + 1,
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: reconciled.evidence.id
    });
  });
});
