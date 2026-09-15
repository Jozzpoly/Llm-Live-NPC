import { ResidentContinuityKernel, type RunOutcomeReconciliationResult } from "./resident-continuity-kernel";
import {
  ResidentMaterialPickupExecutor,
  type ResidentMaterialPickupStep,
} from "./resident-material-pickup-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import { SpcWorldRuntime } from "./spc-world-runtime";

export interface FiveResidentJanekMaterialSlice {
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  authority: ResidentWorldExecutionAuthority;
  stepJanek(): ResidentMaterialPickupStep;
  reconciliation(): RunOutcomeReconciliationResult | null;
}

/**
 * First world-readable SPC Next resident-life composition.
 *
 * This is intentionally one bounded vertical slice, not a general life planner:
 * Janek owns one continuing workshop matter; one exact run locally approaches the
 * authored workshop crate and attempts a real World pickup. The resident meaning
 * lives in the continuity kernel, embodied execution in the local executor, and
 * material possession in World truth.
 */
export function createFiveResidentJanekMaterialSlice(): FiveResidentJanekMaterialSlice {
  const world = createFiveResidentRegionWorld();
  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:janek:workshop-crate:origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Janek has workshop work that requires the workshop crate.",
  });
  kernel.openMatter({
    id: "matter.janek.workshop-crate",
    originEvidenceId: origin.id,
    semanticCourse: "pick up the workshop crate",
  });
  kernel.bindRun({
    matterId: "matter.janek.workshop-crate",
    taskId: "task.janek.pickup-workshop-crate",
    runId: "run.janek.pickup-workshop-crate",
  });

  const authority = new ResidentWorldExecutionAuthority("resident.janek", kernel, world);
  const executor = new ResidentMaterialPickupExecutor(
    "run.janek.pickup-workshop-crate",
    "crate.workshop.01",
    authority,
    world,
  );
  let reconciled: RunOutcomeReconciliationResult | null = null;

  return {
    world,
    kernel,
    authority,
    stepJanek(): ResidentMaterialPickupStep {
      const state = executor.step();
      if (!reconciled && state.status === "succeeded") {
        reconciled = kernel.reconcileRunOutcome({
          runId: state.runId,
          tick: state.materialOutcome.tick,
          status: "succeeded",
          summary: `picked up ${state.materialOutcome.objectId}`,
        });
      }
      return state;
    },
    reconciliation(): RunOutcomeReconciliationResult | null {
      return reconciled ? structuredClone(reconciled) : null;
    },
  };
}
