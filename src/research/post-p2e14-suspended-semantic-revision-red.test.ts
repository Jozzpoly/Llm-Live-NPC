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

describe("post-P2-E14 semantic revision while matter is already suspended RED", () => {
  it("can arm an exact semantic hold while suspended so an older task cannot auto-resume", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("Suspended-revision RED requires canonical NPC and mug.");
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
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.original" },
      summary: "player.jozz said: fetch the Red mug"
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
    if (!run) throw new Error("Suspended-revision RED requires exact run provenance.");
    resident.bindTask(matter.id, { taskId: `fetch:${mug.id}`, runId: run.runId });

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

    // E10 correctly prevents the already-suspended run from acting.
    const suspendedFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(suspendedFrame.executorActionResult).toBeNull();
    expect(inner.state()).toMatchObject({ status: "running", stepsUsed: 0, run: { runId: run.runId } });

    // Only now does new semantic evidence supersede the old task's grounding.
    const revision = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.revision" },
      summary: "player.jozz said: actually stop, do not fetch the mug"
    });
    resident.advanceSemanticContext(matter.id, revision.id);
    const ticket = resident.beginSemanticProposal(matter.id);

    // E9 is explicit orchestration authority, not an automatic scheduler. The
    // missing contract is the ability to arm the exact superseded run while E10
    // already supplies the mechanical pause. That semantic hold must then
    // survive the later activity resume.
    const armed = holds.arm(resident, executor, ticket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    // P2-E4/P2-E13 establish that semantic proposal authority may remain valid
    // while activity/focus state is suspended. A valid reconsideration can land.
    const decision = resident.commitSemanticProposal(ticket, {
      semanticCourse: "do not fetch the Red mug"
    });
    expect(decision.status).toBe("applied");
    expect(resident.matter(matter.id)).toMatchObject({
      status: "suspended",
      semanticCourse: "do not fetch the Red mug",
      activeTaskRunId: run.runId
    });

    resident.resolveMatter(interrupt.id);
    expect(resident.resumeMatter(matter.id)).toBe(true);

    // No semantic release was granted. Resuming activity therefore must not
    // silently resume the older task even though E10 no longer blocks it.
    const beforeResumeStepCount = inner.state().stepsUsed;
    const resumedFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });

    expect.soft(resumedFrame.executorActionResult).toBeNull();
    expect.soft(inner.state()).toMatchObject({
      status: "running",
      stepsUsed: beforeResumeStepCount,
      run: { runId: run.runId }
    });
    expect.soft(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });
    expect.soft(holds.holdForRun(run.runId)).toEqual(armed.hold);
  });
});
