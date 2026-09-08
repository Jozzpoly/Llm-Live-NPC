import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { P2E0ResidentCausalKernel } from "../research/p2-e0-resident-causal-kernel";
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

describe("First Presence pending semantic retry characterization", () => {
  it("keeps the exact obsolete run safely held after provider abandonment and lets a later current retry decision explicitly resume it", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const redMug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !redMug || redMug.kind !== "item") {
      throw new Error("Async retry fixture requires npc.001 and item.mug.");
    }
    redMug.position = { x: npc.position.x + 180, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const innerExecutor = new DeterministicExecutor();
    const holds = new P2E9SemanticReconsiderationHoldBoundary();
    const executor = new P2E9HoldAwareExecutor(innerExecutor, holds);
    const driver = new ExecutionDriver(world, executor);
    const contextSeam = new P2E4SemanticProposalContextSeam();
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const taskStart = new P2E6GroundedTaskStartBoundary();
    const taskOutcome = new P2E7GroundedTaskOutcomeBoundary();

    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "player.jozz said: Bring me the red mug."
    });
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

    const prepared = taskStart.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    const started = taskStart.start(
      resident,
      world.snapshot(),
      executor,
      prepared.candidate,
      { kind: "cognition" }
    );
    expect(started.status).toBe("started");
    if (started.status !== "started") return;

    driver.step({ playerControl: { moveX: 0, moveY: 0 } });

    const reconsiderationEvidence = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz" },
      summary: "player.jozz said: Wait — is the red mug actually the one I meant?"
    });
    resident.advanceSemanticContext(matter.id, reconsiderationEvidence.id);

    const failedTicket = resident.beginSemanticProposal(matter.id);
    const failedContext = contextSeam.build(resident, failedTicket);
    expect(failedContext.status).toBe("ready");
    if (failedContext.status !== "ready") return;
    const failedRun = provider.prepare(failedContext.context).run;

    const armed = holds.arm(resident, executor, failedTicket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    const heldRunId = started.binding.runId;
    const heldSteps = executor.state().stepsUsed;
    for (let frame = 0; frame < 4; frame += 1) {
      driver.step({ playerControl: { moveX: 1, moveY: 0 } });
    }
    expect(executor.state()).toMatchObject({
      status: "running",
      stepsUsed: heldSteps,
      run: { runId: heldRunId }
    });

    // The first remote/provider attempt is abandoned: resident proposal
    // authority is released, but the old mechanical run must not silently resume
    // merely because cognition failed.
    const abandoned = provider.abandon(resident, failedRun);
    expect(abandoned).toEqual({
      status: "abandoned",
      residentAuthority: "released"
    });
    expect(resident.pendingSemanticProposals()).toEqual([]);
    expect(holds.holdForRun(heldRunId)).toEqual(armed.hold);

    const npcHeldStart = world.snapshot().entities.find((entity) => entity.id === "npc.001");
    if (!npcHeldStart || npcHeldStart.kind !== "npc") throw new Error("NPC missing after abandonment.");
    const tickAfterAbandon = world.snapshot().tick;
    for (let frame = 0; frame < 4; frame += 1) {
      driver.step({ playerControl: { moveX: 1, moveY: 0 } });
    }
    const afterAbandonFrames = world.snapshot();
    const npcHeldEnd = afterAbandonFrames.entities.find((entity) => entity.id === "npc.001");
    if (!npcHeldEnd || npcHeldEnd.kind !== "npc") throw new Error("NPC missing during retry wait.");
    expect(afterAbandonFrames.tick).toBe(tickAfterAbandon + 4);
    expect(npcHeldEnd.position).toEqual(npcHeldStart.position);
    expect(executor.state()).toMatchObject({
      status: "running",
      stepsUsed: heldSteps,
      run: { runId: heldRunId }
    });

    // A later retry is a new exact proposal attempt over the still-current
    // semantic dependency. It concludes that the original Red course remains
    // correct. This current decision can explicitly release the pre-existing
    // held run; no second hold is needed and no old provider authority revives.
    const retryTicket = resident.beginSemanticProposal(matter.id);
    expect(retryTicket).not.toEqual(failedTicket);
    const retryContext = contextSeam.build(resident, retryTicket);
    expect(retryContext.status).toBe("ready");
    if (retryContext.status !== "ready") return;
    const retryRun = provider.prepare(retryContext.context).run;
    const retryDecision = provider.settle(resident, retryRun, {
      semanticCourse: "fetch Red mug"
    });
    expect(retryDecision.status).toBe("applied");
    if (retryDecision.status !== "applied") return;

    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Red mug",
      semanticRevision: 4,
      activeTaskRunId: heldRunId
    });
    expect(holds.release(resident, executor, armed.hold, retryDecision)).toEqual({
      status: "released",
      hold: armed.hold
    });
    expect(holds.holdForRun(heldRunId)).toBeNull();

    let outcomeRecorded = false;
    for (let frame = 0; frame < 120 && !outcomeRecorded; frame += 1) {
      const result = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      const state = executor.state();
      if (
        (state.status === "succeeded" || state.status === "failed") &&
        state.run?.runId === heldRunId
      ) {
        const outcome = taskOutcome.reconcile(resident, executor, result);
        if (outcome.status === "recorded") outcomeRecorded = true;
      }
    }
    expect(outcomeRecorded).toBe(true);

    const final = world.snapshot();
    const finalNpc = final.entities.find((entity) => entity.id === "npc.001");
    const finalRed = final.entities.find((entity) => entity.id === "item.mug");
    expect(finalNpc).toMatchObject({ kind: "npc", heldItemId: "item.mug" });
    expect(finalRed).toMatchObject({ kind: "item", heldBy: "npc.001" });
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      semanticCourse: "fetch Red mug",
      activeTaskRunId: null
    });
  });
});
