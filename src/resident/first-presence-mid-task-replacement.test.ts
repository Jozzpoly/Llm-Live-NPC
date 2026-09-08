import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import type { P2E6LocalTaskGrounder } from "../research/p2-e6-grounded-task-start-causality";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { FirstPresenceComposition } from "./first-presence-composition";

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

describe("First Presence mid-task semantic replacement", () => {
  it("changes one live matter from red mug to blue mug, retires only the superseded red task and completes the replacement", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const redMug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !redMug || redMug.kind !== "item") {
      throw new Error("First Presence replacement fixture requires npc.001 and item.mug.");
    }

    redMug.position = { x: npc.position.x + 190, y: npc.position.y };
    specimen.entities.push({
      id: "item.blue-mug",
      kind: "item",
      label: "Blue mug",
      position: { x: npc.position.x - 90, y: npc.position.y },
      radius: 9,
      heldBy: null
    });

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    const owner = new FirstPresenceComposition(
      world,
      executor,
      (input) => ({
        semanticCourse: input.semanticEvidence.summary.includes("Actually")
          ? "fetch Blue mug"
          : "fetch Red mug"
      }),
      exactFetchLabelGrounder
    );

    const initial = owner.receiveDirectPlayerSpeech("Bring me the red mug.");
    const matter = owner.openMatterFromEvidence(initial.id);
    expect(owner.reconsiderMatter(matter.id)).toMatchObject({
      status: "applied",
      matter: { semanticCourse: "fetch Red mug", semanticRevision: 2 }
    });

    const redStarted = owner.startMatterTask(matter.id);
    expect(redStarted.status).toBe("started");
    if (redStarted.status !== "started") return;

    const firstFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(owner.afterExecutionFrame(firstFrame)).toBeNull();
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: redStarted.binding.runId },
      task: { kind: "approach-and-interact", targetId: "item.mug" }
    });

    const correction = owner.receiveDirectPlayerSpeech("Actually, bring me the blue mug.");
    expect(owner.advanceMatterFromEvidence(matter.id, correction.id)).toMatchObject({
      id: matter.id,
      status: "active",
      semanticRevision: 3,
      activeTaskRunId: redStarted.binding.runId,
      latestSemanticEvidenceId: correction.id
    });
    expect(owner.reconsiderMatter(matter.id)).toMatchObject({
      status: "applied",
      matter: {
        id: matter.id,
        status: "active",
        semanticCourse: "fetch Blue mug",
        semanticRevision: 4,
        activeTaskRunId: redStarted.binding.runId
      }
    });

    const disposed = owner.disposeSupersededMatterTask(matter.id);
    expect(disposed).toMatchObject({
      status: "disposed",
      record: {
        matterId: matter.id,
        taskId: "fetch:item.mug",
        runId: redStarted.binding.runId,
        taskSemanticRevision: 2,
        currentSemanticRevision: 4,
        reason: "semantic_revision_superseded"
      }
    });
    expect(executor.state()).toMatchObject({ status: "idle" });
    expect(owner.resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Blue mug",
      semanticRevision: 4,
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: null
    });

    const blueStarted = owner.startMatterTask(matter.id);
    expect(blueStarted.status).toBe("started");
    if (blueStarted.status !== "started") return;
    expect(blueStarted.binding).toMatchObject({
      matterId: matter.id,
      semanticRevision: 4
    });
    expect(executor.state()).toMatchObject({
      status: "running",
      task: { kind: "approach-and-interact", targetId: "item.blue-mug" }
    });

    let blueOutcome: ReturnType<typeof owner.afterExecutionFrame> = null;
    for (let step = 0; step < 120; step += 1) {
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      const outcome = owner.afterExecutionFrame(frame);
      if (outcome?.status === "recorded") {
        blueOutcome = outcome;
        break;
      }
    }

    expect(blueOutcome?.status).toBe("recorded");
    if (!blueOutcome || blueOutcome.status !== "recorded") return;
    expect(blueOutcome.evidence.source).toEqual({
      kind: "task",
      runId: blueStarted.binding.runId
    });

    const snapshot = world.snapshot();
    const finalNpc = snapshot.entities.find((entity) => entity.id === "npc.001");
    const finalRed = snapshot.entities.find((entity) => entity.id === "item.mug");
    const finalBlue = snapshot.entities.find((entity) => entity.id === "item.blue-mug");
    expect(finalNpc).toMatchObject({ kind: "npc", heldItemId: "item.blue-mug" });
    expect(finalBlue).toMatchObject({ kind: "item", heldBy: "npc.001" });
    expect(finalRed).toMatchObject({ kind: "item", heldBy: null });

    const trace = owner.trace();
    expect(trace.map((record) => record.kind)).toEqual([
      "experience",
      "semantic_commit",
      "task_started",
      "experience",
      "semantic_commit",
      "task_superseded",
      "task_started",
      "task_outcome"
    ]);
    expect(
      trace.filter((record) => record.kind === "task_outcome").map((record) => record.runId)
    ).toEqual([blueStarted.binding.runId]);
    expect(owner.resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Blue mug",
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: blueOutcome.evidence.id
    });
  });
});
