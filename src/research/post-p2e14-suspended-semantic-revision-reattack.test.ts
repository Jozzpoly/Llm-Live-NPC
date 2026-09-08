import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "./p2-e9-semantic-reconsideration-hold";
import { P2E10MatterSuspensionAwareExecutor } from "./p2-e10-matter-suspension-execution-causality";
import { P2E11TerminalMatterTaskDispositionBoundary } from "./p2-e11-terminal-matter-task-disposition";

function openMatter(resident: P2E0ResidentCausalKernel, id: string) {
  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: `${id}.origin` },
    summary: `open ${id}`
  });
  return resident.openMatter({
    id,
    originEvidenceId: origin.id,
    semanticCourse: `handle ${id}`
  });
}

function createSuspendedRunningFixture(suffix: string) {
  const resident = new P2E0ResidentCausalKernel();
  const inner = new DeterministicExecutor();
  const holds = new P2E9SemanticReconsiderationHoldBoundary();
  const holdAware = new P2E9HoldAwareExecutor(inner, holds);
  const executor = new P2E10MatterSuspensionAwareExecutor(holdAware, resident);

  const matter = openMatter(resident, `matter.${suffix}`);
  expect(
    executor.start(
      { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" },
      { kind: "cognition" }
    )
  ).toBe(true);
  const run = executor.state().run;
  if (!run) throw new Error("P2-E15 re-attack requires a running exact run.");
  resident.bindTask(matter.id, { taskId: "fetch:item.mug", runId: run.runId });

  const interrupt = openMatter(resident, `matter.${suffix}.interrupt`);
  resident.suspendMatter(matter.id, interrupt.id);
  expect(resident.matter(matter.id)).toMatchObject({
    status: "suspended",
    suspendedByMatterId: interrupt.id,
    activeTaskRunId: run.runId
  });

  return { resident, inner, holds, executor, matter, interrupt, run };
}

function supersedeWhileSuspended(
  fixture: ReturnType<typeof createSuspendedRunningFixture>,
  occurrenceId: string
) {
  const revision = fixture.resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId },
    summary: "player.jozz changed the request while this matter was suspended"
  });
  fixture.resident.advanceSemanticContext(fixture.matter.id, revision.id);
  return fixture.resident.beginSemanticProposal(fixture.matter.id);
}

describe("post-P2-E14 suspended-time semantic revision re-attack", () => {
  it("does not arm a suspended run when its task semantic revision is still current", () => {
    const fixture = createSuspendedRunningFixture("same-revision");
    const ticket = fixture.resident.beginSemanticProposal(fixture.matter.id);

    expect(fixture.holds.arm(fixture.resident, fixture.executor, ticket)).toEqual({
      status: "rejected",
      reason: "task_not_semantically_superseded"
    });
    expect(fixture.holds.holdForRun(fixture.run.runId)).toBeNull();
    expect(fixture.inner.state()).toMatchObject({
      status: "running",
      stepsUsed: 0,
      run: { runId: fixture.run.runId }
    });
  });

  it("keeps suspended-time hold authority through commit and only releases after legal resume", () => {
    const fixture = createSuspendedRunningFixture("release");
    const ticket = supersedeWhileSuspended(fixture, "speech.release.revision");
    const armed = fixture.holds.arm(fixture.resident, fixture.executor, ticket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    const decision = fixture.resident.commitSemanticProposal(ticket, {
      semanticCourse: "do not fetch the mug"
    });
    expect(decision.status).toBe("applied");
    if (decision.status !== "applied") return;
    expect(decision.matter.status).toBe("suspended");

    expect(
      fixture.holds.release(fixture.resident, fixture.executor, armed.hold, decision)
    ).toEqual({
      status: "rejected",
      reason: "matter_not_active"
    });
    expect(fixture.holds.holdForRun(fixture.run.runId)).toEqual(armed.hold);

    fixture.resident.resolveMatter(fixture.interrupt.id);
    expect(fixture.resident.resumeMatter(fixture.matter.id)).toBe(true);
    expect(fixture.resident.matter(fixture.matter.id)).toMatchObject({
      status: "active",
      suspendedByMatterId: null,
      activeTaskRunId: fixture.run.runId,
      semanticRevision: decision.matter.semanticRevision,
      semanticCourse: decision.matter.semanticCourse
    });

    expect(
      fixture.holds.release(fixture.resident, fixture.executor, armed.hold, decision)
    ).toEqual({ status: "released", hold: armed.hold });
    expect(fixture.holds.holdForRun(fixture.run.runId)).toBeNull();
    expect(fixture.inner.state()).toMatchObject({
      status: "running",
      stepsUsed: 0,
      run: { runId: fixture.run.runId }
    });
  });

  it("cleans a suspended-time hold when the owning matter terminalizes and E11 retires the exact run", () => {
    const fixture = createSuspendedRunningFixture("terminal");
    const ticket = supersedeWhileSuspended(fixture, "speech.terminal.revision");
    const armed = fixture.holds.arm(fixture.resident, fixture.executor, ticket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    expect(fixture.resident.cancelMatter(fixture.matter.id)).toMatchObject({
      status: "cancelled",
      suspendedByMatterId: null,
      activeTaskRunId: fixture.run.runId
    });
    expect(fixture.holds.holdForRun(fixture.run.runId)).toEqual(armed.hold);

    const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();
    expect(
      dispositions.dispose(fixture.resident, fixture.executor, fixture.matter.id)
    ).toMatchObject({
      status: "disposed",
      record: {
        matterId: fixture.matter.id,
        matterStatus: "cancelled",
        runId: fixture.run.runId,
        reason: "matter_cancelled"
      }
    });

    expect(fixture.holds.holdForRun(fixture.run.runId)).toBeNull();
    expect(fixture.resident.taskBinding(fixture.run.runId)).toBeNull();
    expect(fixture.resident.matter(fixture.matter.id)).toMatchObject({
      status: "cancelled",
      activeTaskRunId: null
    });
    expect(fixture.inner.state()).toMatchObject({
      status: "idle",
      task: null,
      run: { runId: fixture.run.runId }
    });
  });
});
