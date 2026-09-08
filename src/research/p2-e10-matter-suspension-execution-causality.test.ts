import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";

describe("P2-E10 matter suspension execution causality RED", () => {
  it("does not let the exact task of a suspended matter keep crossing mechanical World progress", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("P2-E10 RED requires canonical NPC and mug.");
    }
    mug.position = { x: npc.position.x + 36, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);

    const firstEvidence = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.first" },
      summary: "player.jozz said: bring the mug"
    });
    const firstMatter = resident.openMatter({
      id: "matter.first",
      originEvidenceId: firstEvidence.id,
      semanticCourse: "fetch Red mug"
    });

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: npc.id, targetId: mug.id },
        { kind: "cognition" }
      )
    ).toBe(true);
    const run = executor.state().run;
    if (!run) throw new Error("P2-E10 RED requires an accepted executor run.");
    resident.bindTask(firstMatter.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

    const interruptEvidence = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.other", occurrenceId: "speech.interrupt" },
      summary: "player.other said: come here first"
    });
    const interruptMatter = resident.openMatter({
      id: "matter.interrupt",
      originEvidenceId: interruptEvidence.id,
      semanticCourse: "respond to player.other"
    });
    resident.suspendMatter(firstMatter.id, interruptMatter.id);

    expect(resident.matter(firstMatter.id)).toMatchObject({
      status: "suspended",
      suspendedByMatterId: interruptMatter.id,
      activeTaskRunId: run.runId
    });

    const executorBefore = executor.state();
    const tickBefore = world.snapshot().tick;
    const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });

    // Interruption must not freeze the shared present, but the task owned by the
    // suspended matter must stop making mechanical progress until the matter is
    // eligible to resume or a later policy explicitly disposes of that task.
    expect(world.snapshot().tick).toBe(tickBefore + 1);
    expect(frame.executorActionResult).toBeNull();
    expect(frame.executorActionRun).toBeNull();
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });
    expect(executor.state()).toMatchObject({
      status: "running",
      stepsUsed: executorBefore.stepsUsed,
      run: { runId: run.runId },
      task: { targetId: mug.id }
    });
    expect(resident.taskBinding(run.runId)).toMatchObject({ matterId: firstMatter.id });
  });
});
