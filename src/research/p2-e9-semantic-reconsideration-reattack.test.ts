import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder
} from "./p2-e6-grounded-task-start-causality";
import { P2E7GroundedTaskOutcomeBoundary } from "./p2-e7-grounded-task-outcome-causality";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "./p2-e9-semantic-reconsideration-hold";

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

function createSimpleHeldRun() {
  const resident = new P2E0ResidentCausalKernel();
  const executor = new DeterministicExecutor();
  const holds = new P2E9SemanticReconsiderationHoldBoundary();

  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.origin" },
    summary: "player.jozz said: bring the mug"
  });
  const matter = resident.openMatter({
    id: "matter.mug",
    originEvidenceId: origin.id,
    semanticCourse: "fetch Red mug"
  });
  expect(
    executor.start(
      { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" },
      { kind: "cognition" }
    )
  ).toBe(true);
  const run = executor.state().run;
  if (!run) throw new Error("P2-E9 fixture requires an accepted executor run.");
  const binding = resident.bindTask(matter.id, { taskId: "fetch:item.mug", runId: run.runId });

  const revision = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.revision" },
    summary: "player.jozz said: actually reconsider that"
  });
  resident.advanceSemanticContext(matter.id, revision.id);
  const ticket = resident.beginSemanticProposal(matter.id);
  const armed = holds.arm(resident, executor, ticket);
  expect(armed.status).toBe("held");
  if (armed.status !== "held") throw new Error("P2-E9 fixture requires an armed hold.");

  return { resident, executor, holds, matter, binding, run, ticket, hold: armed.hold };
}

