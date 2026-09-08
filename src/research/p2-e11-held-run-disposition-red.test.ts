import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder
} from "./p2-e6-grounded-task-start-causality";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "./p2-e9-semantic-reconsideration-hold";
import { P2E11TerminalMatterTaskDispositionBoundary } from "./p2-e11-terminal-matter-task-disposition";

const exactFetchLabelGrounder: P2E6LocalTaskGrounder = ({ semanticCourse, actorId, snapshot }) => {
  const match = /^fetch\s+(.+)$/i.exec(semanticCourse.trim());
  if (!match) return null;
  const requested = match[1].trim().toLocaleLowerCase();
  const matches = snapshot.entities.filter(
    (entity) => entity.kind === "item" && entity.label.toLocaleLowerCase() === requested
  );
  if (matches.length !== 1) return null;
  return {
    taskId: `fetch:${matches[0].id}`,
    task: { kind: "approach-and-interact", actorId, targetId: matches[0].id }
  };
};

describe("P2-E11 held-run terminal disposition RED", () => {
  it("does not leave an active P2-E9 semantic hold attached to a run that no longer exists mechanically or resident-causally", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const inner = new DeterministicExecutor();
    const starts = new P2E6GroundedTaskStartBoundary();
    const holds = new P2E9SemanticReconsiderationHoldBoundary();
    const executor = new P2E9HoldAwareExecutor(inner, holds);
    const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();

    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.initial" },
      summary: "player.jozz said: fetch Red mug"
    });
    const matter = resident.openMatter({
      id: "matter.held-terminal",
      originEvidenceId: origin.id,
      semanticCourse: "fetch Red mug"
    });

    const prepared = starts.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    const started = starts.start(
      resident,
      world.snapshot(),
      executor,
      prepared.candidate,
      { kind: "cognition" }
    );
    expect(started.status).toBe("started");
    if (started.status !== "started") return;

    const revision = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.revision" },
      summary: "player.jozz said: actually reconsider that",
      matterId: matter.id
    });
    resident.advanceSemanticContext(matter.id, revision.id);
    const ticket = resident.beginSemanticProposal(matter.id);
    const armed = holds.arm(resident, executor, ticket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;
    expect(holds.holdForRun(started.executorRun.runId)).toEqual(armed.hold);

    resident.cancelMatter(matter.id);
    expect(dispositions.dispose(resident, executor, matter.id)).toMatchObject({
      status: "disposed",
      record: { runId: started.executorRun.runId, matterId: matter.id }
    });

    expect(inner.state()).toMatchObject({
      status: "idle",
      task: null,
      run: { runId: started.executorRun.runId }
    });
    expect(resident.taskBinding(started.executorRun.runId)).toBeNull();
    expect(resident.matter(matter.id)).toMatchObject({
      status: "cancelled",
      activeTaskRunId: null
    });

    // A hold is authority over a specific live execution relation. Once both
    // mechanical execution and resident task ownership are disposed, retaining
    // it would be stale lifecycle state with no valid release path.
    expect(holds.holdForRun(started.executorRun.runId)).toBeNull();
  });
});
