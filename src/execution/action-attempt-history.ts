import type { WorldActionResult } from "../world/types";
import type { ExecutorRunProvenance } from "./deterministic-executor";
import type { ExecutionFrameResult } from "./execution-driver";

export type ActionAttemptSource = "player" | "executor";

export interface ActionAttemptRecord extends WorldActionResult {
  source: ActionAttemptSource;
  executorRun?: ExecutorRunProvenance;
}

function cloneExecutorRun(run: ExecutorRunProvenance): ExecutorRunProvenance {
  return {
    runId: run.runId,
    cause:
      run.cause.kind === "cognition"
        ? { kind: "cognition", correlationId: run.cause.correlationId }
        : { kind: run.cause.kind }
  };
}

function cloneAttempt(entry: ActionAttemptRecord): ActionAttemptRecord {
  return {
    ...entry,
    executorRun: entry.executorRun ? cloneExecutorRun(entry.executorRun) : undefined
  };
}

export function executionFrameAttempts(frame: ExecutionFrameResult): ActionAttemptRecord[] {
  const attempts: ActionAttemptRecord[] = frame.playerActionResults.map((result) => ({
    ...result,
    source: "player"
  }));
  if (frame.executorActionResult) {
    if (!frame.executorActionRun) {
      throw new Error("Executor action result requires run provenance in the execution frame.");
    }
    attempts.push({
      ...frame.executorActionResult,
      source: "executor",
      executorRun: cloneExecutorRun(frame.executorActionRun)
    });
  }
  return attempts;
}

export class ActionAttemptHistory {
  private readonly entries: ActionAttemptRecord[] = [];

  constructor(private readonly limit = 12) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`Action attempt history limit must be a positive integer: ${limit}`);
    }
  }

  record(frame: ExecutionFrameResult): void {
    this.entries.push(...executionFrameAttempts(frame));
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }
  }

  recent(): ActionAttemptRecord[] {
    return this.entries.map(cloneAttempt);
  }
}

// Page-lifetime diagnostic side channel only. Gameplay, World authority and E1
// cognition never read this history. ExecutionDriver is the layer that knows
// whether an atomic attempt came through the player channel or executor channel,
// and which executor run/cause owned an executor attempt.
const runtimeActionAttemptHistory = new ActionAttemptHistory(12);

export function recordRuntimeExecutionFrame(frame: ExecutionFrameResult): void {
  runtimeActionAttemptHistory.record(frame);
}

export function recentRuntimeActionAttempts(): ActionAttemptRecord[] {
  return runtimeActionAttemptHistory.recent();
}
