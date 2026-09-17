import type { RunOutcomeReconciliationResult } from "./resident-continuity-kernel";
import {
  createFiveResidentJanekDeliverySlice,
  type FiveResidentJanekDeliveryStep,
} from "./five-resident-delivery-slice";
import type { ResidentContinuityKernel } from "./resident-continuity-kernel";
import type { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import type { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export interface FiveResidentJanekMaterialSlice {
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  materialKnowledge: ResidentMaterialKnowledge;
  authority: ResidentWorldExecutionAuthority;
  stepJanek(): FiveResidentJanekDeliveryStep;
  reconciliation(): RunOutcomeReconciliationResult | null;
  deliveryReconciliation(): RunOutcomeReconciliationResult | null;
}

/**
 * Browser-facing Janek material composition.
 *
 * J1 originally stopped at factual pickup. The same seam now delegates to J2's
 * delivery composition so the research scene shows one continuing matter spanning
 * pickup, carried possession, travel, placement and final matter resolution.
 * `reconciliation()` remains the pickup-boundary accessor for compatibility with
 * the earlier J1 evidence test.
 */
export function createFiveResidentJanekMaterialSlice(): FiveResidentJanekMaterialSlice {
  const delivery = createFiveResidentJanekDeliverySlice();
  return {
    world: delivery.world,
    kernel: delivery.kernel,
    materialKnowledge: delivery.materialKnowledge,
    authority: delivery.authority,
    stepJanek: () => delivery.stepJanek(),
    reconciliation: () => delivery.pickupReconciliation(),
    deliveryReconciliation: () => delivery.deliveryReconciliation(),
  };
}