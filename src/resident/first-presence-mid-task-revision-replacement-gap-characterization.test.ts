import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { P2E0ResidentCausalKernel } from "../research/p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "../research/p2-e2-communication-runtime-boundary";
import { P2E4SemanticProposalContextSeam } from "../research/p2-e4-semantic-proposal-context";
import { P2E5SemanticProviderAuthorityMembrane } from "../research/p2-e5-semantic-provider-authority-membrane";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder
} from "../research/p2-e6-grounded-task-start-causality";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "../research/p2-e9-semantic-reconsideration-hold";
import { P2E11TerminalMatterTaskDispositionBoundary } from "../research/p2-e11-terminal-matter-task-disposition";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

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

describe("First Presence mid-task semantic revision replacement gap characterization", () => {
  it("shows that a corrected active matter can hold its old task but cannot replace that superseded task without terminalizing the matter", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const redMug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !redMug || redMug.kind !== "item") {
      throw new Error("Mid-task revision fixture requires npc.001 and item.mug.");
    }

    redMug.position = { x: npc.position.x + 150, y: npc.position.y };
    specimen.entities.push({
      id: "item.blue-mug",
      kind: "item",
      label: "Blue mug",
      position: { x: npc.position.x - 150, y: npc.position.y },
      radius: 9,
      heldBy: null
    });

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const innerExecutor = new DeterministicExecutor();
    const holds = new P2E9SemanticReconsiderationHoldBoundary();
    const executor = new P2E9HoldAwareExecutor(innerExecutor, holds);
    const driver = new ExecutionDriver(world, executor);
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", resident]])
    );
    const contextSeam = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const taskStart = new P2E6GroundedTaskStartBoundary();
    const terminalDisposition = new P2E11TerminalMatterTaskDispositionBoundary();
    const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";

    const origin = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the red mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!origin) throw new Error("Mid-task revision fixture requires initial heard evidence.");

    const matter = resident.openMatter({
      id: "matter.fetch-mug",
      originEvidenceId: origin.id,
      semanticCourse: "uninterpreted"
    });

    const initialTicket = resident.beginSemanticProposal(matter.id);
    const initialContext = contextSeam.build(resident, initialTicket);
    expect(initialContext.status).toBe("ready");
    if (initialContext.status !== "ready") return;
    const initialRun = provider.prepare(initialContext.context).run;
    const initialDecision = provider.settle(resident, initialRun, {
      semanticCourse: "fetch Red mug"
    });
    expect(initialDecision.status).toBe("applied");
    if (initialDecision.status !== "applied") return;

    const preparedRed = taskStart.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(preparedRed.status).toBe("ready");
    if (preparedRed.status !== "ready") return;
    const startedRed = taskStart.start(
      resident,
      world.snapshot(),
      executor,
      preparedRed.candidate,
      { kind: "cognition" }
    );
    expect(startedRed.status).toBe("started");
    if (startedRed.status !== "started") return;

    driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: startedRed.binding.runId },
      task: { kind: "approach-and-interact", targetId: "item.mug" }
    });

    const correction = communication.speak(
      { speakerId: "player.jozz", text: "Actually, bring me the blue mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!correction) throw new Error("Mid-task revision fixture requires correction evidence.");

    const revised = resident.advanceSemanticContext(matter.id, correction.id);
    expect(revised).toMatchObject({
      status: "active",
      semanticRevision: 3,
      latestSemanticEvidenceId: correction.id,
      activeTaskRunId: startedRed.binding.runId
    });

    const correctionTicket = resident.beginSemanticProposal(matter.id);
    const armed = holds.arm(resident, executor, correctionTicket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    const heldSteps = executor.state().stepsUsed;
    driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(executor.state()).toMatchObject({
      status: "running",
      stepsUsed: heldSteps,
      run: { runId: startedRed.binding.runId }
    });

    const correctionContext = contextSeam.build(resident, correctionTicket);
    expect(correctionContext.status).toBe("ready");
    if (correctionContext.status !== "ready") return;
    const correctionRun = provider.prepare(correctionContext.context).run;
    const correctionDecision = provider.settle(resident, correctionRun, {
      semanticCourse: "fetch Blue mug"
    });
    expect(correctionDecision.status).toBe("applied");
    if (correctionDecision.status !== "applied") return;

    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Blue mug",
      semanticRevision: 4,
      activeTaskRunId: startedRed.binding.runId
    });

    const prepareReplacement = taskStart.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(prepareReplacement).toEqual({
      status: "rejected",
      reason: "matter_has_active_task"
    });

    expect(terminalDisposition.dispose(resident, executor, matter.id)).toEqual({
      status: "rejected",
      reason: "matter_not_terminal"
    });

    expect(holds.holdForRun(startedRed.binding.runId)).toEqual(armed.hold);
    expect(executor.state()).toMatchObject({
      status: "running",
      run: { runId: startedRed.binding.runId },
      task: { kind: "approach-and-interact", targetId: "item.mug" }
    });

    // The current substrate can pause the superseded red-mug task and can later
    // resume that exact old run, but it has no non-terminal replacement/discard
    // operation that releases this binding so the new Blue-mug task can start.
  });
});
