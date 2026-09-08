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

describe("first product-adjacent Presence composition", () => {
  it("joins one explicitly admitted grounded request through the canonical execution driver and factual outcome", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("First Presence fixture requires npc.001 and item.mug.");
    }
    mug.position = { x: npc.position.x + 36, y: npc.position.y };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    const owner = new FirstPresenceComposition(
      world,
      executor,
      (input) => {
        expect(input).toMatchObject({
          currentSemanticCourse: "uninterpreted",
          semanticEvidence: {
            kind: "heard",
            source: { kind: "actor", actorId: "player.jozz" },
            summary: "player.jozz said: Bring me the red mug."
          }
        });
        return { semanticCourse: "fetch Red mug" };
      },
      exactFetchLabelGrounder
    );

    const heard = owner.receiveDirectPlayerSpeech("Bring me the red mug.");
    expect(heard).toMatchObject({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "player.jozz said: Bring me the red mug."
    });
    expect(owner.trace()).toEqual([]);

    // Matter admission is an explicit caller decision. Hearing alone did not
    // silently promote the utterance into an unresolved resident consequence.
    const matter = owner.openMatterFromEvidence(heard.id);
    expect(matter).toMatchObject({
      id: "matter.presence.1",
      semanticCourse: "uninterpreted",
      semanticRevision: 1,
      latestSemanticEvidenceId: heard.id,
      status: "active"
    });

    const semantic = owner.reconsiderMatter(matter.id);
    expect(semantic).toMatchObject({
      status: "applied",
      matter: {
        id: matter.id,
        semanticCourse: "fetch Red mug",
        semanticRevision: 2,
        latestSemanticEvidenceId: heard.id,
        status: "active"
      }
    });

    const started = owner.startMatterTask(matter.id);
    expect(started.status).toBe("started");
    if (started.status !== "started") return;

    let recordedOutcome: ReturnType<typeof owner.afterExecutionFrame> = null;
    for (let step = 0; step < 120; step += 1) {
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      const outcome = owner.afterExecutionFrame(frame);
      if (outcome?.status === "recorded") {
        recordedOutcome = outcome;
        break;
      }
    }

    expect(recordedOutcome).not.toBeNull();
    if (!recordedOutcome || recordedOutcome.status !== "recorded") return;
    expect(recordedOutcome.evidence).toMatchObject({
      kind: "task_outcome",
      source: { kind: "task", runId: started.binding.runId }
    });

    // Mechanical success becomes factual resident evidence, but the composition
    // deliberately does not claim semantic satisfaction or terminalize the matter.
    expect(owner.resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Red mug",
      semanticRevision: 2,
      latestSemanticEvidenceId: heard.id,
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: recordedOutcome.evidence.id
    });

    const trace = owner.trace();
    expect(trace.map((record) => record.kind)).toEqual([
      "experience",
      "semantic_commit",
      "task_started",
      "task_outcome"
    ]);

    const experience = trace[0];
    const semanticCommit = trace[1];
    const taskStarted = trace[2];
    const taskOutcome = trace[3];
    expect(experience.kind).toBe("experience");
    expect(semanticCommit.kind).toBe("semantic_commit");
    expect(taskStarted.kind).toBe("task_started");
    expect(taskOutcome.kind).toBe("task_outcome");
    if (
      experience.kind !== "experience" ||
      semanticCommit.kind !== "semantic_commit" ||
      taskStarted.kind !== "task_started" ||
      taskOutcome.kind !== "task_outcome"
    ) {
      return;
    }

    expect(experience).toMatchObject({
      matterId: matter.id,
      evidenceId: heard.id
    });
    expect(semanticCommit).toMatchObject({
      matterId: matter.id,
      semanticEvidenceId: experience.evidenceId,
      fromRevision: 1,
      toRevision: 2,
      fromCourse: "uninterpreted",
      toCourse: "fetch Red mug"
    });
    expect(taskStarted).toMatchObject({
      matterId: matter.id,
      runId: started.binding.runId,
      semanticRevision: semanticCommit.toRevision
    });
    expect(taskOutcome).toMatchObject({
      matterId: matter.id,
      runId: taskStarted.runId,
      evidenceId: recordedOutcome.evidence.id
    });
    expect(trace.map((record) => record.seq)).toEqual([1, 2, 3, 4]);
  });

  it("releases exact proposal authority when the deterministic semantic provider throws", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();
    const owner = new FirstPresenceComposition(
      world,
      executor,
      () => {
        throw new Error("synthetic provider failure");
      },
      exactFetchLabelGrounder
    );

    const heard = owner.receiveDirectPlayerSpeech("Bring me the red mug.");
    const matter = owner.openMatterFromEvidence(heard.id);
    const result = owner.reconsiderMatter(matter.id);

    expect(result).toEqual({
      status: "provider_exception",
      residentAuthority: "released"
    });
    expect(owner.resident.pendingSemanticProposals()).toEqual([]);
    expect(owner.resident.recentSemanticProposalRevocations()).toEqual([]);
    expect(owner.resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "uninterpreted",
      semanticRevision: 1,
      latestSemanticEvidenceId: heard.id
    });
    expect(owner.trace().map((record) => record.kind)).toEqual(["experience"]);
  });

  it("abandons rejected provider output because Slice 1 exposes no retry owner", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();
    const owner = new FirstPresenceComposition(
      world,
      executor,
      () => ({ semanticCourse: "   " }),
      exactFetchLabelGrounder
    );

    const heard = owner.receiveDirectPlayerSpeech("Bring me the red mug.");
    const matter = owner.openMatterFromEvidence(heard.id);
    const result = owner.reconsiderMatter(matter.id);

    expect(result).toEqual({
      status: "provider_output_rejected",
      reason: "invalid_semantic_course"
    });
    expect(owner.resident.pendingSemanticProposals()).toEqual([]);
    expect(owner.resident.recentSemanticProposalRevocations()).toEqual([]);
    expect(owner.resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "uninterpreted",
      semanticRevision: 1,
      latestSemanticEvidenceId: heard.id
    });
    expect(owner.trace().map((record) => record.kind)).toEqual(["experience"]);
  });
});
