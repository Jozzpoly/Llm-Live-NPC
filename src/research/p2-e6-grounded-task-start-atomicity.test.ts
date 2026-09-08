import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder
} from "./p2-e6-grounded-task-start-causality";

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
    summary: `player.jozz said: ${semanticCourse}.`
  });
  return resident.openMatter({ id, originEvidenceId: evidence.id, semanticCourse });
}

describe("P2-E6 grounded task start atomicity", () => {
  it("rejects a resident run-id collision before starting the executor, avoiding a partial causal split", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const boundary = new P2E6GroundedTaskStartBoundary();

    const existingMatter = openMatter(resident, "matter.existing", "fetch Lantern");
    resident.bindTask(existingMatter.id, { taskId: "existing-task", runId: 1 });

    const targetMatter = openMatter(resident, "matter.target", "fetch Red mug");
    const prepared = boundary.prepare(
      resident,
      world.snapshot(),
      targetMatter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    expect(
      boundary.start(resident, world.snapshot(), executor, prepared.candidate)
    ).toEqual({ status: "rejected", reason: "run_id_conflict" });

    expect(executor.state()).toMatchObject({ status: "idle", task: null, run: null });
    expect(resident.matter(targetMatter.id)?.activeTaskRunId).toBeNull();
    expect(resident.taskBinding(1)).toMatchObject({
      matterId: existingMatter.id,
      taskId: "existing-task",
      runId: 1
    });
  });
});
