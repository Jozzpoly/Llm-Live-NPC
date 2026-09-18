import type { MaterialActionResult, MaterialActionResultCode } from "./material-world-state";
import type {
  ResidentWorldAction,
  ResidentWorldActionResolution,
} from "./resident-world-action-contract";
import type {
  ResidentAuthorizedMotionOutcome,
  ResidentRunAuthority,
  ResidentWorldExecutionFrame,
  ResidentWorldExecutionResult,
} from "./resident-world-execution-contract";
import { SpcWorldRuntime } from "./spc-world-runtime";

const RECENT_ACTION_FACT_LIMIT = 128;

export type ResidentWorldActionFactResolution =
  | {
      status: "resolved";
      actionSeq: number;
      outcomeStatus: "succeeded" | "rejected";
      code: MaterialActionResultCode;
    }
  | {
      status: "rejected";
      reason: "invalid_action" | "run_not_authorized";
    };

/**
 * Non-omniscient causal provenance for one resident action attempt.
 *
 * This joins an exact resident run to the World action/result without copying raw
 * rejected `before` / `after` material truth into the resident authority surface.
 * Full hidden World state remains a separate research-plane observation.
 */
export interface ResidentWorldActionFact {
  id: string;
  sequence: number;
  tick: number;
  residentId: string;
  runId: string;
  action: ResidentWorldAction;
  resolution: ResidentWorldActionFactResolution;
}

/**
 * Resident-owned facade over the World execution gate.
 *
 * World knows only the narrow question "may run X still mutate World?". Matter,
 * semantic revision, evidence, focus policy and provider lifecycle remain outside
 * World. The supplied ResidentRunAuthority may therefore be the continuity kernel
 * directly or a stricter resident-scoped focus/lease gate layered above it.
 *
 * Once this facade claims a resident, SpcWorldRuntime disables that resident's
 * legacy fastStep/control path and becomes the phase-time enforcer for latched
 * effects and atomic World actions.
 *
 * Raw material outcomes stay World truth. Rejected actions are projected before
 * returning to the resident so hidden current position / holder identity cannot be
 * learned merely by probing an object id.
 */
export class ResidentWorldExecutionAuthority {
  private actionFactSequence = 0;
  private readonly actionFacts: ResidentWorldActionFact[] = [];
  private readonly worldLeaseAuthority: ResidentRunAuthority;
  private released = false;

  constructor(
    readonly residentId: string,
    private readonly runAuthority: ResidentRunAuthority,
    private readonly world: SpcWorldRuntime,
  ) {
    if (residentId.trim().length === 0) throw new Error("residentId must be non-empty");
    this.worldLeaseAuthority = {
      canRunMutateWorld: (runId) => !this.released && this.runAuthority.canRunMutateWorld(runId),
    };
    this.world.claimResidentExecutionAuthority(residentId, this.worldLeaseAuthority);
  }

  release(): boolean {
    if (this.released) return false;
    const released = this.world.releaseResidentExecutionAuthority(
      this.residentId,
      this.worldLeaseAuthority,
    );
    if (released) this.released = true;
    return released;
  }

  apply(frame: ResidentWorldExecutionFrame): ResidentWorldExecutionResult {
    this.assertActive();
    return this.world.applyResidentExecutionFrame(this.residentId, frame);
  }

  act(runId: string, action: ResidentWorldAction): ResidentWorldActionResolution {
    this.assertActive();
    const resolution = this.world.applyResidentWorldAction(this.residentId, runId, action);
    this.recordActionFact(runId, action, resolution);
    if (resolution.status !== "resolved") return resolution;
    return {
      ...resolution,
      materialOutcome: residentSafeMaterialOutcome(resolution.materialOutcome),
    };
  }

  recentActionFacts(): ResidentWorldActionFact[] {
    return this.actionFacts.map((fact) => structuredClone(fact));
  }

  enforceMotionAuthority(): { status: "unchanged" } | { status: "revoked"; runId: string } {
    this.assertActive();
    return this.world.enforceResidentMotionAuthority(this.residentId);
  }

  motionOwner(): string | null {
    this.assertActive();
    return this.world.residentMotionOwner(this.residentId);
  }

  lastMotionOutcome(): ResidentAuthorizedMotionOutcome | null {
    this.assertActive();
    return this.world.residentAuthorizedMotionOutcome(this.residentId);
  }

  private assertActive(): void {
    if (this.released) throw new Error("resident World execution authority is released");
  }

  private recordActionFact(
    runId: string,
    action: ResidentWorldAction,
    resolution: ResidentWorldActionResolution,
  ): void {
    const sequence = this.actionFactSequence++;
    const fact: ResidentWorldActionFact = {
      id: `resident-world-action:${this.residentId}:${sequence}`,
      sequence,
      tick: resolution.status === "resolved" ? resolution.materialOutcome.tick : this.world.tick,
      residentId: this.residentId,
      runId,
      action: structuredClone(action),
      resolution: resolution.status === "resolved"
        ? {
            status: "resolved",
            actionSeq: resolution.materialOutcome.actionSeq,
            outcomeStatus: resolution.materialOutcome.status,
            code: resolution.materialOutcome.code,
          }
        : {
            status: "rejected",
            reason: resolution.reason,
          },
    };
    this.actionFacts.push(fact);
    while (this.actionFacts.length > RECENT_ACTION_FACT_LIMIT) this.actionFacts.shift();
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
