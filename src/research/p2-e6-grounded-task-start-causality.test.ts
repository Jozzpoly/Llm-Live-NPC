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

function openFetchMatter(
  resident: P2E0ResidentCausalKernel,
  id = "matter.fetch",
  semanticCourse = "fetch Red mug"
) {
  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: `${id}.speech` },
    summary: `player.jozz said: ${semanticCourse}.`
  });
  return resident.openMatter({ id, originEvidenceId: origin.id, semanticCourse });
}

describe("P2-E6 grounded task start causality", () => {
  it("does not launder a task grounded for an older semantic revision into the newer matter revision", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const boundary = new P2E6GroundedTaskStartBoundary();
    const matter = openFetchMatter(resident);

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

  it("does not use World tick as a global CAS and starts the same grounded target after unrelated physical time advances", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const boundary = new P2E6GroundedTaskStartBoundary();
    const matter = openFetchMatter(resident);

    const prepared = boundary.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    expect(prepared.candidate.groundedAtWorldTick).toBe(0);

    world.step({ moveX: 1, moveY: 0 });
    expect(world.tick).toBe(1);

    const result = boundary.start(
      resident,
      world.snapshot(),
      executor,
      prepared.candidate,
      { kind: "cognition" }
    );

    expect(result.status).toBe("started");
    if (result.status !== "started") return;
    expect(result.binding).toMatchObject({
      matterId: matter.id,
      taskId: "fetch:item.mug",
      semanticRevision: matter.semanticRevision
    });
    expect(executor.state()).toMatchObject({
      status: "running",
      task: { actorId: "npc.001", targetId: "item.mug" },
      run: { runId: result.binding.runId, cause: { kind: "cognition" } }
    });
  });

  it("refuses to start a previously grounded task after its matter becomes suspended", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const boundary = new P2E6GroundedTaskStartBoundary();
    const matter = openFetchMatter(resident);
    const prepared = boundary.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    const interrupt = openFetchMatter(resident, "matter.interrupt", "fetch Lantern");
    resident.suspendMatter(matter.id, interrupt.id);

    expect(
      boundary.start(resident, world.snapshot(), executor, prepared.candidate)
    ).toEqual({ status: "rejected", reason: "matter_not_active" });
    expect(executor.state()).toMatchObject({ status: "idle", run: null });
    expect(resident.matter(matter.id)?.activeTaskRunId).toBeNull();
  });

  it("keeps grounding authority in a private sidecar so caller mutation cannot redirect the accepted task", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const boundary = new P2E6GroundedTaskStartBoundary();
    const matter = openFetchMatter(resident);
    const prepared = boundary.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    prepared.candidate.taskId = "fetch:item.lantern";
    prepared.candidate.task.targetId = "item.lantern";
    prepared.candidate.groundedAtWorldTick = 999_999;

    const result = boundary.start(
      resident,
      world.snapshot(),
      executor,
      prepared.candidate
    );
    expect(result.status).toBe("started");
    if (result.status !== "started") return;
    expect(result.binding.taskId).toBe("fetch:item.mug");
    expect(executor.state().task).toMatchObject({ targetId: "item.mug" });

    expect(
      boundary.start(
        resident,
        world.snapshot(),
        new DeterministicExecutor(),
        structuredClone(prepared.candidate)
      )
    ).toEqual({ status: "rejected", reason: "unknown_candidate" });
  });

  it("revalidates targeted current World facts before start without consuming a candidate on temporary rejection", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const boundary = new P2E6GroundedTaskStartBoundary();
    const matter = openFetchMatter(resident);
    const prepared = boundary.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    const missingTargetSnapshot = world.snapshot();
    missingTargetSnapshot.entities = missingTargetSnapshot.entities.filter(
      (entity) => entity.id !== "item.mug"
    );

    expect(
      boundary.start(resident, missingTargetSnapshot, executor, prepared.candidate)
    ).toEqual({ status: "rejected", reason: "target_missing" });
    expect(executor.state()).toMatchObject({ status: "idle", run: null });
    expect(resident.matter(matter.id)?.activeTaskRunId).toBeNull();

    expect(
      boundary.start(resident, world.snapshot(), executor, prepared.candidate)
    ).toMatchObject({ status: "started", binding: { taskId: "fetch:item.mug" } });
  });

  it("rejects a grounding result if the matter semantic revision changes inside the local grounding step", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const boundary = new P2E6GroundedTaskStartBoundary();
    const matter = openFetchMatter(resident);
    const revisionEvidence = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.revision" },
      summary: "player.jozz said: Actually, reconsider that."
    });

    const mutatingGrounder: P2E6LocalTaskGrounder = (input) => {
      resident.advanceSemanticContext(matter.id, revisionEvidence.id);
      return exactFetchLabelGrounder(input);
    };

    expect(
      boundary.prepare(
        resident,
        world.snapshot(),
        matter.id,
        "npc.001",
        mutatingGrounder
      )
    ).toEqual({ status: "rejected", reason: "semantic_revision_changed" });
    expect(resident.matter(matter.id)?.semanticRevision).toBe(matter.semanticRevision + 1);
  });

  it("does not bind a grounded matter when the executor is already owned by another running task", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const boundary = new P2E6GroundedTaskStartBoundary();
    const matter = openFetchMatter(resident);
    const prepared = boundary.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    expect(
      executor.start({
        kind: "approach-and-interact",
        actorId: "npc.001",
        targetId: "item.lantern"
      })
    ).toBe(true);

    expect(
      boundary.start(resident, world.snapshot(), executor, prepared.candidate)
    ).toEqual({ status: "rejected", reason: "executor_busy" });
    expect(resident.matter(matter.id)?.activeTaskRunId).toBeNull();
    expect(executor.state().task).toMatchObject({ targetId: "item.lantern" });
  });
});
