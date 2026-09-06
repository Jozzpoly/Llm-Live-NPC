import type { ExecutionFrameResult } from "../execution/execution-driver";
import type { WorldActionResult } from "../world/types";

export type ActionAttemptSource = "player" | "executor";

export interface ActionAttemptRecord extends WorldActionResult {
  source: ActionAttemptSource;
}

export function executionFrameAttempts(frame: ExecutionFrameResult): ActionAttemptRecord[] {
  const attempts: ActionAttemptRecord[] = frame.playerActionResults.map((result) => ({
    ...result,
    source: "player"
  }));
  if (frame.executorActionResult) {
    attempts.push({ ...frame.executorActionResult, source: "executor" });
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
    return this.entries.map((entry) => ({ ...entry }));
  }
}

// Page-lifetime diagnostic side channel only. Gameplay, World authority and E1
// cognition never read this history. ExecutionDriver is the layer that knows
// whether an atomic attempt came through the player channel or executor channel.
const runtimeActionAttemptHistory = new ActionAttemptHistory(12);

export function recordRuntimeExecutionFrame(frame: ExecutionFrameResult): void {
  runtimeActionAttemptHistory.record(frame);
}

export function recentRuntimeActionAttempts(): ActionAttemptRecord[] {
  return runtimeActionAttemptHistory.recent();
}
