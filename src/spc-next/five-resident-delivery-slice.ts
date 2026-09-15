import { ResidentContinuityKernel, type RunOutcomeReconciliationResult } from "./resident-continuity-kernel";
import { ResidentMaterialPickupExecutor, type ResidentMaterialPickupStep } from "./resident-material-pickup-executor";
import { ResidentMaterialPlaceExecutor, type ResidentMaterialPlaceStep } from "./resident-material-place-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import { SpcWorldRuntime } from "./spc-world-runtime";

export const JANEK_CRATE_DELIVERY_DESTINATION = Object.freeze({ x: 2_980, y: 1_080 });

export type FiveResidentJanekDeliveryStep =
  | { status: "running"; phase: "pickup"; local: ResidentMaterialPickupStep }
  | { status: "running"; phase: "delivery"; local: ResidentMaterialPlaceStep }
  | { status: "execution_held"; phase: "delivery"; runId: string; reason: string }
  | { status: "succeeded"; phase: "delivered"; local: ResidentMaterialPlaceStep }
  | { status: "blocked"; phase: "pickup" | "delivery"; local: ResidentMaterialPickupStep | ResidentMaterialPlaceStep }
  | { status: "authority_lost"; phase: "pickup" | "delivery"; local: ResidentMaterialPickupStep | ResidentMaterialPlaceStep };

export interface FiveResidentJanekDeliverySlice {
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  authority: ResidentWorldExecutionAuthority;
  stepJanek(): FiveResidentJanekDeliveryStep;
  holdJanekExecution(reason: string): boolean;
  resumeJanekExecution(): boolean;
  executionHold(): { runId: string; reason: string } | null;
  pickupReconciliation(): RunOutcomeReconciliationResult | null;
  deliveryReconciliation(): RunOutcomeReconciliationResult | null;
}

/**
 * Second Janek vertical slice: one durable matter survives multiple local runs and
 * a bounded execution hold. A hold pauses embodiment without pretending the matter
 * itself changed meaning or became semantically suspended.
 */
export function createFiveResidentJanekDeliverySlice(): FiveResidentJanekDeliverySlice {
  const world = createFiveResidentRegionWorld();
  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:janek:crate-delivery:origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Janek has workshop work that requires delivering the workshop crate to crossroads storage.",
  });
  kernel.openMatter({
    id: "matter.janek.crate-delivery",
    originEvidenceId: origin.id,
    semanticCourse: "deliver the workshop crate to the crossroads storage point",
  });
  kernel.bindRun({
    matterId: "matter.janek.crate-delivery",
    taskId: "task.janek.pickup-delivery-crate",
    runId: "run.janek.pickup-delivery-crate",
  });

  const authority = new ResidentWorldExecutionAuthority("resident.janek", kernel, world);
  const pickup = new ResidentMaterialPickupExecutor(
    "run.janek.pickup-delivery-crate",
    "crate.workshop.01",
    authority,
    world,
  );

  let place: ResidentMaterialPlaceExecutor | null = null;
  let pickupReconciled: RunOutcomeReconciliationResult | null = null;
  let deliveryReconciled: RunOutcomeReconciliationResult | null = null;
  let executionHold: { runId: string; reason: string } | null = null;

  function startDeliveryRun(): void {
    kernel.bindRun({
      matterId: "matter.janek.crate-delivery",
      taskId: "task.janek.place-delivery-crate",
      runId: "run.janek.place-delivery-crate",
    });
    place = new ResidentMaterialPlaceExecutor(
      "run.janek.place-delivery-crate",
      "crate.workshop.01",
      JANEK_CRATE_DELIVERY_DESTINATION,
      authority,
      world,
    );
  }

  return {
    world,
    kernel,
    authority,
    stepJanek(): FiveResidentJanekDeliveryStep {
      if (!pickupReconciled) {
        const local = pickup.step();
        if (local.status === "succeeded") {
          pickupReconciled = kernel.reconcileRunOutcome({
            runId: local.runId,
            tick: local.materialOutcome.tick,
            status: "succeeded",
            summary: `picked up ${local.materialOutcome.objectId} for delivery`,
          });
          if (pickupReconciled.status !== "recorded") {
            return { status: "blocked", phase: "pickup", local: { status: "blocked", runId: local.runId, reason: "pickup reconciliation failed", materialOutcome: local.materialOutcome } };
          }
          startDeliveryRun();
          return { status: "running", phase: "delivery", local: place!.step() };
        }
        if (local.status === "blocked") return { status: "blocked", phase: "pickup", local };
        if (local.status === "authority_lost") return { status: "authority_lost", phase: "pickup", local };
        return { status: "running", phase: "pickup", local };
      }

      if (!place) throw new Error("delivery run missing after pickup reconciliation");
      if (executionHold) {
        if (!kernel.canRunMutateWorld(executionHold.runId)) {
          return {
            status: "authority_lost",
            phase: "delivery",
            local: { status: "authority_lost", runId: executionHold.runId },
          };
        }
        return { status: "execution_held", phase: "delivery", ...executionHold };
      }

      const local = place.step();
      if (local.status === "succeeded" && !deliveryReconciled) {
        deliveryReconciled = kernel.reconcileRunOutcome({
          runId: local.runId,
          tick: local.materialOutcome.tick,
          status: "succeeded",
          summary: `placed ${local.materialOutcome.objectId} at the delivery destination`,
        });
        if (deliveryReconciled.status === "recorded") {
          kernel.resolveMatter("matter.janek.crate-delivery");
          return { status: "succeeded", phase: "delivered", local };
        }
      }
      if (local.status === "blocked") return { status: "blocked", phase: "delivery", local };
      if (local.status === "authority_lost") return { status: "authority_lost", phase: "delivery", local };
      return { status: "running", phase: "delivery", local };
    },
    holdJanekExecution(reason: string): boolean {
      const trimmedReason = reason.trim();
      if (!trimmedReason || !pickupReconciled || !place || deliveryReconciled || executionHold) return false;
      const matter = kernel.matter("matter.janek.crate-delivery");
      const runId = matter?.activeRunId;
      if (!runId || !kernel.canRunMutateWorld(runId)) return false;
      const stopped = authority.apply({
        runId,
        effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
      });
      if (stopped.status !== "applied") return false;
      executionHold = { runId, reason: trimmedReason };
      return true;
    },
    resumeJanekExecution(): boolean {
      if (!executionHold) return false;
      if (!kernel.canRunMutateWorld(executionHold.runId)) return false;
      executionHold = null;
      return true;
    },
    executionHold(): { runId: string; reason: string } | null {
      return executionHold ? structuredClone(executionHold) : null;
    },
    pickupReconciliation(): RunOutcomeReconciliationResult | null {
      return pickupReconciled ? structuredClone(pickupReconciled) : null;
    },
    deliveryReconciliation(): RunOutcomeReconciliationResult | null {
      return deliveryReconciled ? structuredClone(deliveryReconciled) : null;
    },
  };
}
