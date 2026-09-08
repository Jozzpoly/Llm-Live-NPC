import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { P2E0ResidentCausalKernel } from "../research/p2-e0-resident-causal-kernel";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder
} from "../research/p2-e6-grounded-task-start-causality";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "../research/p2-e9-semantic-reconsideration-hold";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { SupersededTaskDispositionBoundary } from "./superseded-task-disposition";

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

function createFixture() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const red = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !red || red.kind !== "item") {
    throw new Error("Superseded task fixture requires npc.001 and item.mug.");
  }
  red.position = { x: npc.position.x + 180, y: npc.position.y };
  specimen.entities.push({
    id: "item.blue-mug",
    kind: "item",
    label: "Blue mug",
    position: { x: npc.position.x - 180, y: npc.position.y },
    radius: 9,
    heldBy: null
  });

  const world = new World(specimen);
  const resident = new P2E0ResidentCausalKernel();
  const innerExecutor = new DeterministicExecutor();
  const holds = new P2E9SemanticReconsiderationHoldBoundary();
  const executor = new P2E9HoldAwareExecutor(innerExecutor, holds);
  const taskStart = new P2E6GroundedTaskStartBoundary();
  const disposition = new SupersededTaskDispositionBoundary();

  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz" },
    summary: "player.jozz said: Bring me the red mug."
  });
  const matter = resident.openMatter({
    id: "matter.fetch-mug",
    originEvidenceId: origin.id,
    semanticCourse: "uninterpreted"
  });
  const initialTicket = resident.beginSemanticProposal(matter.id);
  const initialDecision = resident.commitSemanticProposal(initialTicket, {
    semanticCourse: "fetch Red mug"
  });
  if (initialDecision.status !== "applied") {
    throw new Error(`Fixture semantic decision failed: ${initialDecision.reason}`);
  }

  const prepared = taskStart.prepare(
    resident,
    world.snapshot(),
    matter.id,
    "npc.001",
    exactFetchLabelGrounder
  );
  if (prepared.status !== "ready") throw new Error(`Fixture grounding failed: ${prepared.reason}`);
  const started = taskStart.start(
    resident,
    world.snapshot(),
    executor,
    prepared.candidate,
    { kind: "cognition" }
  );
  if (started.status !== "started") throw new Error(`Fixture start failed: ${started.reason}`);

  return {
    world,
    resident,
    executor,
    holds,
    taskStart,
    disposition,
    matter,
    initialDecision,
    started
  };
}

describe("superseded task disposition", () => {
  it("refuses to retire the still-current task even when given the applied decision that grounded it", () => {
    const { resident, executor, disposition, matter, initialDecision, started } = createFixture();

    expect(disposition.dispose(resident, executor, matter.id, initialDecision)).toEqual({
      status: "rejected",
      reason: "task_not_superseded"
    });
    expect(resident.taskBinding(started.binding.runId)).toEqual(started.binding);
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticRevision: 2,
      activeTaskRunId: started.binding.runId
    });
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: started.binding.runId }
    });
  });

  it("refuses disposal after evidence attribution alone when no new applied decision exists yet", () => {
    const { resident, executor, disposition, matter, initialDecision, started } = createFixture();

    const correction = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "player.jozz said: Actually, bring me the blue mug."
    });
    resident.advanceSemanticContext(matter.id, correction.id);

    expect(disposition.dispose(resident, executor, matter.id, initialDecision)).toEqual({
      status: "rejected",
      reason: "semantic_decision_not_current"
    });
    expect(resident.taskBinding(started.binding.runId)).toEqual(started.binding);
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: started.binding.runId }
    });
  });

  it("retires an exact held superseded run only after current applied reconsideration, then allows a replacement task", () => {
    const { world, resident, executor, holds, taskStart, disposition, matter, started } = createFixture();

    const correction = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "player.jozz said: Actually, bring me the blue mug."
    });
    resident.advanceSemanticContext(matter.id, correction.id);
    const ticket = resident.beginSemanticProposal(matter.id);
    const held = holds.arm(resident, executor, ticket);
    expect(held.status).toBe("held");
    if (held.status !== "held") return;

    const decision = resident.commitSemanticProposal(ticket, { semanticCourse: "fetch Blue mug" });
    expect(decision.status).toBe("applied");
    if (decision.status !== "applied") return;

    const result = disposition.dispose(resident, executor, matter.id, decision);
    expect(result).toMatchObject({
      status: "disposed",
      record: {
        matterId: matter.id,
        taskId: "fetch:item.mug",
        runId: started.binding.runId,
        taskSemanticRevision: 2,
        currentSemanticRevision: 4,
        disposition: "retired",
        reason: "semantic_revision_superseded"
      }
    });
    expect(holds.holdForRun(started.binding.runId)).toBeNull();
    expect(resident.taskBinding(started.binding.runId)).toBeNull();
    expect(executor.state()).toMatchObject({ status: "idle" });
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Blue mug",
      semanticRevision: 4,
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: null
    });
    expect(resident.recentEvidence().filter((evidence) => evidence.kind === "task_outcome")).toEqual([]);

    const replacement = taskStart.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(replacement.status).toBe("ready");
    if (replacement.status !== "ready") return;
    const replacementStarted = taskStart.start(
      resident,
      world.snapshot(),
      executor,
      replacement.candidate,
      { kind: "cognition" }
    );
    expect(replacementStarted.status).toBe("started");
    if (replacementStarted.status !== "started") return;
    expect(executor.state()).toMatchObject({
      status: "running",
      task: { kind: "approach-and-interact", targetId: "item.blue-mug" }
    });
    expect(replacementStarted.binding).toMatchObject({
      matterId: matter.id,
      semanticRevision: 4
    });
  });
});