describe("P2-E9 semantic reconsideration hold re-attack", () => {
  it("rejects arming when the task has not actually been semantically superseded", () => {
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const holds = new P2E9SemanticReconsiderationHoldBoundary();

    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "bring the mug"
    });
    const matter = resident.openMatter({
      id: "matter.same-revision",
      originEvidenceId: origin.id,
      semanticCourse: "fetch Red mug"
    });
    expect(
      executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" })
    ).toBe(true);
    const run = executor.state().run;
    if (!run) throw new Error("P2-E9 fixture requires executor run.");
    resident.bindTask(matter.id, { taskId: "fetch:item.mug", runId: run.runId });

    const ticket = resident.beginSemanticProposal(matter.id);
    expect(holds.arm(resident, executor, ticket)).toEqual({
      status: "rejected",
      reason: "task_not_semantically_superseded"
    });
    expect(holds.holdForRun(run.runId)).toBeNull();
  });

  it("rejects a forged ticket that does not exactly match the resident pending proposal", () => {
    const fixture = createSimpleHeldRun();

    // The exact run is already held, so use a fresh boundary to attack ticket
    // authority without changing the resident/executor state.
    const foreignBoundary = new P2E9SemanticReconsiderationHoldBoundary();
    expect(
      foreignBoundary.arm(fixture.resident, fixture.executor, {
        ...fixture.ticket,
        semanticEvidenceId: "evidence.forged"
      })
    ).toEqual({ status: "rejected", reason: "proposal_not_pending" });
    expect(foreignBoundary.holdForRun(fixture.run.runId)).toBeNull();
  });

  it("keeps the exact run mechanically frozen across multiple World frames and resumes the same run only after a current applied semantic decision", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    const player = specimen.entities.find((entity) => entity.kind === "player");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item" || !player) {
      throw new Error("P2-E9 re-attack requires canonical NPC, mug and player.");
    }
    mug.position = { x: npc.position.x + 36, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const starts = new P2E6GroundedTaskStartBoundary();
    const holds = new P2E9SemanticReconsiderationHoldBoundary();
    const holdAwareExecutor = new P2E9HoldAwareExecutor(executor, holds);
    const driver = new ExecutionDriver(world, holdAwareExecutor);
    const outcomes = new P2E7GroundedTaskOutcomeBoundary();
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([[npc.id, resident]])
    );
    const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === npc.id;

    const origin = communication.speak(
      { speakerId: player.id, text: "Bring me the Red mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!origin) throw new Error("P2-E9 re-attack requires origin speech.");
    const matter = resident.openMatter({
      id: "matter.resume",
      originEvidenceId: origin.id,
      semanticCourse: "fetch Red mug"
    });
    const prepared = starts.prepare(
      resident,
      world.snapshot(),
      matter.id,
      npc.id,
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

    const revision = communication.speak(
      { speakerId: player.id, text: "Actually, reconsider the mug request." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!revision) throw new Error("P2-E9 re-attack requires revision speech.");
    resident.advanceSemanticContext(matter.id, revision.id);
    const ticket = resident.beginSemanticProposal(matter.id);
    const armed = holds.arm(resident, executor, ticket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    const beforeHold = executor.state();
    const tickBeforeHold = world.snapshot().tick;
    for (let i = 0; i < 3; i += 1) {
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      expect(frame.executorActionResult).toBeNull();
      expect(frame.executorActionRun).toBeNull();
    }
    expect(world.snapshot().tick).toBe(tickBeforeHold + 3);
    expect(executor.state()).toMatchObject({
      status: "running",
      stepsUsed: beforeHold.stepsUsed,
      run: { runId: started.executorRun.runId },
      task: { targetId: mug.id }
    });
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });

    const decision = resident.commitSemanticProposal(ticket, { semanticCourse: "fetch Red mug" });
    expect(decision.status).toBe("applied");
    const released = holds.release(resident, executor, armed.hold, decision);
    expect(released).toEqual({ status: "released", hold: armed.hold });
    expect(holds.holdForRun(started.executorRun.runId)).toBeNull();

    const resumedFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(resumedFrame.executorActionRun).toMatchObject({ runId: started.executorRun.runId });
    expect(resumedFrame.executorActionResult).toMatchObject({
      status: "succeeded",
      actorId: npc.id,
      targetId: mug.id
    });
    expect(executor.state()).toMatchObject({
      status: "succeeded",
      stepsUsed: beforeHold.stepsUsed + 1,
      run: { runId: started.executorRun.runId }
    });
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: npc.id
    });

    const reconciled = outcomes.reconcile(resident, executor, resumedFrame);
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;
    expect(reconciled.evidence).toMatchObject({
      kind: "task_outcome",
      matterId: matter.id,
      source: { kind: "task", runId: started.executorRun.runId }
    });
    expect(resident.taskBinding(started.executorRun.runId)).toBeNull();
    expect(resident.matter(matter.id)?.activeTaskRunId).toBeNull();
  });

  it("does not accept a stale semantic commit result as release authority", () => {
    const fixture = createSimpleHeldRun();
    const newer = fixture.resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.newer" },
      summary: "player.jozz said: changed again"
    });
    fixture.resident.advanceSemanticContext(fixture.matter.id, newer.id);
    const staleDecision = fixture.resident.commitSemanticProposal(
      fixture.ticket,
      { semanticCourse: "fetch Red mug" }
    );
    expect(staleDecision).toEqual({ status: "stale", reason: "semantic_revision_changed" });

    expect(
      fixture.holds.release(fixture.resident, fixture.executor, fixture.hold, staleDecision)
    ).toEqual({
      status: "rejected",
      reason: "semantic_reconsideration_unresolved"
    });
    expect(fixture.holds.holdForRun(fixture.run.runId)).toEqual(fixture.hold);
  });

  it("does not let an applied semantic decision from another matter release this run", () => {
    const fixture = createSimpleHeldRun();
    const otherOrigin = fixture.resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.bob" },
      summary: "player.bob said: another request"
    });
    const other = fixture.resident.openMatter({
      id: "matter.other",
      originEvidenceId: otherOrigin.id,
      semanticCourse: "wait"
    });
    const otherTicket = fixture.resident.beginSemanticProposal(other.id);
    const otherDecision = fixture.resident.commitSemanticProposal(otherTicket, {
      semanticCourse: "wait here"
    });
    expect(otherDecision.status).toBe("applied");

    expect(
      fixture.holds.release(fixture.resident, fixture.executor, fixture.hold, otherDecision)
    ).toEqual({
      status: "rejected",
      reason: "semantic_decision_not_current"
    });
    expect(fixture.holds.holdForRun(fixture.run.runId)).toEqual(fixture.hold);
  });
});
