import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E10MatterSuspensionAwareExecutor } from "./p2-e10-matter-suspension-execution-causality";
import { P2E11TerminalMatterTaskDispositionBoundary } from "./p2-e11-terminal-matter-task-disposition";
import { P2E7GroundedTaskOutcomeBoundary } from "./p2-e7-grounded-task-outcome-causality";

function setup(status: "resolved" | "cancelled") {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
    throw new Error("Terminal execution-window RED requires canonical npc.001 and item.mug.");
  }
  mug.position = { x: npc.position.x + 36, y: npc.position.y };

  const world = new World(specimen);
  const resident = new P2E0ResidentCausalKernel();
  const inner = new DeterministicExecutor();
  const executor = new P2E10MatterSuspensionAwareExecutor(inner, resident);
  const driver = new ExecutionDriver(world, executor);

  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: `speech.${status}` },
    summary: "player.jozz asked for the Red mug"
  });
  const matter = resident.openMatter({
    id: `matter.${status}`,
    originEvidenceId: origin.id,
    semanticCourse: "fetch Red mug"
  });

  expect(
    executor.start(
      { kind: "approach-and-interact", actorId: npc.id, targetId: mug.id },
      { kind: "cognition", sessionId: 1, cycleId: 1 }
    )
  ).toBe(true);
  const run = executor.state().run;
  if (!run) throw new Error("Terminal execution-window RED requires a running exact run.");
  resident.bindTask(matter.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

  if (status === "resolved") resident.resolveMatter(matter.id);
  else resident.cancelMatter(matter.id);

  return { world, resident, inner, executor, driver, matter, run, mug, npc };
}

describe("post-P2-E15 terminal matter execution-window RED", () => {
  for (const terminalStatus of ["resolved", "cancelled"] as const) {
    it(`does not let a still-running task act after matter becomes ${terminalStatus} but before E11 disposition`, () => {
      const fixture = setup(terminalStatus);

      expect(fixture.resident.matter(fixture.matter.id)).toMatchObject({
        status: terminalStatus,
        activeTaskRunId: fixture.run.runId
      });
      expect(fixture.inner.state()).toMatchObject({
        status: "running",
        stepsUsed: 0,
        run: { runId: fixture.run.runId }
      });

      // Terminal semantic authority already exists. E11 has not yet been called,
      // but the old run must not be able to create a new World fact in this gap.
      const frame = fixture.driver.step({ playerControl: { moveX: 0, moveY: 0 } });

      expect.soft(frame.executorActionResult).toBeNull();
      expect.soft(fixture.inner.state()).toMatchObject({
        status: "running",
        stepsUsed: 0,
        run: { runId: fixture.run.runId }
      });
      expect.soft(fixture.world.snapshot().entities.find((entity) => entity.id === fixture.mug.id)).toMatchObject({
        kind: "item",
        heldBy: null
      });
      expect.soft(fixture.resident.recentEvidence().filter((evidence) => evidence.kind === "task_outcome")).toEqual([]);

      // Once the safe window is preserved, E11 should still own explicit causal
      // retirement rather than manufacturing a task outcome.
      const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();
      expect.soft(
        dispositions.dispose(fixture.resident, fixture.executor, fixture.matter.id)
      ).toMatchObject({
        status: "disposed",
        record: {
          matterId: fixture.matter.id,
          matterStatus: terminalStatus,
          runId: fixture.run.runId,
          reason: terminalStatus === "resolved" ? "matter_resolved" : "matter_cancelled"
        }
      });
      expect.soft(fixture.resident.taskBinding(fixture.run.runId)).toBeNull();
      expect.soft(fixture.resident.matter(fixture.matter.id)).toMatchObject({
        status: terminalStatus,
        activeTaskRunId: null
      });

      // E11 retirement removes both executor-run and resident-binding authority.
      // A later E7 reconciliation therefore rejects the absent run and still may
      // not manufacture any factual task-outcome evidence.
      expect.soft(
        new P2E7GroundedTaskOutcomeBoundary().reconcile(fixture.resident, fixture.executor, frame)
      ).toEqual({ status: "rejected", reason: "executor_run_missing" });
      expect.soft(fixture.resident.recentEvidence().filter((evidence) => evidence.kind === "task_outcome")).toEqual([]);
    });
  }
});
