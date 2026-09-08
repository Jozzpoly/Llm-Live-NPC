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

describe("post-P2-E16 delayed task-outcome semantic retention characterization", () => {
  it("shows that a real task outcome can remain referenced by an unresolved matter after its evidence payload is no longer eligible for delayed semantic attribution", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("Delayed-outcome fixture requires npc.001 and item.mug.");
    }
    mug.position = { x: npc.position.x + 36, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel(2);
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
    const reconciled = outcomeBoundary.reconcile(resident, executor, frame);
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;

    const outcome = reconciled.evidence;
    expect(outcome).toMatchObject({
      kind: "task_outcome",
      matterId: matter.id,
      source: { kind: "task", runId: started.executorRun.runId }
    });
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Red mug",
      latestSemanticEvidenceId: origin.id,
      lastTaskOutcomeEvidenceId: outcome.id
    });

    resident.recordEvidence({
      kind: "observed",
      source: { kind: "world", occurrenceId: "world.unrelated.1" },
      summary: "An unrelated actor moved elsewhere in the workshop."
    });
    resident.recordEvidence({
      kind: "elapsed",
      source: { kind: "clock" },
      summary: "More unrelated time passed before semantic satisfaction was reconsidered."
    });

    expect(resident.recentEvidence().map((evidence) => evidence.id)).not.toContain(outcome.id);
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      latestSemanticEvidenceId: origin.id,
      lastTaskOutcomeEvidenceId: outcome.id
    });

    expect(() => resident.advanceSemanticContext(matter.id, outcome.id)).toThrow(
      `P2-E0 recent evidence not found: ${outcome.id}`
    );
  });
});
