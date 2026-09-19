import type { Vec2 } from "./contracts";
import type { RunOutcomeReconciliationResult, ResidentContinuityKernel } from "./resident-continuity-kernel";
import type { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import {
  ResidentMaterialPickupExecutor,
  type ResidentMaterialPickupStep,
} from "./resident-material-pickup-executor";
import {
  ResidentMaterialPlaceExecutor,
  type ResidentMaterialPlaceStep,
} from "./resident-material-place-executor";
import type { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export type ResidentLocalMaterialDeliveryPhase = "pickup" | "delivery" | "completed";

export type ResidentLocalMaterialDeliveryStep =
  | { status: "running"; phase: "pickup"; local: ResidentMaterialPickupStep }
  | { status: "pickup_completed"; local: Extract<ResidentMaterialPickupStep, { status: "succeeded" }> }
  | { status: "running"; phase: "delivery"; local: ResidentMaterialPlaceStep }
  | { status: "succeeded"; local: Extract<ResidentMaterialPlaceStep, { status: "succeeded" }> }
  | {
      status: "blocked";
      phase: "pickup" | "delivery";
      reason: string;
      local: ResidentMaterialPickupStep | ResidentMaterialPlaceStep;
    }
  | {
      status: "authority_lost";
      phase: "pickup" | "delivery";
      local: ResidentMaterialPickupStep | ResidentMaterialPlaceStep;
    };

export interface ResidentLocalMaterialDeliveryRoutineOptions {
  matterId: string;
  objectId: string;
  destination: Vec2;
  pickupTaskId: string;
  pickupRunId: string;
  placeTaskId: string;
  placeRunId: string;
}

/**
 * Shared resident-local procedural competence for one already-meaningful material
 * delivery matter.
 *
 * It does not choose whether the matter should exist and does not perform semantic
 * judgement. It only knows the mundane embodied procedure:
 *
 * known object -> approach/pickup -> preserve possession -> approach destination ->
 * ask World to place -> reconcile factual outcomes.
 *
 * This is intentionally reusable across residents. The caller supplies resident
 * meaning/identity and exact run ids; World and the continuity kernel retain authority.
 */
export class ResidentLocalMaterialDeliveryRoutine {
  private currentPhase: ResidentLocalMaterialDeliveryPhase = "pickup";
  private readonly pickup: ResidentMaterialPickupExecutor;
  private place: ResidentMaterialPlaceExecutor | null = null;
  private pickupResult: RunOutcomeReconciliationResult | null = null;
  private deliveryResult: RunOutcomeReconciliationResult | null = null;
  private terminal: Extract<ResidentLocalMaterialDeliveryStep, { status: "succeeded" }> | null = null;

  constructor(
    readonly options: ResidentLocalMaterialDeliveryRoutineOptions,
    private readonly kernel: ResidentContinuityKernel,
    private readonly knowledge: ResidentMaterialKnowledge,
    private readonly authority: ResidentWorldExecutionAuthority,
    private readonly world: SpcWorldRuntime,
  ) {
    const matter = kernel.matter(options.matterId);
    if (!matter || matter.status !== "active") {
      throw new Error("local material delivery requires an active matter");
    }
    if (matter.activeRunId !== null) {
      throw new Error("local material delivery requires an unbound active matter");
    }

    kernel.bindRun({
      matterId: options.matterId,
      taskId: options.pickupTaskId,
      runId: options.pickupRunId,
    });
    this.pickup = new ResidentMaterialPickupExecutor(
      options.pickupRunId,
      options.objectId,
      knowledge,
      authority,
      world,
    );
  }

  phase(): ResidentLocalMaterialDeliveryPhase {
    return this.currentPhase;
  }

  pickupReconciliation(): RunOutcomeReconciliationResult | null {
    return this.pickupResult ? structuredClone(this.pickupResult) : null;
  }

  deliveryReconciliation(): RunOutcomeReconciliationResult | null {
    return this.deliveryResult ? structuredClone(this.deliveryResult) : null;
  }

  step(): ResidentLocalMaterialDeliveryStep {
    if (this.terminal) return structuredClone(this.terminal);

    if (this.currentPhase === "pickup") {
      this.knowledge.sample();
      const local = this.pickup.step();
      if (local.status === "authority_lost") {
        return { status: "authority_lost", phase: "pickup", local };
      }
      if (local.status === "blocked") {
        return { status: "blocked", phase: "pickup", reason: local.reason, local };
      }
      if (local.status === "running") {
        return { status: "running", phase: "pickup", local };
      }

      this.pickupResult = this.kernel.reconcileRunOutcome({
        runId: local.runId,
        tick: local.materialOutcome.tick,
        status: "succeeded",
        summary: `picked up ${local.materialOutcome.objectId} for local material delivery`,
      });
      if (this.pickupResult.status !== "recorded") {
        return {
          status: "blocked",
          phase: "pickup",
          reason: "pickup outcome did not reconcile",
          local,
        };
      }

      this.kernel.bindRun({
        matterId: this.options.matterId,
        taskId: this.options.placeTaskId,
        runId: this.options.placeRunId,
      });
      this.place = new ResidentMaterialPlaceExecutor(
        this.options.placeRunId,
        this.options.objectId,
        this.options.destination,
        this.authority,
        this.world,
      );
      this.currentPhase = "delivery";
      return { status: "pickup_completed", local };
    }

    if (this.currentPhase !== "delivery" || !this.place) {
      throw new Error("local material delivery lost its delivery executor");
    }

    const local = this.place.step();
    if (local.status === "authority_lost") {
      return { status: "authority_lost", phase: "delivery", local };
    }
    if (local.status === "blocked") {
      return { status: "blocked", phase: "delivery", reason: local.reason, local };
    }
    if (local.status === "running") {
      return { status: "running", phase: "delivery", local };
    }

    this.deliveryResult = this.kernel.reconcileRunOutcome({
      runId: local.runId,
      tick: local.materialOutcome.tick,
      status: "succeeded",
      summary: `placed ${local.materialOutcome.objectId} at the local material delivery destination`,
    });
    if (this.deliveryResult.status !== "recorded") {
      return {
        status: "blocked",
        phase: "delivery",
        reason: "delivery outcome did not reconcile",
        local,
      };
    }

    this.kernel.resolveMatter(this.options.matterId);
    this.authority.enforceMotionAuthority();
    this.currentPhase = "completed";
    this.terminal = { status: "succeeded", local };
    return structuredClone(this.terminal);
  }
}
