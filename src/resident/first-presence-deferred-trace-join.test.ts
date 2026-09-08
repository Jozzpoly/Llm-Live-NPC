import { describe, expect, it } from "vitest";
import { ExecutionDriver } from "../execution/execution-driver";
import type { P2E6LocalTaskGrounder } from "../research/p2-e6-grounded-task-start-causality";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { FirstPresenceComposition } from "./first-presence-composition";
import {
  FirstPresenceDeferredSemanticOwner,
  createFirstPresenceDeferredExecution
} from "./first-presence-deferred-semantics";

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
    throw new Error("Deferred trace fixture requires npc.001 and item.mug.");
  }
  red.position = { x: npc.position.x + 180, y: npc.position.y };
  specimen.entities.push({
    id: "item.blue-mug",
    kind: "item",
    label: "Blue mug",
    position: { x: npc.position.x - 110, y: npc.position.y },
    radius: 9,
    heldBy: null
  });

  const world = new World(specimen);
  const execution = createFirstPresenceDeferredExecution();
  const driver = new ExecutionDriver(world, execution.executor);
  const presence = new FirstPresenceComposition(
    world,
    execution.executor,
    () => ({ semanticCourse: "fetch Red mug" }),
    exactFetchLabelGrounder
  );
  const deferred = new FirstPresenceDeferredSemanticOwner(
    presence.resident,
    execution,
    presence.traceSink()
  );

  const initial = presence.receiveDirectPlayerSpeech("Bring me the red mug.");
  const matter = presence.openMatterFromEvidence(initial.id);
  expect(presence.reconsiderMatter(matter.id)).toMatchObject({
    status: "applied",
    matter: { semanticCourse: "fetch Red mug", semanticRevision: 2 }
  });
  const redStarted = presence.startMatterTask(matter.id);
  expect(redStarted.status).toBe("started");
  if (redStarted.status !== "started") throw new Error("Trace fixture Red task did not start.");
  driver.step({ playerControl: { moveX: 0, moveY: 0 } });

  return { world, execution, driver, presence, deferred, matter, redStarted };
}

function runUntilOutcome(
  driver: ExecutionDriver,
  presence: FirstPresenceComposition,
  maxFrames = 140
) {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    const result = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    const outcome = presence.afterExecutionFrame(result);
    if (outcome?.status === "recorded") return outcome;
  }
  return null;
}

