import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";

type TerminalMode = "resolved" | "cancelled";

function setupRunningBoundTask() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
    throw new Error("P2-E11 RED requires canonical NPC and mug.");
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
  if (!run) throw new Error("P2-E11 RED requires an accepted executor run.");
  resident.bindTask(matter.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

  return { world, resident, executor, driver, npc, mug, matter, run };
}

describe("P2-E11 terminal matter task disposition RED", () => {
  for (const mode of ["resolved", "cancelled"] as const satisfies readonly TerminalMode[]) {
    it(`does not let a ${mode} matter's still-bound run cross a later World outcome`, () => {
      const { world, resident, executor, driver, npc, mug, matter, run } = setupRunningBoundTask();

      if (mode === "resolved") resident.resolveMatter(matter.id);
      else resident.cancelMatter(matter.id);

      expect(resident.matter(matter.id)).toMatchObject({
        status: mode,
        activeTaskRunId: run.runId
      });
      expect(resident.taskBinding(run.runId)).toMatchObject({ matterId: matter.id });
      expect(executor.state()).toMatchObject({ status: "running", run: { runId: run.runId } });

      const tickBefore = world.snapshot().tick;
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });

      // A terminal semantic matter must not keep producing new mechanical effects.
      // Disposition must also release the exact run/binding rather than merely
      // freezing it forever and blocking later task starts.
      expect(world.snapshot().tick).toBe(tickBefore + 1);
      expect(frame.executorActionResult).toBeNull();
      expect(frame.executorActionRun).toBeNull();
      expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
        kind: "item",
        heldBy: null
      });
      expect(executor.state().status).not.toBe("running");
      expect(resident.taskBinding(run.runId)).toBeNull();
      expect(resident.matter(matter.id)).toMatchObject({
        status: mode,
        activeTaskRunId: null
      });
      expect(npc.id).toBe("npc.001");
    });
  }
});
