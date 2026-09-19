import { ResidentContinuityKernel, type RunOutcomeReconciliationResult } from "./resident-continuity-kernel";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import type { ResidentMaterialPickupStep } from "./resident-material-pickup-executor";
import type { ResidentMaterialPlaceStep } from "./resident-material-place-executor";
import { ResidentLocalMaterialDeliveryRoutine } from "./resident-local-material-delivery-routine";
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
  materialKnowledge: ResidentMaterialKnowledge;
  authority: ResidentWorldExecutionAuthority;
  stepJanek(): FiveResidentJanekDeliveryStep;
  holdJanekExecution(reason: string): boolean;
  resumeJanekExecution(): boolean;
  executionHold(): { runId: string; reason: string } | null;
  pickupReconciliation(): RunOutcomeReconciliationResult | null;
  deliveryReconciliation(): RunOutcomeReconciliationResult | null;
}

/**
 * Janek vertical material slice: one durable matter survives multiple local runs
 * and a bounded execution hold. Pickup is grounded in resident-acquired material
 * position evidence; hidden World movement does not retarget the local executor.
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
  const materialKnowledge = new ResidentMaterialKnowledge(
    "resident.janek",
    ["crate.workshop.01"],
    world,
  );
  const authority = new ResidentWorldExecutionAuthority("resident.janek", kernel, world);
  const routine = new ResidentLocalMaterialDeliveryRoutine({
    matterId: "matter.janek.crate-delivery",
    objectId: "crate.workshop.01",
    destination: JANEK_CRATE_DELIVERY_DESTINATION,
    pickupTaskId: "task.janek.pickup-delivery-crate",
    pickupRunId: "run.janek.pickup-delivery-crate",
    placeTaskId: "task.janek.place-delivery-crate",
    placeRunId: "run.janek.place-delivery-crate",
  }, kernel, materialKnowledge, authority, world);

  let executionHold: { runId: string; reason: string } | null = null;

  return {
    world,
    kernel,
    materialKnowledge,
    authority,
    stepJanek(): FiveResidentJanekDeliveryStep {
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

      const local = routine.step();
      if (local.status === "pickup_completed") {
        return { status: "running", phase: "pickup", local: local.local };
      }
      if (local.status === "running") {
        return local.phase === "pickup"
          ? { status: "running", phase: "pickup", local: local.local }
          : { status: "running", phase: "delivery", local: local.local };
      }
      if (local.status === "blocked") {
        return local.phase === "pickup"
          ? { status: "blocked", phase: "pickup", local: local.local }
          : { status: "blocked", phase: "delivery", local: local.local };
      }
      if (local.status === "authority_lost") {
        return local.phase === "pickup"
          ? { status: "authority_lost", phase: "pickup", local: local.local }
          : { status: "authority_lost", phase: "delivery", local: local.local };
      }
      return { status: "succeeded", phase: "delivered", local: local.local };
    },
    holdJanekExecution(reason: string): boolean {
      const trimmedReason = reason.trim();
      if (!trimmedReason || routine.phase() !== "delivery" || routine.deliveryReconciliation() || executionHold) return false;
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
      return routine.pickupReconciliation();
    },
    deliveryReconciliation(): RunOutcomeReconciliationResult | null {
      return routine.deliveryReconciliation();
    },
  };
}
