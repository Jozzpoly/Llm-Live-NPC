import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import type { MaterialActionResult } from "./material-world-state";
import type {
  ResidentWorldAction,
  ResidentWorldActionResolution,
} from "./resident-world-action-contract";
import type {
  ResidentAuthorizedMotionOutcome,
  ResidentWorldExecutionFrame,
  ResidentWorldExecutionResult,
} from "./resident-world-execution-contract";
import { SpcWorldRuntime } from "./spc-world-runtime";

/**
 * Resident-owned facade over the World execution gate.
 *
 * World knows only the narrow question "may run X still mutate World?". Matter,
 * semantic revision, evidence and provider lifecycle remain private to the resident
 * continuity kernel. Once this facade claims a resident, SpcWorldRuntime disables
 * that resident's legacy fastStep/control path and becomes the phase-time enforcer
 * for latched effects and atomic World actions.
 *
 * Raw material outcomes stay World truth. Rejected actions are projected before
 * returning to the resident so hidden current position / holder identity cannot be
 * learned merely by probing an object id.
 */
export class ResidentWorldExecutionAuthority {
  constructor(
    readonly residentId: string,
    private readonly kernel: ResidentContinuityKernel,
    private readonly world: SpcWorldRuntime,
  ) {
    if (residentId.trim().length === 0) throw new Error("residentId must be non-empty");
    this.world.claimResidentExecutionAuthority(residentId, {
      canRunMutateWorld: (runId) => this.kernel.canRunMutateWorld(runId),
    });
  }

  apply(frame: ResidentWorldExecutionFrame): ResidentWorldExecutionResult {
    return this.world.applyResidentExecutionFrame(this.residentId, frame);
  }

  act(runId: string, action: ResidentWorldAction): ResidentWorldActionResolution {
    const resolution = this.world.applyResidentWorldAction(this.residentId, runId, action);
    if (resolution.status !== "resolved") return resolution;
    return {
      ...resolution,
      materialOutcome: residentSafeMaterialOutcome(resolution.materialOutcome),
    };
  }

  enforceMotionAuthority(): { status: "unchanged" } | { status: "revoked"; runId: string } {
    return this.world.enforceResidentMotionAuthority(this.residentId);
  }

  motionOwner(): string | null {
    return this.world.residentMotionOwner(this.residentId);
  }

  lastMotionOutcome(): ResidentAuthorizedMotionOutcome | null {
    return this.world.residentAuthorizedMotionOutcome(this.residentId);
  }
}

function residentSafeMaterialOutcome(outcome: MaterialActionResult): MaterialActionResult {
  if (outcome.status === "succeeded") return structuredClone(outcome);
  return {
    ...structuredClone(outcome),
    before: null,
    after: null,
  };
}

export type {
  ResidentWorldAction,
  ResidentWorldActionResolution,
} from "./resident-world-action-contract";
export type {
  ResidentAuthorizedMotionOutcome,
  ResidentWorldEffect,
  ResidentWorldExecutionFrame,
  ResidentWorldExecutionResult,
} from "./resident-world-execution-contract";
