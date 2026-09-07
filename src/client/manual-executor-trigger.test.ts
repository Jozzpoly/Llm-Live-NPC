import { describe, expect, it, vi } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { startManualExecutorTask } from "./manual-executor-trigger";

const manualTask = {
  kind: "approach-and-interact" as const,
  actorId: "npc.001",
  targetId: "item.lantern"
};

describe("manual executor trigger lifecycle", () => {
  it("runs the lifecycle side effect only after an idle executor accepts the manual task", () => {
    const executor = new DeterministicExecutor();
    const onStarted = vi.fn();

    const result = startManualExecutorTask(executor, manualTask, onStarted);

    expect(result.started).toBe(true);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(result.state).toMatchObject({
      status: "running",
      task: manualTask,
      stepsUsed: 0,
      failureCode: null,
      run: { runId: 1, cause: { kind: "manual" } }
    });
    expect(executor.state()).toEqual(result.state);
  });

  it("does not run the lifecycle side effect or replace cognition provenance when another path already owns the executor", () => {
    const executor = new DeterministicExecutor();
    const existingTask = {
      kind: "approach-and-interact" as const,
      actorId: "npc.001",
      targetId: "item.mug"
    };
    expect(
      executor.start(existingTask, {
        kind: "cognition",
        correlationId: "e1:s4:r7:c2"
      })
    ).toBe(true);
    const before = executor.state();
    const onStarted = vi.fn();

    // This is the stale-debug-state race: UI may still allow the manual click,
    // but the executor itself has already become running through cognition.
    const result = startManualExecutorTask(executor, manualTask, onStarted);

    expect(result.started).toBe(false);
    expect(onStarted).not.toHaveBeenCalled();
    expect(result.state).toEqual(before);
    expect(executor.state()).toEqual(before);
    expect(executor.state().run).toEqual({
      runId: 1,
      cause: { kind: "cognition", correlationId: "e1:s4:r7:c2" }
    });
  });
});
