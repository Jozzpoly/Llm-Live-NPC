import {
  ResidentContinuityKernel,
  type ResidentKernelEvidence,
  type RunOutcomeReconciliationResult,
} from "./resident-continuity-kernel";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentMaterialPickupExecutor, type ResidentMaterialPickupStep } from "./resident-material-pickup-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import { SpcWorldRuntime } from "./spc-world-runtime";

export type FiveResidentJanekMissingCrateStep =
  | { status: "running"; local: ResidentMaterialPickupStep }
  | {
      status: "semantic_pressure";
      local: Extract<ResidentMaterialPickupStep, { status: "blocked" }>;
      checkedAbsenceEvidence: ResidentKernelEvidence;
    }
  | { status: "blocked_without_checked_absence"; local: Extract<ResidentMaterialPickupStep, { status: "blocked" }> }
  | { status: "authority_lost"; local: Extract<ResidentMaterialPickupStep, { status: "authority_lost" }> };

export interface FiveResidentJanekMissingCrateOptions {
  /**
   * Test-fixture-only relocation speed used for the one hidden relocation tick.
   * Different values let relational tests vary hidden World truth while keeping
   * Janek's legally acquired history identical.
   */
  hiddenRelocationSpeed?: number;
}

export interface FiveResidentJanekMissingCrateSlice {
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  materialKnowledge: ResidentMaterialKnowledge;
  authority: ResidentWorldExecutionAuthority;
  stepJanek(): FiveResidentJanekMissingCrateStep;
  blockedRunReconciliation(): RunOutcomeReconciliationResult | null;
  semanticPressureEvidence(): ResidentKernelEvidence | null;
}

/**
 * First semantic-pressure composition.
 *
 * An external World change happens between Janek's material perception samples.
 * The local executor therefore continues toward Janek's last-known crate position,
 * not hidden World truth. Once the local pickup method fails and Janek can inspect
 * that old point, checked absence becomes new semantic evidence for the still-live
 * matter. No provider is involved yet.
 */
export function createFiveResidentJanekMissingCrateSlice(
  options: FiveResidentJanekMissingCrateOptions = {},
): FiveResidentJanekMissingCrateSlice {
  const hiddenRelocationSpeed = options.hiddenRelocationSpeed ?? 48_000;
  if (!Number.isFinite(hiddenRelocationSpeed) || hiddenRelocationSpeed <= 0) {
    throw new Error("hiddenRelocationSpeed must be positive and finite");
  }

  const world = createFiveResidentRegionWorld();

  // Move Janek away from the crate while legacy control is still active, so the
  // later recovered executor must physically return to the acquired last-known point.
  world.setActorMotionIntent("resident.janek", { x: -120, y: 0 });
  world.step(90);
  world.setActorMotionIntent("resident.janek", { x: 0, y: 0 });

  const materialKnowledge = new ResidentMaterialKnowledge(
    "resident.janek",
    ["crate.workshop.01"],
    world,
  );
  materialKnowledge.sample();

  // Adversarial external relocation between Janek's material perception samples.
  // The extreme helper speed is test-fixture pressure, not resident behavior.
  world.addPlayer("player.relocator", { x: 1_952, y: 720 }, { maxSpeed: hiddenRelocationSpeed });
  const pickupByRelocator = world.attemptMaterialAction("player.relocator", {
    kind: "pickup",
    objectId: "crate.workshop.01",
  });
  if (pickupByRelocator.status !== "succeeded") throw new Error("failed to prepare hidden crate relocation");
  world.setActorMotionIntent("player.relocator", { x: hiddenRelocationSpeed, y: 0 });
  world.step();
  world.setActorMotionIntent("player.relocator", { x: 0, y: 0 });
  const relocator = world.publicSnapshot().actors.find((actor) => actor.id === "player.relocator");
  if (!relocator) throw new Error("relocator actor missing");
  const placedByRelocator = world.attemptMaterialAction("player.relocator", {
    kind: "place",
    objectId: "crate.workshop.01",
    position: relocator.position,
  });
  if (placedByRelocator.status !== "succeeded") throw new Error("failed to finish hidden crate relocation");
  materialKnowledge.sample();

  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:janek:missing-crate:origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Janek needs the familiar workshop crate and last saw it near the workshop bench.",
  });
  kernel.openMatter({
    id: "matter.janek.missing-crate",
    originEvidenceId: origin.id,
    semanticCourse: "go to the last-known workshop crate position and pick it up",
  });
  kernel.bindRun({
    matterId: "matter.janek.missing-crate",
    taskId: "task.janek.pickup-last-known-crate",
    runId: "run.janek.pickup-last-known-crate",
  });

  const authority = new ResidentWorldExecutionAuthority("resident.janek", kernel, world);
  const executor = new ResidentMaterialPickupExecutor(
    "run.janek.pickup-last-known-crate",
    "crate.workshop.01",
    materialKnowledge,
    authority,
    world,
  );

  let reconciliation: RunOutcomeReconciliationResult | null = null;
  let pressureEvidence: ResidentKernelEvidence | null = null;

  return {
    world,
    kernel,
    materialKnowledge,
    authority,
    stepJanek(): FiveResidentJanekMissingCrateStep {
      materialKnowledge.sample();
      const local = executor.step();
      if (local.status === "authority_lost") return { status: "authority_lost", local };
      if (local.status !== "blocked") return { status: "running", local };

      if (!reconciliation) {
        reconciliation = kernel.reconcileRunOutcome({
          runId: local.runId,
          tick: world.tick,
          status: "blocked",
          summary: local.reason,
        });
      }

      const checked = materialKnowledge.checkedAbsence("crate.workshop.01");
      if (!checked) return { status: "blocked_without_checked_absence", local };

      if (!pressureEvidence) {
        pressureEvidence = kernel.recordEvidence({
          id: `evidence:janek:checked-absence:crate.workshop.01:${checked.checkedAtTick}`,
          tick: checked.checkedAtTick,
          kind: "checked_absence",
          summary: `Checked (${checked.checkedPosition.x}, ${checked.checkedPosition.y}); the familiar workshop crate is not visible there now.`,
        });
        kernel.advanceSemanticContext("matter.janek.missing-crate", pressureEvidence.id);
      }

      return {
        status: "semantic_pressure",
        local,
        checkedAbsenceEvidence: structuredClone(pressureEvidence),
      };
    },
    blockedRunReconciliation(): RunOutcomeReconciliationResult | null {
      return reconciliation ? structuredClone(reconciliation) : null;
    },
    semanticPressureEvidence(): ResidentKernelEvidence | null {
      return pressureEvidence ? structuredClone(pressureEvidence) : null;
    },
  };
}