describe("First Presence shared deferred lifecycle trace", () => {
  it("preserves one ordered causal story across synchronous Presence and deferred Blue replacement", () => {
    const { driver, presence, deferred, matter, redStarted } = createFixture();

    const correction = presence.receiveDirectPlayerSpeech("Actually, bring me the blue mug.");
    presence.advanceMatterFromEvidence(matter.id, correction.id);
    const pending = deferred.beginReconsideration(matter.id);
    expect(pending.status).toBe("pending");
    if (pending.status !== "pending") return;

    for (let frame = 0; frame < 6; frame += 1) {
      driver.step({ playerControl: { moveX: 1, moveY: 0 } });
    }

    const decision = deferred.settle(pending.attempt, { semanticCourse: "fetch Blue mug" });
    expect(decision.status).toBe("applied");
    if (decision.status !== "applied") return;
    expect(deferred.replaceHeldTask(matter.id, decision).status).toBe("disposed");

    const blueStarted = presence.startMatterTask(matter.id);
    expect(blueStarted.status).toBe("started");
    if (blueStarted.status !== "started") return;
    expect(runUntilOutcome(driver, presence)).toMatchObject({
      status: "recorded",
      evidence: { summary: expect.stringMatching(/^succeeded ·/) }
    });

    const trace = presence.trace();
    expect(trace.map((record) => record.kind)).toEqual([
      "experience",
      "semantic_commit",
      "task_started",
      "experience",
      "semantic_pending",
      "task_held",
      "semantic_commit",
      "task_superseded",
      "task_started",
      "task_outcome"
    ]);
    expect(trace.map((record) => record.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const pendingTrace = trace[4];
    const heldTrace = trace[5];
    const decisionTrace = trace[6];
    const supersededTrace = trace[7];
    if (
      pendingTrace.kind !== "semantic_pending" ||
      heldTrace.kind !== "task_held" ||
      decisionTrace.kind !== "semantic_commit" ||
      supersededTrace.kind !== "task_superseded"
    ) {
      throw new Error("Deferred replacement trace kinds changed unexpectedly.");
    }
    expect(pendingTrace).toMatchObject({
      matterId: matter.id,
      attemptId: pending.attempt.attemptId,
      semanticEvidenceId: correction.id,
      semanticRevision: 3,
      heldRunId: redStarted.binding.runId,
      reusedExistingHold: false
    });
    expect(heldTrace).toMatchObject({
      matterId: matter.id,
      runId: redStarted.binding.runId,
      taskSemanticRevision: 2,
      reconsiderationSemanticRevision: 3,
      semanticEvidenceId: correction.id
    });
    expect(decisionTrace).toMatchObject({
      matterId: matter.id,
      proposalId: pendingTrace.proposalId,
      semanticEvidenceId: pendingTrace.semanticEvidenceId,
      fromRevision: 3,
      toRevision: 4,
      fromCourse: "fetch Red mug",
      toCourse: "fetch Blue mug"
    });
    expect(supersededTrace).toMatchObject({
      matterId: matter.id,
      runId: heldTrace.runId,
      taskSemanticRevision: 2,
      currentSemanticRevision: 4
    });
  });

  it("makes provider abandonment, retry hold reuse and explicit resume visible without inventing a second hold", () => {
    const { driver, presence, deferred, matter, redStarted } = createFixture();

    const correction = presence.receiveDirectPlayerSpeech("Wait — reconsider whether Red was right.");
    presence.advanceMatterFromEvidence(matter.id, correction.id);
    const first = deferred.beginReconsideration(matter.id);
    expect(first.status).toBe("pending");
    if (first.status !== "pending") return;

    expect(deferred.abandon(first.attempt)).toMatchObject({ status: "abandoned" });
    const retry = deferred.beginReconsideration(matter.id);
    expect(retry.status).toBe("pending");
    if (retry.status !== "pending") return;
    expect(retry.attempt.reusedExistingHold).toBe(true);

    const decision = deferred.settle(retry.attempt, { semanticCourse: "fetch Red mug" });
    expect(decision.status).toBe("applied");
    if (decision.status !== "applied") return;
    expect(deferred.resumeHeldTask(matter.id, decision).status).toBe("released");
    expect(runUntilOutcome(driver, presence)).toMatchObject({
      status: "recorded",
      evidence: { summary: expect.stringMatching(/^succeeded ·/) }
    });

    const trace = presence.trace();
    expect(trace.map((record) => record.kind)).toEqual([
      "experience",
      "semantic_commit",
      "task_started",
      "experience",
      "semantic_pending",
      "task_held",
      "semantic_attempt_ended",
      "semantic_pending",
      "semantic_commit",
      "task_resumed",
      "task_outcome"
    ]);
    expect(trace.filter((record) => record.kind === "task_held")).toHaveLength(1);

    const ended = trace.find((record) => record.kind === "semantic_attempt_ended");
    const retryPending = trace.filter((record) => record.kind === "semantic_pending")[1];
    const resumed = trace.find((record) => record.kind === "task_resumed");
    expect(ended).toMatchObject({
      kind: "semantic_attempt_ended",
      matterId: matter.id,
      attemptId: first.attempt.attemptId,
      heldRunId: redStarted.binding.runId,
      outcome: "abandoned",
      reason: "provider_abandoned:released"
    });
    expect(retryPending).toMatchObject({
      kind: "semantic_pending",
      matterId: matter.id,
      attemptId: retry.attempt.attemptId,
      heldRunId: redStarted.binding.runId,
      reusedExistingHold: true
    });
    expect(resumed).toMatchObject({
      kind: "task_resumed",
      matterId: matter.id,
      runId: redStarted.binding.runId
    });
  });

  it("records old provider supersession before admitting newer semantics while keeping the same mechanical hold", () => {
    const { presence, deferred, matter, redStarted } = createFixture();

    const firstCorrection = presence.receiveDirectPlayerSpeech("Actually, bring me the blue mug.");
    presence.advanceMatterFromEvidence(matter.id, firstCorrection.id);
    const first = deferred.beginReconsideration(matter.id);
    expect(first.status).toBe("pending");
    if (first.status !== "pending") return;

    const newerCorrection = presence.receiveDirectPlayerSpeech(
      "No — definitely Blue; use this newer correction."
    );
    presence.advanceMatterFromEvidence(matter.id, newerCorrection.id);
    const newer = deferred.beginReconsideration(matter.id);
    expect(newer.status).toBe("pending");
    if (newer.status !== "pending") return;

    const trace = presence.trace();
    expect(trace.map((record) => record.kind)).toEqual([
      "experience",
      "semantic_commit",
      "task_started",
      "experience",
      "semantic_pending",
      "task_held",
      "experience",
      "semantic_attempt_ended",
      "semantic_pending"
    ]);
    expect(trace.filter((record) => record.kind === "task_held")).toHaveLength(1);

    const ended = trace[7];
    const pending = trace[8];
    expect(ended).toMatchObject({
      kind: "semantic_attempt_ended",
      attemptId: first.attempt.attemptId,
      matterId: matter.id,
      heldRunId: redStarted.binding.runId,
      outcome: "superseded",
      reason: "semantic_revision_changed"
    });
    expect(pending).toMatchObject({
      kind: "semantic_pending",
      attemptId: newer.attempt.attemptId,
      matterId: matter.id,
      semanticEvidenceId: newerCorrection.id,
      heldRunId: redStarted.binding.runId,
      reusedExistingHold: true
    });
  });
});
