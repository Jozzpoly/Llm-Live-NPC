import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E11TerminalMatterTaskDispositionBoundary } from "./p2-e11-terminal-matter-task-disposition";

type TerminalMode = "resolved" | "cancelled";

function setupRunningBoundTask() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
    throw new Error("P2-E11 requires canonical NPC and mug.");
  }
  mug.position = { x: npc.position.x + 36, y: npc.position.y };

  const world = new World(specimen);
  const resident = new P2E0ResidentCausalKernel();
  const executor = new DeterministicExecutor();
  const driver = new ExecutionDriver(world, executor);

  const evidence = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.terminal" },
    summary: "player.jozz said: bring the mug"
  });
  const matter = resident.openMatter({
    id: "matter.terminal",
    originEvidenceId: evidence.id,
    semanticCourse: "fetch Red mug"
  });
  expect(
    executor.start(
      { kind: "approach-and-interact", actorId: npc.id, targetId: mug.id },
      { kind: "cognition" }
    )
  ).toBe(true);
  const run = executor.state().run;
  if (!run) throw new Error("P2-E11 requires an accepted executor run.");
  resident.bindTask(matter.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

  return { world, resident, executor, driver, npc, mug, matter, run };
}

describe("P2-E11 terminal matter task disposition", () => {
  for (const mode of ["resolved", "cancelled"] as const satisfies readonly TerminalMode[]) {
    it(`retires a ${mode} matter's exact still-running task before it can cross a later World outcome`, () => {
      const { world, resident, executor, driver, npc, mug, matter, run } = setupRunningBoundTask();
      const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();

      if (mode === "resolved") resident.resolveMatter(matter.id);
      else resident.cancelMatter(matter.id);

      // Terminalizing semantic state alone deliberately does not reach into the
      // executor. The explicit P2-E11 lifecycle boundary owns that transition.
      expect(resident.matter(matter.id)).toMatchObject({
        status: mode,
        activeTaskRunId: run.runId
      });
      expect(resident.taskBinding(run.runId)).toMatchObject({ matterId: matter.id });
      expect(executor.state()).toMatchObject({ status: "running", run: { runId: run.runId } });

      const disposition = dispositions.dispose(resident, executor, matter.id);
      expect(disposition).toMatchObject({
        status: "disposed",
        record: {
          matterId: matter.id,
          matterStatus: mode,
          taskId: `fetch:${mug.id}`,
          runId: run.runId,
          semanticRevision: matter.semanticRevision,
          disposition: "retired",
          reason: mode === "resolved" ? "matter_resolved" : "matter_cancelled",
          executorCause: { kind: "cognition" },
          stepsUsed: 0
        }
      });
      expect(dispositions.records()).toHaveLength(1);
      expect(executor.state()).toMatchObject({
        status: "idle",
        task: null,
        failureCode: null,
        stepsUsed: 0,
        run: { runId: run.runId }
      });
      expect(resident.taskBinding(run.runId)).toBeNull();
      expect(resident.matter(matter.id)).toMatchObject({
        status: mode,
        activeTaskRunId: null
      });

      const tickBefore = world.snapshot().tick;
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });

      expect(world.snapshot().tick).toBe(tickBefore + 1);
      expect(frame.executorActionResult).toBeNull();
      expect(frame.executorActionRun).toBeNull();
      expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
        kind: "item",
        heldBy: null
      });
      expect(
        resident.recentEvidence().some(
          (evidence) =>
            evidence.kind === "task_outcome" &&
            evidence.source.kind === "task" &&
            evidence.source.runId === run.runId
        )
      ).toBe(false);
      expect(npc.id).toBe("npc.001");
    });
  }
});
