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
    task: {
      kind: "approach-and-interact",
      actorId,
      targetId: matches[0].id
    }
  };
};

describe("post-P2-E15 whole-chain mid-task reconsideration audit", () => {
  it("carries a second grounded speech into semantic supersession and prevents the older running task from acting without explicit release", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("Whole-chain reconsideration probe requires canonical npc.001 and item.mug.");
    }
    // Keep the target far enough away that the first execution frame cannot
    // complete the task before the revision arrives.
    mug.position = { x: npc.position.x + 240, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([[npc.id, resident]])
    );
    const contexts = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const tasks = new P2E6GroundedTaskStartBoundary();
    const inner = new DeterministicExecutor();
    const holds = new P2E9SemanticReconsiderationHoldBoundary();
    const executor = new P2E9HoldAwareExecutor(inner, holds);
    const driver = new ExecutionDriver(world, executor);

    const initialSpeech = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the Red mug." },
      ({ observer }) => observer.id === npc.id
    );
    const initialEvidence = initialSpeech.residentEvidence[0]?.evidence;
    if (!initialEvidence) throw new Error("Initial grounded speech must reach resident continuity.");

    const matter = resident.openMatter({
      id: "matter.fetch-red-mug",
      originEvidenceId: initialEvidence.id,
      semanticCourse: "interpret the player's request"
    });
    const initialTicket = resident.beginSemanticProposal(matter.id);
    const initialContext = contexts.build(resident, initialTicket);
    expect(initialContext.status).toBe("ready");
    if (initialContext.status !== "ready") return;
    const initialProviderRun = provider.prepare(initialContext.context).run;
    const initialDecision = provider.settle(resident, initialProviderRun, {
      semanticCourse: "fetch Red mug"
    });
    expect(initialDecision.status).toBe("applied");
    if (initialDecision.status !== "applied") return;

    const grounded = tasks.prepare(
      resident,
      world.snapshot(),
      matter.id,
      npc.id,
      exactFetchLabelGrounder
    );
    expect(grounded.status).toBe("ready");
    if (grounded.status !== "ready") return;
    const started = tasks.start(
      resident,
      world.snapshot(),
      executor,
      grounded.candidate,
      { kind: "cognition", sessionId: 1, cycleId: 1 }
    );
    expect(started.status).toBe("started");
    if (started.status !== "started") return;

    const firstExecutionFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(firstExecutionFrame.executorActionResult).toBeNull();
    expect(inner.state()).toMatchObject({
      status: "running",
      stepsUsed: 1,
      run: { runId: started.executorRun.runId }
    });
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });

    // A second canonical occurrence enters as fresh grounded experience while
    // the old task is already mechanically running.
    const revisionSpeech = communication.speak(
      { speakerId: "player.jozz", text: "Actually stop. Do not fetch the mug." },
      ({ observer }) => observer.id === npc.id
    );
    expect(revisionSpeech.frame.occurrence.id).toBe("speech.2");
    const revisionEvidence = revisionSpeech.residentEvidence[0]?.evidence;
    if (!revisionEvidence) throw new Error("Revision speech must reach resident continuity.");
    expect(revisionEvidence.source).toMatchObject({
      kind: "actor",
      actorId: "player.jozz",
      occurrenceId: "speech.2"
    });

    // Attention remains explicit: receiving evidence is not itself semantic
    // invalidation. Once attributed to this matter, the old task's binding is
    // now semantically superseded and exact reconsideration authority is opened.
    const revisedMatter = resident.advanceSemanticContext(matter.id, revisionEvidence.id);
    expect(revisedMatter.semanticRevision).toBe(initialDecision.matter.semanticRevision + 1);
    expect(resident.taskBinding(started.executorRun.runId)).toMatchObject({
      matterId: matter.id,
      semanticRevision: initialDecision.matter.semanticRevision
    });

    const reconsiderationTicket = resident.beginSemanticProposal(matter.id);
    const armed = holds.arm(resident, executor, reconsiderationTicket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    const reconsiderationContext = contexts.build(resident, reconsiderationTicket);
    expect(reconsiderationContext.status).toBe("ready");
    if (reconsiderationContext.status !== "ready") return;
    expect(reconsiderationContext.context.semanticEvidence).toMatchObject({
      id: revisionEvidence.id,
      source: {
        kind: "actor",
        actorId: "player.jozz",
        occurrenceId: "speech.2"
      }
    });

    const reconsiderationRun = provider.prepare(reconsiderationContext.context).run;
    const reconsidered = provider.settle(resident, reconsiderationRun, {
      semanticCourse: "do not fetch Red mug"
    });
    expect(reconsidered.status).toBe("applied");
    if (reconsidered.status !== "applied") return;
    expect(reconsidered.matter).toMatchObject({
      id: matter.id,
      status: "active",
      semanticCourse: "do not fetch Red mug",
      activeTaskRunId: started.executorRun.runId
    });

    // The semantic decision alone is still a proposal-state change, not
    // execution authority. Without an explicit release, the exact old run stays
    // mechanically latched and cannot advance or alter World truth.
    const stepsBeforeHeldFrame = inner.state().stepsUsed;
    const npcBeforeHeldFrame = world.snapshot().entities.find((entity) => entity.id === npc.id);
    const heldFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });

    expect(heldFrame.executorActionResult).toBeNull();
    expect(inner.state()).toMatchObject({
      status: "running",
      stepsUsed: stepsBeforeHeldFrame,
      run: { runId: started.executorRun.runId }
    });
    expect(holds.holdForRun(started.executorRun.runId)).toEqual(armed.hold);
    expect(world.snapshot().entities.find((entity) => entity.id === npc.id)).toMatchObject({
      position: npcBeforeHeldFrame?.position
    });
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });
  });
});
