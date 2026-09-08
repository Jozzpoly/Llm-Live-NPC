import { describe, expect, it } from "vitest";
import { DeterministicExecutor, type ExecutorRunProvenance } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "./p2-e9-semantic-reconsideration-hold";
import { P2E10MatterSuspensionAwareExecutor } from "./p2-e10-matter-suspension-execution-causality";
import { P2E11TerminalMatterTaskDispositionBoundary } from "./p2-e11-terminal-matter-task-disposition";

function openFetchMatter(resident: P2E0ResidentCausalKernel, id: string) {
  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: `${id}.speech` },
    summary: "player.jozz said: fetch the Red mug"
  });
  return resident.openMatter({
    id,
    originEvidenceId: origin.id,
    semanticCourse: "fetch Red mug"
  });
}

function startBoundRun(
  resident: P2E0ResidentCausalKernel,
  executor: DeterministicExecutor,
  matterId: string,
  actorId: string,
  targetId: string
): ExecutorRunProvenance {
  expect(
    executor.start(
      { kind: "approach-and-interact", actorId, targetId },
      { kind: "cognition", sessionId: 16, cycleId: 1 }
    )
  ).toBe(true);
  const run = executor.state().run;
  if (!run) throw new Error("P2-E16 re-attack requires exact run provenance.");
  resident.bindTask(matterId, { taskId: `fetch:${targetId}`, runId: run.runId });
  return run;
}

function canonicalActorsAtDistance(distance: number) {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
    throw new Error("P2-E16 re-attack requires canonical npc.001 and item.mug.");
  }
  mug.position = { x: npc.position.x + distance, y: npc.position.y };
  return { specimen, npc, mug };
}

describe("P2-E16 terminal execution gate re-attack", () => {
  it("freezes an exact run at its already-consumed progress once the owning matter terminalizes", () => {
    const { specimen, npc, mug } = canonicalActorsAtDistance(240);
    const world = new World(specimen);
    const resident = new P2E0ResidentCausalKernel();
    const inner = new DeterministicExecutor();
    const executor = new P2E10MatterSuspensionAwareExecutor(inner, resident);
    const driver = new ExecutionDriver(world, executor);
    const matter = openFetchMatter(resident, "matter.partial-progress");
    const run = startBoundRun(resident, executor, matter.id, npc.id, mug.id);

    const initialPosition = world.snapshot().entities.find((entity) => entity.id === npc.id)?.position;
    if (!initialPosition) throw new Error("P2-E16 partial-progress fixture requires NPC position.");

    const activeFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(activeFrame.executorActionResult).toBeNull();
    expect(inner.state()).toMatchObject({ status: "running", stepsUsed: 1, run: { runId: run.runId } });
    const progressedPosition = world.snapshot().entities.find((entity) => entity.id === npc.id)?.position;
    expect(progressedPosition).toBeDefined();
    expect(progressedPosition).not.toEqual(initialPosition);

    resident.resolveMatter(matter.id);
    const terminalPosition = structuredClone(progressedPosition);

    for (let frameIndex = 0; frameIndex < 3; frameIndex += 1) {
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      expect(frame.executorActionResult).toBeNull();
      expect(frame.executorActionRun).toBeNull();
    }

    expect(world.snapshot().entities.find((entity) => entity.id === npc.id)?.position).toEqual(terminalPosition);
    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });
    expect(inner.state()).toMatchObject({ status: "running", stepsUsed: 1, run: { runId: run.runId } });

    const disposed = new P2E11TerminalMatterTaskDispositionBoundary().dispose(
      resident,
      executor,
      matter.id
    );
    expect(disposed).toMatchObject({
      status: "disposed",
      record: { matterId: matter.id, runId: run.runId, stepsUsed: 1 }
    });
    expect(resident.taskBinding(run.runId)).toBeNull();
  });

  for (const order of ["hold-outside", "suspension-outside"] as const) {
    it(`blocks terminal World authority through ${order} E9/E10 composition before E11 retirement`, () => {
      const { specimen, npc, mug } = canonicalActorsAtDistance(36);
      const world = new World(specimen);
      const resident = new P2E0ResidentCausalKernel();
      const inner = new DeterministicExecutor();
      const holds = new P2E9SemanticReconsiderationHoldBoundary();
      const executor: DeterministicExecutor =
        order === "hold-outside"
          ? new P2E9HoldAwareExecutor(
              new P2E10MatterSuspensionAwareExecutor(inner, resident),
              holds
            )
          : new P2E10MatterSuspensionAwareExecutor(
              new P2E9HoldAwareExecutor(inner, holds),
              resident
            );
      const driver = new ExecutionDriver(world, executor);
      const matter = openFetchMatter(resident, `matter.stack.${order}`);
      const run = startBoundRun(resident, executor, matter.id, npc.id, mug.id);

      resident.cancelMatter(matter.id);
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });

      expect(frame.executorActionResult).toBeNull();
      expect(frame.executorActionRun).toBeNull();
      expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
        kind: "item",
        heldBy: null
      });
      expect(inner.state()).toMatchObject({ status: "running", stepsUsed: 0, run: { runId: run.runId } });

      expect(
        new P2E11TerminalMatterTaskDispositionBoundary().dispose(resident, executor, matter.id)
      ).toMatchObject({
        status: "disposed",
        record: { matterId: matter.id, runId: run.runId, stepsUsed: 0 }
      });
      expect(inner.state()).toMatchObject({ status: "idle", task: null, run: { runId: run.runId } });
      expect(resident.taskBinding(run.runId)).toBeNull();
    });
  }
});
