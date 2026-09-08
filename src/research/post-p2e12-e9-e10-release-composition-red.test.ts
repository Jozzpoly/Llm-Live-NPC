import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "./p2-e9-semantic-reconsideration-hold";
import { P2E10MatterSuspensionAwareExecutor } from "./p2-e10-matter-suspension-execution-causality";

describe("post-P2-E12 E9/E10 lifecycle composition", () => {
  it("can release a completed semantic reconsideration after an activity-only suspend/resume round trip", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("Composition RED requires canonical NPC and mug.");
    }
    mug.position = { x: npc.position.x + 36, y: npc.position.y };

    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const inner = new DeterministicExecutor();
    const holds = new P2E9SemanticReconsiderationHoldBoundary();
    const executor = new P2E10MatterSuspensionAwareExecutor(
      new P2E9HoldAwareExecutor(inner, holds),
      resident
    );
    const driver = new ExecutionDriver(world, executor);

    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.origin" },
      summary: "player.jozz said: bring me the Red mug"
    });
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch Red mug"
    });

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: npc.id, targetId: mug.id },
        { kind: "cognition" }
      )
    ).toBe(true);
    const run = executor.state().run;
    if (!run) throw new Error("Composition RED requires executor run provenance.");
    resident.bindTask(matter.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

    const revision = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.revision" },
      summary: "player.jozz said: actually, reconsider that request"
    });
    resident.advanceSemanticContext(matter.id, revision.id);
    const ticket = resident.beginSemanticProposal(matter.id);
    const armed = holds.arm(resident, executor, ticket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    const interruptOrigin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.other", occurrenceId: "speech.interrupt" },
      summary: "player.other said: come here first"
    });
    const interrupt = resident.openMatter({
      id: "matter.interrupt",
      originEvidenceId: interruptOrigin.id,
      semanticCourse: "respond to player.other"
    });
    resident.suspendMatter(matter.id, interrupt.id);

    // P2-E4 deliberately established that activity/focus status is not part of
    // the semantic proposal dependency. Therefore a semantically current result
    // is allowed to commit while the matter is suspended.
    const decision = resident.commitSemanticProposal(ticket, {
      semanticCourse: "fetch Red mug"
    });
    expect(decision.status).toBe("applied");
    if (decision.status !== "applied") return;
    expect(decision.matter.status).toBe("suspended");

    // Mechanical execution remains stopped while both reconsideration and
    // suspension are active.
    const heldFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(heldFrame.executorActionResult).toBeNull();
    expect(inner.state()).toMatchObject({ status: "running", run: { runId: run.runId } });

    // Release is correctly refused while the matter is still suspended.
    expect(holds.release(resident, executor, armed.hold, decision)).toEqual({
      status: "rejected",
      reason: "matter_not_active"
    });

    resident.resolveMatter(interrupt.id);
    expect(resident.resumeMatter(matter.id)).toBe(true);
    expect(resident.matter(matter.id)).toMatchObject({
      status: "active",
      suspendedByMatterId: null,
      semanticRevision: decision.matter.semanticRevision,
      activeTaskRunId: run.runId
    });

    // The semantic decision is still the current decision for this matter; only
    // activity/focus state made a legal suspended -> active round trip. The
    // exact held run should therefore now be releasable without manufacturing a
    // second semantic proposal merely to refresh a status snapshot.
    expect(holds.release(resident, executor, armed.hold, decision)).toEqual({
      status: "released",
      hold: armed.hold
    });

    const resumedFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(resumedFrame.executorActionResult).toMatchObject({
      status: "succeeded",
      actorId: npc.id,
      targetId: mug.id
    });
  });
});
