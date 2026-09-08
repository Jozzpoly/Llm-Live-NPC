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
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  if (
    !npc || npc.kind !== "npc" ||
    !red || red.kind !== "item" ||
    !player || player.kind !== "player"
  ) {
    throw new Error("Deferred Presence fixture requires player.jozz, npc.001 and item.mug.");
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
  const deferred = new FirstPresenceDeferredSemanticOwner(presence.resident, execution);

  const initial = presence.receiveDirectPlayerSpeech("Bring me the red mug.");
  const matter = presence.openMatterFromEvidence(initial.id);
  const initialDecision = presence.reconsiderMatter(matter.id);
  expect(initialDecision).toMatchObject({
    status: "applied",
    matter: { semanticCourse: "fetch Red mug", semanticRevision: 2 }
  });

  const started = presence.startMatterTask(matter.id);
  expect(started.status).toBe("started");
  if (started.status !== "started") throw new Error("Red task did not start.");

  driver.step({ playerControl: { moveX: 0, moveY: 0 } });
  return { world, execution, driver, presence, deferred, matter, started };
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

describe("First Presence deferred semantic owner", () => {
  it("keeps World/player time live while Blue reconsideration is pending, then explicitly replaces only the obsolete Red run", () => {
    const { world, execution, driver, presence, deferred, matter, started } = createFixture();

    const correction = presence.receiveDirectPlayerSpeech("Actually, bring me the blue mug.");
    presence.advanceMatterFromEvidence(matter.id, correction.id);

    const beforePending = world.snapshot();
    const npcBefore = beforePending.entities.find((entity) => entity.id === "npc.001");
    const playerBefore = beforePending.entities.find((entity) => entity.id === "player.jozz");
    if (!npcBefore || npcBefore.kind !== "npc" || !playerBefore || playerBefore.kind !== "player") {
      throw new Error("Actors disappeared before deferred reconsideration.");
    }

    const begun = deferred.beginReconsideration(matter.id);
    expect(begun.status).toBe("pending");
    if (begun.status !== "pending") return;
    expect(Object.isFrozen(begun.attempt)).toBe(true);
    expect(Object.isFrozen(begun.attempt.modelInput)).toBe(true);
    expect(begun.attempt).toMatchObject({
      matterId: matter.id,
      heldRunId: started.binding.runId,
      reusedExistingHold: false,
      modelInput: {
        currentSemanticCourse: "fetch Red mug",
        semanticEvidence: {
          kind: "heard",
          summary: expect.stringContaining("blue mug")
        }
      }
    });
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [
        {
          attemptId: begun.attempt.attemptId,
          matterId: matter.id,
          heldRunId: started.binding.runId,
          reusedExistingHold: false
        }
      ],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });

    const heldSteps = execution.executor.state().stepsUsed;
    for (let frame = 0; frame < 8; frame += 1) {
      driver.step({ playerControl: { moveX: 1, moveY: 0 } });
    }

    const duringPending = world.snapshot();
    const npcDuring = duringPending.entities.find((entity) => entity.id === "npc.001");
    const playerDuring = duringPending.entities.find((entity) => entity.id === "player.jozz");
    if (!npcDuring || npcDuring.kind !== "npc" || !playerDuring || playerDuring.kind !== "player") {
      throw new Error("Actors disappeared during deferred reconsideration.");
    }
    expect(duringPending.tick).toBe(beforePending.tick + 8);
    expect(playerDuring.position.x).toBeGreaterThan(playerBefore.position.x);
    expect(npcDuring.position).toEqual(npcBefore.position);
    expect(execution.executor.state()).toMatchObject({
      status: "running",
      stepsUsed: heldSteps,
      run: { runId: started.binding.runId }
    });

    const decision = deferred.settle(begun.attempt, { semanticCourse: "fetch Blue mug" });
    expect(decision).toMatchObject({
      status: "applied",
      matter: { id: matter.id, semanticCourse: "fetch Blue mug", semanticRevision: 4 }
    });
    if (decision.status !== "applied") return;
    expect(deferred.decisionIsCurrent(matter.id, decision)).toBe(true);
    expect(deferred.state().pendingAttempts).toEqual([]);

    const replaced = deferred.replaceHeldTask(matter.id, decision);
    expect(replaced).toMatchObject({
      status: "disposed",
      record: {
        matterId: matter.id,
        runId: started.binding.runId,
        taskId: "fetch:item.mug",
        taskSemanticRevision: 2,
        currentSemanticRevision: 4
      }
    });
    expect(deferred.state().heldRuns).toEqual([]);
    expect(execution.executor.state()).toMatchObject({ status: "idle" });
    expect(presence.resident.recentEvidence().filter((evidence) => evidence.kind === "task_outcome")).toEqual([]);

    const blueStarted = presence.startMatterTask(matter.id);
    expect(blueStarted.status).toBe("started");
    if (blueStarted.status !== "started") return;
    expect(execution.executor.state()).toMatchObject({
      status: "running",
      task: { kind: "approach-and-interact", targetId: "item.blue-mug" }
    });

    expect(runUntilOutcome(driver, presence)).toMatchObject({
      status: "recorded",
      evidence: { summary: expect.stringMatching(/^succeeded ·/) }
    });
    const final = world.snapshot();
    expect(final.entities.find((entity) => entity.id === "npc.001")).toMatchObject({
      kind: "npc",
      heldItemId: "item.blue-mug"
    });
    expect(final.entities.find((entity) => entity.id === "item.blue-mug")).toMatchObject({
      kind: "item",
      heldBy: "npc.001"
    });
    expect(final.entities.find((entity) => entity.id === "item.mug")).toMatchObject({
      kind: "item",
      heldBy: null
    });
  });

  it("keeps the old run held after provider abandonment, reuses that exact hold for retry and resumes only after an explicit current decision", () => {
    const { world, execution, driver, presence, deferred, matter, started } = createFixture();

    const correction = presence.receiveDirectPlayerSpeech(
      "Wait — is the red mug actually the one I meant?"
    );
    presence.advanceMatterFromEvidence(matter.id, correction.id);

    const first = deferred.beginReconsideration(matter.id);
    expect(first.status).toBe("pending");
    if (first.status !== "pending") return;

    const heldSteps = execution.executor.state().stepsUsed;
    for (let frame = 0; frame < 4; frame += 1) {
      driver.step({ playerControl: { moveX: 1, moveY: 0 } });
    }

    expect(deferred.abandon(first.attempt)).toEqual({
      status: "abandoned",
      attemptId: first.attempt.attemptId,
      matterId: matter.id,
      heldRunId: started.binding.runId,
      residentAuthority: "released"
    });
    expect(deferred.abandon(first.attempt)).toEqual({
      status: "attempt_rejected",
      reason: "unknown_attempt"
    });
    expect(presence.resident.pendingSemanticProposals()).toEqual([]);
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });

    const npcBeforeRetry = world.snapshot().entities.find((entity) => entity.id === "npc.001");
    if (!npcBeforeRetry || npcBeforeRetry.kind !== "npc") throw new Error("NPC missing before retry.");
    const tickBeforeRetry = world.snapshot().tick;
    for (let frame = 0; frame < 4; frame += 1) {
      driver.step({ playerControl: { moveX: 1, moveY: 0 } });
    }
    const afterWait = world.snapshot();
    const npcAfterWait = afterWait.entities.find((entity) => entity.id === "npc.001");
    if (!npcAfterWait || npcAfterWait.kind !== "npc") throw new Error("NPC missing during retry wait.");
    expect(afterWait.tick).toBe(tickBeforeRetry + 4);
    expect(npcAfterWait.position).toEqual(npcBeforeRetry.position);
    expect(execution.executor.state()).toMatchObject({
      status: "running",
      stepsUsed: heldSteps,
      run: { runId: started.binding.runId }
    });

    const retry = deferred.beginReconsideration(matter.id);
    expect(retry.status).toBe("pending");
    if (retry.status !== "pending") return;
    expect(retry.attempt.reusedExistingHold).toBe(true);
    expect(retry.attempt.attemptId).not.toBe(first.attempt.attemptId);
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [{ attemptId: retry.attempt.attemptId, reusedExistingHold: true }],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });

    const decision = deferred.settle(retry.attempt, { semanticCourse: "fetch Red mug" });
    expect(decision).toMatchObject({
      status: "applied",
      matter: { id: matter.id, semanticCourse: "fetch Red mug", semanticRevision: 4 }
    });
    if (decision.status !== "applied") return;

    const resumed = deferred.resumeHeldTask(matter.id, decision);
    expect(resumed).toMatchObject({
      status: "released",
      hold: { matterId: matter.id, runId: started.binding.runId }
    });
    expect(deferred.state()).toEqual({ pendingAttempts: [], heldRuns: [] });

    expect(runUntilOutcome(driver, presence)).toMatchObject({
      status: "recorded",
      evidence: { summary: expect.stringMatching(/^succeeded ·/) }
    });
    const final = world.snapshot();
    expect(final.entities.find((entity) => entity.id === "npc.001")).toMatchObject({
      kind: "npc",
      heldItemId: "item.mug"
    });
    expect(final.entities.find((entity) => entity.id === "item.mug")).toMatchObject({
      kind: "item",
      heldBy: "npc.001"
    });
  });

  it("bounds same-matter concurrency and lets newer semantic evidence supersede a pending attempt without opening an execution window", () => {
    const { execution, presence, deferred, matter, started } = createFixture();

    const firstCorrection = presence.receiveDirectPlayerSpeech("Actually, bring me the blue mug.");
    presence.advanceMatterFromEvidence(matter.id, firstCorrection.id);

    const first = deferred.beginReconsideration(matter.id);
    expect(first.status).toBe("pending");
    if (first.status !== "pending") return;
    expect(deferred.beginReconsideration(matter.id)).toEqual({
      status: "rejected",
      reason: "matter_attempt_pending"
    });

    const heldSteps = execution.executor.state().stepsUsed;
    const newerCorrection = presence.receiveDirectPlayerSpeech(
      "No — definitely the blue mug; ignore my earlier uncertainty."
    );
    expect(presence.advanceMatterFromEvidence(matter.id, newerCorrection.id)).toMatchObject({
      id: matter.id,
      semanticRevision: 4,
      activeTaskRunId: started.binding.runId
    });
    expect(presence.resident.pendingSemanticProposals()).toEqual([]);

    const newer = deferred.beginReconsideration(matter.id);
    expect(newer.status).toBe("pending");
    if (newer.status !== "pending") return;
    expect(newer.attempt).toMatchObject({
      heldRunId: started.binding.runId,
      reusedExistingHold: true,
      modelInput: {
        semanticEvidence: { summary: expect.stringContaining("definitely the blue mug") }
      }
    });
    expect(newer.attempt.attemptId).not.toBe(first.attempt.attemptId);
    expect(deferred.settle(first.attempt, { semanticCourse: "fetch Red mug" })).toEqual({
      status: "attempt_rejected",
      reason: "unknown_attempt"
    });
    expect(execution.executor.state()).toMatchObject({
      status: "running",
      stepsUsed: heldSteps,
      run: { runId: started.binding.runId }
    });
    expect(deferred.state()).toMatchObject({
      pendingAttempts: [{ attemptId: newer.attempt.attemptId, reusedExistingHold: true }],
      heldRuns: [{ matterId: matter.id, runId: started.binding.runId }]
    });

    const decision = deferred.settle(newer.attempt, { semanticCourse: "fetch Blue mug" });
    expect(decision).toMatchObject({
      status: "applied",
      matter: { id: matter.id, semanticCourse: "fetch Blue mug", semanticRevision: 5 }
    });
    if (decision.status !== "applied") return;
    expect(deferred.replaceHeldTask(matter.id, decision)).toMatchObject({
      status: "disposed",
      record: { runId: started.binding.runId, currentSemanticRevision: 5 }
    });
    expect(deferred.state()).toEqual({ pendingAttempts: [], heldRuns: [] });
  });
});
