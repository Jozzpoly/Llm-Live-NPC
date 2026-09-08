import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E7GroundedTaskOutcomeBoundary } from "./p2-e7-grounded-task-outcome-causality";
import { P2E10MatterSuspensionAwareExecutor } from "./p2-e10-matter-suspension-execution-causality";

function specimenWithReachableMug() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
    throw new Error("P2-E10 re-attack requires canonical NPC and mug.");
  }
  mug.position = { x: npc.position.x + 36, y: npc.position.y };
  return { specimen, npc, mug };
}

function openMatter(
  resident: P2E0ResidentCausalKernel,
  id: string,
  actorId: string,
  summary: string,
  semanticCourse: string
) {
  const evidence = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId },
    summary
  });
  return resident.openMatter({ id, originEvidenceId: evidence.id, semanticCourse });
}

describe("P2-E10 matter suspension execution re-attack", () => {
  it("holds across multiple World frames and resumes the exact same run only after the interrupt becomes terminal", () => {
    const { specimen, npc, mug } = specimenWithReachableMug();
    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const gated = new P2E10MatterSuspensionAwareExecutor(executor, resident);
    const driver = new ExecutionDriver(world, gated);
    const outcomes = new P2E7GroundedTaskOutcomeBoundary();

    const first = openMatter(
      resident,
      "matter.first",
      "player.jozz",
      "bring the mug",
      "fetch Red mug"
    );
    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: npc.id, targetId: mug.id },
        { kind: "cognition" }
      )
    ).toBe(true);
    const run = executor.state().run;
    if (!run) throw new Error("P2-E10 re-attack requires accepted executor run.");
    const binding = resident.bindTask(first.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

    const interrupt = openMatter(
      resident,
      "matter.interrupt",
      "player.other",
      "come here first",
      "respond to player.other"
    );
    resident.suspendMatter(first.id, interrupt.id);

    const before = executor.state();
    const tickBefore = world.snapshot().tick;
    for (let i = 0; i < 3; i += 1) {
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      expect(frame.executorActionResult).toBeNull();
      expect(frame.executorActionRun).toBeNull();
    }

    expect(world.snapshot().tick).toBe(tickBefore + 3);
    expect(executor.state()).toMatchObject({
      status: "running",
      stepsUsed: before.stepsUsed,
      run: { runId: run.runId },
      task: { targetId: mug.id }
    });
    expect(resident.taskBinding(run.runId)).toEqual(binding);
    expect(resident.canResumeMatter(first.id)).toBe(false);
    expect(resident.resumeMatter(first.id)).toBe(false);
    expect(resident.matter(first.id)?.status).toBe("suspended");

    resident.resolveMatter(interrupt.id);
    expect(resident.canResumeMatter(first.id)).toBe(true);
    expect(resident.resumeMatter(first.id)).toBe(true);
    expect(resident.matter(first.id)).toMatchObject({
      status: "active",
      suspendedByMatterId: null,
      activeTaskRunId: run.runId
    });

    const resumed = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(resumed.executorActionRun).toMatchObject({ runId: run.runId });
    expect(resumed.executorActionResult).toMatchObject({
      status: "succeeded",
      actorId: npc.id,
      targetId: mug.id,
      code: "picked_up_item"
    });
    expect(executor.state()).toMatchObject({
      status: "succeeded",
      stepsUsed: before.stepsUsed + 1,
      run: { runId: run.runId }
    });

    const reconciled = outcomes.reconcile(resident, executor, resumed);
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;
    expect(reconciled.binding).toEqual(binding);
    expect(reconciled.evidence).toMatchObject({
      kind: "task_outcome",
      matterId: first.id,
      source: { kind: "task", runId: run.runId }
    });
    expect(resident.taskBinding(run.runId)).toBeNull();
    expect(resident.matter(first.id)?.activeTaskRunId).toBeNull();
  });

  it("does not suppress an exact run whose owning matter remains active", () => {
    const { specimen, npc, mug } = specimenWithReachableMug();
    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(
      world,
      new P2E10MatterSuspensionAwareExecutor(executor, resident)
    );

    const active = openMatter(resident, "matter.active", "player.jozz", "bring it", "fetch Red mug");
    expect(
      executor.start({ kind: "approach-and-interact", actorId: npc.id, targetId: mug.id })
    ).toBe(true);
    const run = executor.state().run;
    if (!run) throw new Error("P2-E10 active control requires executor run.");
    resident.bindTask(active.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

    const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(frame.executorActionResult).toMatchObject({ status: "succeeded", targetId: mug.id });
    expect(executor.state()).toMatchObject({ status: "succeeded", run: { runId: run.runId } });
  });

  it("does not turn the adapter into a global executor freeze when the current run has no resident task binding", () => {
    const { specimen, npc, mug } = specimenWithReachableMug();
    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(
      world,
      new P2E10MatterSuspensionAwareExecutor(executor, resident)
    );

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: npc.id, targetId: mug.id },
        { kind: "manual" }
      )
    ).toBe(true);
    const run = executor.state().run;
    if (!run) throw new Error("P2-E10 unbound control requires executor run.");

    const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(frame.executorActionRun).toMatchObject({ runId: run.runId, cause: { kind: "manual" } });
    expect(frame.executorActionResult).toMatchObject({ status: "succeeded", targetId: mug.id });
  });
});
