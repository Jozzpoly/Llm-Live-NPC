import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import { P2E5SemanticProviderAuthorityMembrane } from "./p2-e5-semantic-provider-authority-membrane";
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

describe("post-P2-E15 whole-chain composition audit", () => {
  it("preserves one causal trace from grounded speech through resident semantics, grounded execution, World effect and factual outcome evidence", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("Whole-chain composition probe requires canonical npc.001 and item.mug.");
    }
    mug.position = { x: npc.position.x + 36, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([[npc.id, resident]])
    );
    const contextBoundary = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const taskStart = new P2E6GroundedTaskStartBoundary();
    const outcome = new P2E7GroundedTaskOutcomeBoundary();
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);

    // One canonical world-grounded communication occurrence becomes this
    // resident's situated evidence without entering World.recentEvents().
    const worldEventsBeforeSpeech = world.recentEvents(128);
    const spoken = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the Red mug." },
      ({ observer }) => observer.id === npc.id
    );
    expect(spoken.frame.occurrence.id).toBe("speech.1");
    expect(world.recentEvents(128)).toEqual(worldEventsBeforeSpeech);
    expect(spoken.residentEvidence).toHaveLength(1);
    const heard = spoken.residentEvidence[0].evidence;
    expect(heard).toMatchObject({
      kind: "heard",
      matterId: null,
      source: {
        kind: "actor",
        actorId: "player.jozz",
        occurrenceId: spoken.frame.occurrence.id
      }
    });

    // Attention/matter-selection policy is deliberately outside the current
    // research chain, so the probe makes that one owner decision explicitly.
    const matter = resident.openMatter({
      id: "matter.fetch-red-mug",
      originEvidenceId: heard.id,
      semanticCourse: "interpret the player's request"
    });
    expect(matter).toMatchObject({
      originEvidenceId: heard.id,
      latestSemanticEvidenceId: heard.id,
      semanticRevision: 1,
      status: "active"
    });

    // The bounded provider seam sees only selected semantic content and returns
    // a proposal; private resident authority remains outside the model-visible run.
    const ticket = resident.beginSemanticProposal(matter.id);
    const built = contextBoundary.build(resident, ticket);
    expect(built.status).toBe("ready");
    if (built.status !== "ready") return;
    expect(built.context.proposal).toEqual(ticket);
    expect(built.context.semanticEvidence.id).toBe(heard.id);
    expect(built.context.semanticEvidence.source).toMatchObject({
      kind: "actor",
      actorId: "player.jozz",
      occurrenceId: spoken.frame.occurrence.id
    });

    const preparedProvider = provider.prepare(built.context);
    expect(preparedProvider.run.modelInput).toEqual({
      currentSemanticCourse: "interpret the player's request",
      semanticEvidence: {
        kind: "heard",
        source: { kind: "actor", actorId: "player.jozz" },
        summary: heard.summary
      }
    });
    const semanticDecision = provider.settle(resident, preparedProvider.run, {
      semanticCourse: "fetch Red mug"
    });
    expect(semanticDecision.status).toBe("applied");
    if (semanticDecision.status !== "applied") return;
    expect(semanticDecision.matter).toMatchObject({
      id: matter.id,
      semanticCourse: "fetch Red mug",
      semanticRevision: ticket.semanticRevision + 1,
      latestSemanticEvidenceId: heard.id,
      activeTaskRunId: null
    });

    // Local grounding re-enters current World truth and binds the exact semantic
    // revision that authorized the task to the executor's exact run identity.
    const grounded = taskStart.prepare(
      resident,
      world.snapshot(),
      matter.id,
      npc.id,
      exactFetchLabelGrounder
    );
    expect(grounded.status).toBe("ready");
    if (grounded.status !== "ready") return;
    const started = taskStart.start(
      resident,
      world.snapshot(),
      executor,
      grounded.candidate,
      { kind: "cognition", sessionId: "audit.whole-chain", cycleId: 1 }
    );
    expect(started.status).toBe("started");
    if (started.status !== "started") return;
    expect(started.binding).toMatchObject({
      matterId: matter.id,
      taskId: `fetch:${mug.id}`,
      semanticRevision: semanticDecision.matter.semanticRevision
    });
    expect(started.executorRun).toMatchObject({
      runId: started.binding.runId,
      cause: { kind: "cognition", sessionId: "audit.whole-chain", cycleId: 1 }
    });

    const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(frame.executorActionRun).toEqual(started.executorRun);
    expect(frame.executorActionResult).toMatchObject({
      status: "succeeded",
      actorId: npc.id,
      targetId: mug.id,
      code: "picked_up_item"
    });
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: npc.id
    });

    // The factual World/executor result returns to resident continuity as
    // task_outcome evidence. It does not silently claim semantic satisfaction.
    const reconciled = outcome.reconcile(resident, executor, frame);
    expect(reconciled.status).toBe("recorded");
    if (reconciled.status !== "recorded") return;
    expect(reconciled.evidence).toMatchObject({
      kind: "task_outcome",
      source: { kind: "task", runId: started.executorRun.runId },
      matterId: matter.id
    });
    expect(reconciled.evidence.summary).toContain("picked_up_item");
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Red mug",
      semanticRevision: semanticDecision.matter.semanticRevision,
      latestSemanticEvidenceId: heard.id,
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: reconciled.evidence.id
    });
    expect(resident.taskBinding(started.executorRun.runId)).toBeNull();
  });
});
