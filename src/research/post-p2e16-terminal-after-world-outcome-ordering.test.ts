import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E10MatterSuspensionAwareExecutor } from "./p2-e10-matter-suspension-execution-causality";
import { P2E11TerminalMatterTaskDispositionBoundary } from "./p2-e11-terminal-matter-task-disposition";
import { P2E7GroundedTaskOutcomeBoundary } from "./p2-e7-grounded-task-outcome-causality";

function fixture(status: "resolved" | "cancelled") {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
    throw new Error("Post-P2-E16 ordering fixture requires canonical NPC and mug.");
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
    summary: "player.jozz said: fetch the Red mug"
  });
  const matter = resident.openMatter({
    id: `matter.${status}`,
    originEvidenceId: origin.id,
    semanticCourse: "fetch Red mug"
  });

  expect(
    executor.start(
      { kind: "approach-and-interact", actorId: npc.id, targetId: mug.id },
      { kind: "cognition", sessionId: 18, cycleId: 1 }
    )
  ).toBe(true);
  const run = executor.state().run;
  if (!run) throw new Error("Ordering fixture requires exact running provenance.");
  resident.bindTask(matter.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

  return { world, resident, executor, driver, matter, run, mug, npc, terminalStatus: status };
}

describe("post-P2-E16 terminal-after-World-outcome ordering", () => {
  for (const terminalStatus of ["resolved", "cancelled"] as const) {
    it(`preserves the already-created World outcome when the owning matter becomes ${terminalStatus} before E7 reconciliation`, () => {
      const state = fixture(terminalStatus);

      // The exact task is still active here, so the World effect is legitimate.
      const frame = state.driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      expect(frame.executorActionResult).toMatchObject({
        status: "succeeded",
        actorId: state.npc.id,
        targetId: state.mug.id,
        code: "picked_up_item"
      });
      expect(state.executor.state()).toMatchObject({
        status: "succeeded",
        run: { runId: state.run.runId }
      });
      expect(state.world.snapshot().entities.find((entity) => entity.id === state.mug.id)).toMatchObject({
        kind: "item",
        heldBy: state.npc.id
      });

      // Only after the factual World outcome exists does semantic lifecycle
      // become terminal. This must not retroactively erase the completed fact.
      if (terminalStatus === "resolved") state.resident.resolveMatter(state.matter.id);
      else state.resident.cancelMatter(state.matter.id);
      expect(state.resident.matter(state.matter.id)).toMatchObject({
        status: terminalStatus,
        activeTaskRunId: state.run.runId
      });

      // E11 deliberately refuses to retire an already-terminal executor run so
      // its exact binding remains available for factual E7 reconciliation.
      expect(
        new P2E11TerminalMatterTaskDispositionBoundary().dispose(
          state.resident,
          state.executor,
          state.matter.id
        )
      ).toEqual({ status: "rejected", reason: "executor_not_running" });
      expect(state.resident.taskBinding(state.run.runId)).toMatchObject({
        matterId: state.matter.id,
        runId: state.run.runId
      });

      const reconciled = new P2E7GroundedTaskOutcomeBoundary().reconcile(
        state.resident,
        state.executor,
        frame
      );
      expect(reconciled.status).toBe("recorded");
      if (reconciled.status !== "recorded") return;
      expect(reconciled.evidence).toMatchObject({
        kind: "task_outcome",
        source: { kind: "task", runId: state.run.runId },
        matterId: state.matter.id
      });
      expect(reconciled.evidence.summary).toContain("picked_up_item");

      expect(state.resident.taskBinding(state.run.runId)).toBeNull();
      expect(state.resident.matter(state.matter.id)).toMatchObject({
        status: terminalStatus,
        activeTaskRunId: null,
        lastTaskOutcomeEvidenceId: reconciled.evidence.id
      });

      // Factual reconciliation does not rewrite the already-established semantic
      // terminal cause in either direction.
      if (terminalStatus === "resolved") state.resident.cancelMatter(state.matter.id);
      else state.resident.resolveMatter(state.matter.id);
      expect(state.resident.matter(state.matter.id)?.status).toBe(terminalStatus);
    });
  }
});
