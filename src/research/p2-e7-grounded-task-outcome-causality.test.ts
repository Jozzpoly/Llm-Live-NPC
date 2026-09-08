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

describe("P2-E7 grounded task outcome causality", () => {
  it("records resident task-outcome evidence only from the exact terminal executor run and real World action result", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("P2-E7 fixture requires npc.001 and item.mug.");
    }
    mug.position = { x: npc.position.x + 36, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
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
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    const started = startBoundary.start(
      resident,
      world.snapshot(),
      executor,
      prepared.candidate,
      { kind: "cognition" }
    );
    expect(started.status).toBe("started");
    if (started.status !== "started") return;

    const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });

    expect(executor.state()).toMatchObject({
      status: "succeeded",
      run: { runId: started.executorRun.runId },
      task: { actorId: npc.id, targetId: mug.id }
    });
    expect(frame.executorActionRun).toEqual(started.executorRun);
    expect(frame.executorActionResult).toMatchObject({
      status: "succeeded",
      actorId: npc.id,
      targetId: mug.id
    });
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: npc.id
    });

    const reconciled = outcomeBoundary.reconcile(resident, executor, frame);

    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;
    expect(reconciled.evidence).toMatchObject({
      kind: "task_outcome",
      source: { kind: "task", runId: started.executorRun.runId },
      matterId: matter.id
    });
    expect(reconciled.evidence.summary).toContain(frame.executorActionResult?.code ?? "");
    expect(resident.taskBinding(started.executorRun.runId)).toBeNull();
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Red mug",
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: reconciled.evidence.id
    });
  });
});
