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
    task: {
      kind: "approach-and-interact",
      actorId,
      targetId: target.id
    }
  };
};

describe("P2-E6 grounded task start causality", () => {
  it("does not launder a task grounded for an older semantic revision into the newer matter revision", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const boundary = new P2E6GroundedTaskStartBoundary();

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

    const prepared = boundary.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );

    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    expect(prepared.candidate).toEqual({
      taskId: "fetch:item.mug",
      task: {
        kind: "approach-and-interact",
        actorId: "npc.001",
        targetId: "item.mug"
      },
      groundedAtWorldTick: world.tick
    });

    const semanticTicket = resident.beginSemanticProposal(matter.id);
    expect(
      resident.commitSemanticProposal(semanticTicket, { semanticCourse: "fetch Lantern" })
    ).toMatchObject({
      status: "applied",
      matter: { semanticRevision: semanticTicket.semanticRevision + 1 }
    });

    const result = boundary.start(
      resident,
      world.snapshot(),
      executor,
      prepared.candidate,
      { kind: "cognition" }
    );

    expect(result).toEqual({ status: "rejected", reason: "semantic_revision_changed" });
    expect(executor.state()).toMatchObject({ status: "idle", task: null, run: null });
    expect(resident.matter(matter.id)).toMatchObject({
      semanticCourse: "fetch Lantern",
      activeTaskRunId: null
    });
  });
});
