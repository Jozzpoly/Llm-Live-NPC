import type { ResidentRunAuthority } from "./resident-world-execution-contract";
import {
  ResidentExecutionFocusAuthority,
  type ResidentExecutionFocusClaim,
} from "./resident-execution-focus-authority";

export type ResidentExecutionArbitration =
  | { status: "idle" }
  | { status: "focused"; runId: string; deferredRunIds: readonly string[] }
  | { status: "acquired_deferred"; runId: string }
  | { status: "choice_required"; candidateRunIds: readonly string[] };

export type ResidentExecutionArbitrationChoice =
  | { status: "acquired"; runId: string }
  | { status: "already_focused"; runId: string }
  | { status: "busy"; runId: string; focusedRunId: string }
  | { status: "rejected"; runId: string; reason: "not_deferred" | "run_not_authorized" };

/**
 * Policy-free continuity seam between semantic run authority and coarse body focus.
 *
 * A legal run that asks for the resident's current whole-body frame while another
 * run owns it must not disappear merely because the body was busy at that instant.
 * This arbiter remembers that concrete execution demand and reconsiders it whenever
 * focus becomes free.
 *
 * It deliberately does not rank unrelated concurrent matters. If exactly one still-
 * authorized deferred run remains, handing the free body to it preserves continuity
 * without inventing a priority policy. If several remain, the arbiter stops at an
 * explicit `choice_required` boundary for a higher semantic/policy layer to decide.
 *
 * This remains provisional while SPC Next uses one coarse execution frame. Future
 * locomotion/look/manipulation/communication channels may each need their own demand
 * arbitration rather than one resident-wide body lease.
 */
export class ResidentExecutionArbitrator implements ResidentRunAuthority {
  private readonly deferred = new Set<string>();

  constructor(
    private readonly runAuthority: ResidentRunAuthority,
    private readonly focus: ResidentExecutionFocusAuthority,
  ) {
    if (!runAuthority || typeof runAuthority.canRunMutateWorld !== "function") {
      throw new Error("execution arbitrator requires run authority");
    }
    if (!focus || typeof focus.claim !== "function") {
      throw new Error("execution arbitrator requires focus authority");
    }
  }

  request(runId: string): ResidentExecutionFocusClaim {
    const claim = this.focus.claim(runId);
    if (claim.status === "busy") {
      this.deferred.add(runId);
    } else {
      this.deferred.delete(runId);
    }
    return claim;
  }

  reconcile(): ResidentExecutionArbitration {
    this.focus.sync();
    this.pruneStaleDeferred();

    const focusedRunId = this.focus.focusedRun();
    if (focusedRunId !== null) {
      return {
        status: "focused",
        runId: focusedRunId,
        deferredRunIds: this.deferredRunIds(),
      };
    }

    const candidates = this.deferredRunIds();
    if (candidates.length === 0) return { status: "idle" };
    if (candidates.length > 1) {
      return { status: "choice_required", candidateRunIds: candidates };
    }

    const runId = candidates[0]!;
    const claim = this.focus.claim(runId);
    if (claim.status === "acquired" || claim.status === "already_focused") {
      this.deferred.delete(runId);
      return { status: "acquired_deferred", runId };
    }
    if (claim.status === "rejected") {
      this.deferred.delete(runId);
      return this.reconcile();
    }

    return {
      status: "focused",
      runId: claim.focusedRunId,
      deferredRunIds: this.deferredRunIds(),
    };
  }

  choose(runId: string): ResidentExecutionArbitrationChoice {
    assertRunId(runId);
    this.focus.sync();
    this.pruneStaleDeferred();

    if (!this.deferred.has(runId)) {
      return { status: "rejected", runId, reason: "not_deferred" };
    }
    if (!this.runAuthority.canRunMutateWorld(runId)) {
      this.deferred.delete(runId);
      return { status: "rejected", runId, reason: "run_not_authorized" };
    }

    const claim = this.focus.claim(runId);
    if (claim.status === "acquired" || claim.status === "already_focused") {
      this.deferred.delete(runId);
      return claim;
    }
    if (claim.status === "busy") return claim;

    this.deferred.delete(runId);
    return { status: "rejected", runId, reason: "run_not_authorized" };
  }

  deferredRunIds(): string[] {
    this.pruneStaleDeferred();
    return [...this.deferred].sort((a, b) => a.localeCompare(b));
  }

  canRunMutateWorld(runId: string): boolean {
    return this.focus.canRunMutateWorld(runId);
  }

  private pruneStaleDeferred(): void {
    for (const runId of this.deferred) {
      if (!this.runAuthority.canRunMutateWorld(runId)) this.deferred.delete(runId);
    }
  }
}

function assertRunId(runId: string): void {
  if (typeof runId !== "string" || runId.trim().length === 0) {
    throw new Error("execution arbitration runId must be non-empty");
  }
}
