import type { ResidentRunAuthority } from "./resident-world-execution-contract";

export type ResidentExecutionFocusClaim =
  | { status: "acquired"; runId: string }
  | { status: "already_focused"; runId: string }
  | { status: "busy"; runId: string; focusedRunId: string }
  | { status: "rejected"; runId: string; reason: "run_not_authorized" };

export type ResidentExecutionFocusSync =
  | { status: "unchanged"; focusedRunId: string | null }
  | { status: "released_stale"; runId: string };

/**
 * Provisional whole-frame execution focus for one resident while SPC Next still uses
 * one run-scoped frame for motion/look/speech/action authority.
 *
 * ResidentContinuityKernel intentionally allows multiple simultaneous matters and
 * exact run bindings. That semantic concurrency must not make one physical body
 * last-writer-wins across competing legal frames. This layer selects which exact run
 * may currently use the resident's coarse execution resource.
 *
 * This is deliberately NOT the final local-control arbiter. As locomotion, attention,
 * manipulation and communication become independent channels, this coarse lease can
 * be split into resource/channel ownership. The invariant protected here is narrower:
 * frame order must not decide which unrelated active matter owns one body.
 */
export class ResidentExecutionFocusAuthority implements ResidentRunAuthority {
  private focusedRunId: string | null = null;

  constructor(private readonly underlying: ResidentRunAuthority) {
    if (!underlying || typeof underlying.canRunMutateWorld !== "function") {
      throw new Error("execution focus requires an underlying run authority");
    }
  }

  claim(runId: string): ResidentExecutionFocusClaim {
    assertRunId(runId);
    this.sync();

    if (!this.underlying.canRunMutateWorld(runId)) {
      return { status: "rejected", runId, reason: "run_not_authorized" };
    }
    if (this.focusedRunId === runId) {
      return { status: "already_focused", runId };
    }
    if (this.focusedRunId !== null) {
      return { status: "busy", runId, focusedRunId: this.focusedRunId };
    }

    this.focusedRunId = runId;
    return { status: "acquired", runId };
  }

  release(runId: string): boolean {
    assertRunId(runId);
    if (this.focusedRunId !== runId) return false;
    this.focusedRunId = null;
    return true;
  }

  sync(): ResidentExecutionFocusSync {
    const runId = this.focusedRunId;
    if (runId === null) return { status: "unchanged", focusedRunId: null };
    if (this.underlying.canRunMutateWorld(runId)) {
      return { status: "unchanged", focusedRunId: runId };
    }
    this.focusedRunId = null;
    return { status: "released_stale", runId };
  }

  focusedRun(): string | null {
    this.sync();
    return this.focusedRunId;
  }

  canRunMutateWorld(runId: string): boolean {
    this.sync();
    return this.focusedRunId === runId && this.underlying.canRunMutateWorld(runId);
  }
}

function assertRunId(runId: string): void {
  if (typeof runId !== "string" || runId.trim().length === 0) {
    throw new Error("execution focus runId must be non-empty");
  }
}
