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
import { P2E7GroundedTaskOutcomeBoundary } from "../research/p2-e7-grounded-task-outcome-causality";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "../research/p2-e9-semantic-reconsideration-hold";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { SupersededTaskDispositionBoundary } from "./superseded-task-disposition";

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

describe("First Presence deterministic async reconsideration timing characterization", () => {
  it("holds the obsolete NPC run while semantic authority remains pending, keeps World/player time live, then replaces the task after the current decision lands", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const redMug = specimen.entities.find((entity) => entity.id === "item.mug");
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    if (
      !npc || npc.kind !== "npc" ||
      !redMug || redMug.kind !== "item" ||
      !player || player.kind !== "player"
    ) {
      throw new Error("Async timing fixture requires player.jozz, npc.001 and item.mug.");
    }

    redMug.position = { x: npc.position.x + 220, y: npc.position.y };
    specimen.entities.push({
      id: "item.blue-mug",
      kind: "item",
      label: "Blue mug",
      position: { x: npc.position.x - 110, y: npc.position.y },
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
    const taskOutcome = new P2E7GroundedTaskOutcomeBoundary();
    const disposition = new SupersededTaskDispositionBoundary();
    const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";

    const initialHeard = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the red mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!initialHeard) throw new Error("Initial speech was not heard by npc.001.");

    const matter = resident.openMatter({
      id: "matter.fetch-mug",
      originEvidenceId: initialHeard.id,
      semanticCourse: "uninterpreted"
    });
    const initialTicket = resident.beginSemanticProposal(matter.id);
    const initialContext = contextSeam.build(resident, initialTicket);
    expect(initialContext.status).toBe("ready");
    if (initialContext.status !== "ready") return;
    const initialProviderRun = provider.prepare(initialContext.context).run;
    const initialDecision = provider.settle(resident, initialProviderRun, {
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
    const beforeCorrection = world.snapshot();
    const npcBeforeCorrection = beforeCorrection.entities.find((entity) => entity.id === "npc.001");
    if (!npcBeforeCorrection || npcBeforeCorrection.kind !== "npc") {
      throw new Error("NPC disappeared before correction.");
    }

    const correction = communication.speak(
      { speakerId: "player.jozz", text: "Actually, bring me the blue mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!correction) throw new Error("Correction speech was not heard by npc.001.");
    resident.advanceSemanticContext(matter.id, correction.id);

    const correctionTicket = resident.beginSemanticProposal(matter.id);
    const correctionContext = contextSeam.build(resident, correctionTicket);
    expect(correctionContext.status).toBe("ready");
    if (correctionContext.status !== "ready") return;

    // Preparing the local provider run establishes exact pending semantic
    // authority. We deliberately do not settle it yet: this is the deterministic
    // stand-in for a slow remote model request.
    const pendingProviderRun = provider.prepare(correctionContext.context).run;
    const armed = holds.arm(resident, executor, correctionTicket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    const heldRunId = startedRed.binding.runId;
    const heldSteps = executor.state().stepsUsed;
    const heldTickStart = world.snapshot().tick;
    const heldPlayerStart = world.snapshot().entities.find((entity) => entity.id === "player.jozz");
    const heldNpcStart = world.snapshot().entities.find((entity) => entity.id === "npc.001");
    if (!heldPlayerStart || heldPlayerStart.kind !== "player" || !heldNpcStart || heldNpcStart.kind !== "npc") {
      throw new Error("Actors disappeared before held interval.");
    }

    for (let frame = 0; frame < 8; frame += 1) {
      driver.step({ playerControl: { moveX: 1, moveY: 0 } });
    }

    const duringPending = world.snapshot();
    const heldPlayerEnd = duringPending.entities.find((entity) => entity.id === "player.jozz");
    const heldNpcEnd = duringPending.entities.find((entity) => entity.id === "npc.001");
    if (!heldPlayerEnd || heldPlayerEnd.kind !== "player" || !heldNpcEnd || heldNpcEnd.kind !== "npc") {
      throw new Error("Actors disappeared during held interval.");
    }

    expect(duringPending.tick).toBe(heldTickStart + 8);
    expect(heldPlayerEnd.position.x).toBeGreaterThan(heldPlayerStart.position.x);
    expect(heldNpcEnd.position).toEqual(heldNpcStart.position);
    expect(executor.state()).toMatchObject({
      status: "running",
      stepsUsed: heldSteps,
      run: { runId: heldRunId },
      task: { kind: "approach-and-interact", targetId: "item.mug" }
    });
    expect(resident.pendingSemanticProposals()).toContainEqual(correctionTicket);
    expect(holds.holdForRun(heldRunId)).toEqual(armed.hold);

    // The delayed semantic response now arrives. Only at this point does the
    // semantic matter gain its new decision; elapsed World time did not decide it.
    const correctionDecision = provider.settle(resident, pendingProviderRun, {
      semanticCourse: "fetch Blue mug"
    });
    expect(correctionDecision.status).toBe("applied");
    if (correctionDecision.status !== "applied") return;
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Blue mug",
      semanticRevision: 4,
      activeTaskRunId: heldRunId
    });

    const disposed = disposition.dispose(
      resident,
      executor,
      matter.id,
      correctionDecision
    );
    expect(disposed).toMatchObject({
      status: "disposed",
      record: {
        runId: heldRunId,
        taskId: "fetch:item.mug",
        taskSemanticRevision: 2,
        currentSemanticRevision: 4
      }
    });
    expect(holds.holdForRun(heldRunId)).toBeNull();
    expect(executor.state()).toMatchObject({ status: "idle" });
    expect(resident.taskBinding(heldRunId)).toBeNull();
    expect(resident.recentEvidence().filter((evidence) => evidence.kind === "task_outcome")).toEqual([]);

    const preparedBlue = taskStart.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(preparedBlue.status).toBe("ready");
    if (preparedBlue.status !== "ready") return;
    const startedBlue = taskStart.start(
      resident,
      world.snapshot(),
      executor,
      preparedBlue.candidate,
      { kind: "cognition" }
    );
    expect(startedBlue.status).toBe("started");
    if (startedBlue.status !== "started") return;

    let outcomeRecorded = false;
    for (let frame = 0; frame < 120 && !outcomeRecorded; frame += 1) {
      const result = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      const executorState = executor.state();
      if (
        (executorState.status === "succeeded" || executorState.status === "failed") &&
        executorState.run?.runId === startedBlue.binding.runId
      ) {
        const outcome = taskOutcome.reconcile(resident, executor, result);
        if (outcome.status === "recorded") outcomeRecorded = true;
      }
    }
    expect(outcomeRecorded).toBe(true);

    const final = world.snapshot();
    const finalNpc = final.entities.find((entity) => entity.id === "npc.001");
    const finalRed = final.entities.find((entity) => entity.id === "item.mug");
    const finalBlue = final.entities.find((entity) => entity.id === "item.blue-mug");
    expect(finalNpc).toMatchObject({ kind: "npc", heldItemId: "item.blue-mug" });
    expect(finalBlue).toMatchObject({ kind: "item", heldBy: "npc.001" });
    expect(finalRed).toMatchObject({ kind: "item", heldBy: null });
  });
});
