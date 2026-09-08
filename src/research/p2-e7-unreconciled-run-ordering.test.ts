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
    task: { kind: "approach-and-interact", actorId, targetId: matches[0].id }
  };
};

function openMatter(
  resident: P2E0ResidentCausalKernel,
  id: string,
  occurrenceId: string,
  semanticCourse: string
) {
  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId },
    summary: `player.jozz said: ${semanticCourse}.`
  });
  return resident.openMatter({ id, originEvidenceId: origin.id, semanticCourse });
}

describe("P2-E7 unreconciled terminal run ordering", () => {
  it("holds the next prepared candidate until the previous terminal outcome is reconciled, then releases that same candidate", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (
      !npc || npc.kind !== "npc" ||
      !mug || mug.kind !== "item" ||
      !lantern || lantern.kind !== "item"
    ) {
      throw new Error("P2-E7 ordering fixture requires NPC, mug and lantern.");
    }
    mug.position = { x: npc.position.x + 36, y: npc.position.y };
    lantern.position = { x: npc.position.x - 36, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    const startBoundary = new P2E6GroundedTaskStartBoundary();
    const outcomeBoundary = new P2E7GroundedTaskOutcomeBoundary();

    const mugMatter = openMatter(resident, "matter.mug", "speech.1", "fetch Red mug");
    const mugPrepared = startBoundary.prepare(
      resident,
      world.snapshot(),
      mugMatter.id,
      npc.id,
      exactFetchLabelGrounder
    );
    expect(mugPrepared.status).toBe("ready");
    if (mugPrepared.status !== "ready") return;
    const mugStarted = startBoundary.start(
      resident,
      world.snapshot(),
      executor,
      mugPrepared.candidate
    );
    expect(mugStarted.status).toBe("started");
    if (mugStarted.status !== "started") return;

    const mugTerminalFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(executor.state()).toMatchObject({
      status: "succeeded",
      run: { runId: mugStarted.executorRun.runId }
    });
    expect(resident.taskBinding(mugStarted.executorRun.runId)).toMatchObject({
      matterId: mugMatter.id
    });
    expect(resident.matter(mugMatter.id)?.activeTaskRunId).toBe(mugStarted.executorRun.runId);

    const lanternMatter = openMatter(
      resident,
      "matter.lantern",
      "speech.2",
      "fetch Lantern"
    );
    const lanternPrepared = startBoundary.prepare(
      resident,
      world.snapshot(),
      lanternMatter.id,
      npc.id,
      exactFetchLabelGrounder
    );
    expect(lanternPrepared.status).toBe("ready");
    if (lanternPrepared.status !== "ready") return;

    expect(
      startBoundary.start(resident, world.snapshot(), executor, lanternPrepared.candidate)
    ).toEqual({ status: "rejected", reason: "previous_run_unreconciled" });

    expect(executor.state()).toMatchObject({
      status: "succeeded",
      run: { runId: mugStarted.executorRun.runId },
      task: { targetId: mug.id }
    });
    expect(resident.taskBinding(mugStarted.executorRun.runId)).toMatchObject({
      matterId: mugMatter.id
    });
    expect(resident.matter(lanternMatter.id)?.activeTaskRunId).toBeNull();

    const reconciled = outcomeBoundary.reconcile(resident, executor, mugTerminalFrame);
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;
    expect(resident.taskBinding(mugStarted.executorRun.runId)).toBeNull();
    expect(resident.matter(mugMatter.id)).toMatchObject({
      status: "active",
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: reconciled.evidence.id
    });

    const lanternStarted = startBoundary.start(
      resident,
      world.snapshot(),
      executor,
      lanternPrepared.candidate
    );
    expect(lanternStarted.status).toBe("started");
    if (lanternStarted.status !== "started") return;
    expect(lanternStarted.executorRun.runId).toBe(mugStarted.executorRun.runId + 1);
    expect(lanternStarted.binding).toMatchObject({
      matterId: lanternMatter.id,
      taskId: "fetch:item.lantern",
      runId: lanternStarted.executorRun.runId
    });
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: lanternStarted.executorRun.runId },
      task: { targetId: lantern.id }
    });
  });
});
