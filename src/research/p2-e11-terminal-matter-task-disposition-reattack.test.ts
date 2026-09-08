import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder
} from "./p2-e6-grounded-task-start-causality";
import { P2E7GroundedTaskOutcomeBoundary } from "./p2-e7-grounded-task-outcome-causality";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "./p2-e9-semantic-reconsideration-hold";
import { P2E10MatterSuspensionAwareExecutor } from "./p2-e10-matter-suspension-execution-causality";
import { P2E11TerminalMatterTaskDispositionBoundary } from "./p2-e11-terminal-matter-task-disposition";

const exactFetchLabelGrounder: P2E6LocalTaskGrounder = ({ semanticCourse, actorId, snapshot }) => {
  const match = /^fetch\s+(.+)$/i.exec(semanticCourse.trim());
  if (!match) return null;
  const requestedLabel = match[1].trim().toLocaleLowerCase();
  const matches = snapshot.entities.filter(
    (entity) => entity.kind === "item" && entity.label.toLocaleLowerCase() === requestedLabel
  );
  if (matches.length !== 1) return null;
  const target = matches[0];
  return {
    taskId: `fetch:${target.id}`,
    task: { kind: "approach-and-interact", actorId, targetId: target.id }
  };
};

function openMatter(
  resident: P2E0ResidentCausalKernel,
  id: string,
  semanticCourse: string
) {
  const evidence = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: `${id}.speech` },
    summary: `player.jozz said: ${semanticCourse}`
  });
  return resident.openMatter({ id, originEvidenceId: evidence.id, semanticCourse });
}

function reachableMugWorld() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
    throw new Error("P2-E11 re-attack requires canonical NPC and mug.");
  }
  mug.position = { x: npc.position.x + 36, y: npc.position.y };
  return { world: new World(specimen), npc, mug };
}

describe("P2-E11 terminal matter task disposition re-attack", () => {
  it("releases the executor and resident ownership so P2-E6 can start the next matter with the next run identity", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const starts = new P2E6GroundedTaskStartBoundary();
    const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();

    const first = openMatter(resident, "matter.first", "fetch Red mug");
    const firstPrepared = starts.prepare(
      resident,
      world.snapshot(),
      first.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(firstPrepared.status).toBe("ready");
    if (firstPrepared.status !== "ready") return;
    const firstStarted = starts.start(
      resident,
      world.snapshot(),
      executor,
      firstPrepared.candidate,
      { kind: "cognition" }
    );
    expect(firstStarted.status).toBe("started");
    if (firstStarted.status !== "started") return;

    resident.cancelMatter(first.id);
    expect(dispositions.dispose(resident, executor, first.id)).toMatchObject({
      status: "disposed",
      record: { runId: firstStarted.executorRun.runId, reason: "matter_cancelled" }
    });

    const second = openMatter(resident, "matter.second", "fetch Lantern");
    const secondPrepared = starts.prepare(
      resident,
      world.snapshot(),
      second.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(secondPrepared.status).toBe("ready");
    if (secondPrepared.status !== "ready") return;
    const secondStarted = starts.start(
      resident,
      world.snapshot(),
      executor,
      secondPrepared.candidate,
      { kind: "cognition" }
    );

    expect(secondStarted.status).toBe("started");
    if (secondStarted.status !== "started") return;
    expect(secondStarted.executorRun.runId).toBe(firstStarted.executorRun.runId + 1);
    expect(secondStarted.binding).toMatchObject({ matterId: second.id, taskId: "fetch:item.lantern" });
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: secondStarted.executorRun.runId },
      task: { targetId: "item.lantern" }
    });
  });

  it("does not launder an already factual executor outcome into disposition; P2-E7 keeps authority", () => {
    const { world, npc, mug } = reachableMugWorld();
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();
    const outcomes = new P2E7GroundedTaskOutcomeBoundary();
    const matter = openMatter(resident, "matter.outcome-first", "fetch Red mug");

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: npc.id, targetId: mug.id },
        { kind: "cognition" }
      )
    ).toBe(true);
    const run = executor.state().run;
    if (!run) throw new Error("P2-E11 outcome race requires run provenance.");
    resident.bindTask(matter.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

    const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(frame.executorActionResult).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    expect(executor.state().status).toBe("succeeded");

    resident.resolveMatter(matter.id);
    expect(dispositions.dispose(resident, executor, matter.id)).toEqual({
      status: "rejected",
      reason: "executor_not_running"
    });
    expect(dispositions.records()).toEqual([]);
    expect(resident.taskBinding(run.runId)).toMatchObject({ matterId: matter.id });

    const reconciled = outcomes.reconcile(resident, executor, frame);
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;
    expect(reconciled.evidence).toMatchObject({
      kind: "task_outcome",
      matterId: matter.id,
      source: { kind: "task", runId: run.runId }
    });
    expect(resident.taskBinding(run.runId)).toBeNull();
    expect(resident.matter(matter.id)).toMatchObject({ status: "resolved", activeTaskRunId: null });
  });

  it("rejects mismatched executor identity without partially mutating either side", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();
    const matter = openMatter(resident, "matter.mismatch", "fetch Red mug");

    expect(
      executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" })
    ).toBe(true);
    const actualRun = executor.state().run;
    if (!actualRun) throw new Error("P2-E11 mismatch re-attack requires executor run.");
    const foreignRunId = actualRun.runId + 98;
    resident.bindTask(matter.id, { taskId: "foreign-binding", runId: foreignRunId });
    resident.cancelMatter(matter.id);

    const executorBefore = executor.state();
    const bindingBefore = resident.taskBinding(foreignRunId);
    expect(dispositions.dispose(resident, executor, matter.id)).toEqual({
      status: "rejected",
      reason: "executor_run_mismatch"
    });
    expect(executor.state()).toEqual(executorBefore);
    expect(resident.taskBinding(foreignRunId)).toEqual(bindingBefore);
    expect(resident.matter(matter.id)?.activeTaskRunId).toBe(foreignRunId);
    expect(dispositions.records()).toEqual([]);
    expect(world.tick).toBe(0);
  });

  it("retires the real inner run through both existing executor adapters instead of mutating empty wrapper state", () => {
    for (const adapterKind of ["p2-e10", "p2-e9"] as const) {
      const resident = new P2E0ResidentCausalKernel();
      const inner = new DeterministicExecutor();
      const holds = new P2E9SemanticReconsiderationHoldBoundary();
      const adapted: DeterministicExecutor =
        adapterKind === "p2-e10"
          ? new P2E10MatterSuspensionAwareExecutor(inner, resident)
          : new P2E9HoldAwareExecutor(inner, holds);
      const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();
      const matter = openMatter(resident, `matter.${adapterKind}`, "fetch Red mug");

      expect(
        adapted.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" })
      ).toBe(true);
      const run = adapted.state().run;
      if (!run) throw new Error("P2-E11 adapter re-attack requires run provenance.");
      resident.bindTask(matter.id, { taskId: "fetch:item.mug", runId: run.runId });
      resident.resolveMatter(matter.id);

      expect(dispositions.dispose(resident, adapted, matter.id)).toMatchObject({
        status: "disposed",
        record: { runId: run.runId, matterId: matter.id }
      });
      expect(inner.state()).toMatchObject({ status: "idle", task: null, run: { runId: run.runId } });
      expect(adapted.state()).toEqual(inner.state());
      expect(resident.taskBinding(run.runId)).toBeNull();
    }
  });
});
