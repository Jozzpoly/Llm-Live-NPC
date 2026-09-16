import {
  ResidentContinuityKernel,
  type ResidentKernelEvidence,
  type RunOutcomeReconciliationResult,
} from "./resident-continuity-kernel";
import { distanceSquared, type ResidentActivity, type Vec2 } from "./contracts";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentMaterialPickupExecutor, type ResidentMaterialPickupStep } from "./resident-material-pickup-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import { SpcWorldRuntime } from "./spc-world-runtime";

const JANEK_ID = "resident.janek";
const CRATE_ID = "crate.workshop.01";
const HIDDEN_RELOCATOR_ID = "player.relocator";
const PREHISTORY_RETREAT_TARGET = { x: 1_380, y: 720 } as const;
const PREHISTORY_RETREAT_GUARD = 420;

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
  /** Optional authored participant start for interaction/recovery specimens. */
  playerStart?: Vec2;
}

export interface FiveResidentJanekHiddenRelocation {
  tickBefore: number;
  tickAfter: number;
  from: Vec2;
  to: Vec2;
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

export interface FiveResidentJanekMissingCrateStagedSlice extends FiveResidentJanekMissingCrateSlice {
  relocateCrateHidden(): FiveResidentJanekHiddenRelocation;
  hiddenRelocationApplied(): boolean;
}

/**
 * Staged missing-crate composition for causal/browser evidence.
 *
 * Prehistory is allowed to establish only legally acquired resident history: Janek
 * sees the familiar crate, then retreats just outside sight range while retaining
 * that last-known position. The variable under test — external relocation of the
 * crate — is deliberately NOT performed by the constructor. Call
 * relocateCrateHidden() to put that World change on an explicit causal boundary.
 */
export function createFiveResidentJanekMissingCrateStagedSlice(
  options: FiveResidentJanekMissingCrateOptions = {},
): FiveResidentJanekMissingCrateStagedSlice {
  const hiddenRelocationSpeed = options.hiddenRelocationSpeed ?? 48_000;
  if (!Number.isFinite(hiddenRelocationSpeed) || hiddenRelocationSpeed <= 0) {
    throw new Error("hiddenRelocationSpeed must be positive and finite");
  }

  const world = createFiveResidentRegionWorld({ playerStart: options.playerStart });
  const materialKnowledge = new ResidentMaterialKnowledge(JANEK_ID, [CRATE_ID], world);

  // Legal acquisition happens while Janek is physically beside the familiar crate.
  materialKnowledge.sample();
  const acquired = materialKnowledge.observation(CRATE_ID);
  if (!acquired?.currentlyVisible) throw new Error("Janek failed to acquire initial crate evidence");

  // Use the existing resident controller for prehistory instead of writing a long
  // direct motion intent that legacy fastStep is entitled to overwrite. This keeps
  // the fixture honest: Janek really travels away under the same World integration
  // contract, then the legacy activity is stopped before recovered run authority is
  // claimed. We stop at the first tick outside material sight range so the later
  // stale-target approach remains bounded by the existing 360-step life-slice guard.
  world.setResidentActivity(JANEK_ID, prehistoryRetreatActivity());
  const crateAtAcquisition = world.materialObject(CRATE_ID);
  if (!crateAtAcquisition || crateAtAcquisition.location.kind !== "free") {
    throw new Error("missing-crate prehistory lost the free crate before retreat");
  }

  let retreatGuard = 0;
  let janek = world.publicSnapshot().actors.find((actor) => actor.id === JANEK_ID) ?? null;
  while (janek
    && distanceSquared(janek.position, crateAtAcquisition.location.position) <= janek.sightRadius ** 2
    && retreatGuard < PREHISTORY_RETREAT_GUARD) {
    world.step();
    retreatGuard += 1;
    janek = world.publicSnapshot().actors.find((actor) => actor.id === JANEK_ID) ?? null;
  }
  world.setResidentActivity(JANEK_ID, prehistoryIdleActivity());
  materialKnowledge.sample();

  const crateBefore = world.materialObject(CRATE_ID);
  if (!janek || !crateBefore || crateBefore.location.kind !== "free") {
    throw new Error("missing-crate staged prehistory did not preserve Janek/crate World truth");
  }
  if (retreatGuard >= PREHISTORY_RETREAT_GUARD
    || distanceSquared(janek.position, crateBefore.location.position) <= janek.sightRadius ** 2) {
    throw new Error("missing-crate staged prehistory did not move Janek outside crate sight range");
  }

  const remembered = materialKnowledge.observation(CRATE_ID);
  if (!remembered || remembered.currentlyVisible || remembered.lastKnownPosition.x !== crateBefore.location.position.x
    || remembered.lastKnownPosition.y !== crateBefore.location.position.y) {
    throw new Error("missing-crate staged prehistory did not preserve last-known crate evidence");
  }

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

  const authority = new ResidentWorldExecutionAuthority(JANEK_ID, kernel, world);
  const executor = new ResidentMaterialPickupExecutor(
    "run.janek.pickup-last-known-crate",
    CRATE_ID,
    materialKnowledge,
    authority,
    world,
  );

  let relocationApplied = false;
  let reconciliation: RunOutcomeReconciliationResult | null = null;
  let pressureEvidence: ResidentKernelEvidence | null = null;

  return {
    world,
    kernel,
    materialKnowledge,
    authority,
    relocateCrateHidden(): FiveResidentJanekHiddenRelocation {
      if (relocationApplied) throw new Error("hidden crate relocation already applied");

      const before = world.materialObject(CRATE_ID);
      if (!before || before.location.kind !== "free") throw new Error("crate is not free before hidden relocation");
      const privateBefore = materialKnowledge.snapshot();
      const tickBefore = world.tick;

      world.addPlayer(HIDDEN_RELOCATOR_ID, before.location.position, { maxSpeed: hiddenRelocationSpeed });
      const pickupByRelocator = world.attemptMaterialAction(HIDDEN_RELOCATOR_ID, {
        kind: "pickup",
        objectId: CRATE_ID,
      });
      if (pickupByRelocator.status !== "succeeded") throw new Error("failed to prepare hidden crate relocation");

      // Preserve the original adversarial variable: the crate moves one real World
      // tick east to the same hidden position used by the search/recovery evidence.
      world.setActorMotionIntent(HIDDEN_RELOCATOR_ID, { x: hiddenRelocationSpeed, y: 0 });
      world.step();
      world.setActorMotionIntent(HIDDEN_RELOCATOR_ID, { x: 0, y: 0 });
      const relocator = world.publicSnapshot().actors.find((actor) => actor.id === HIDDEN_RELOCATOR_ID);
      if (!relocator) throw new Error("relocator actor missing");
      const placedByRelocator = world.attemptMaterialAction(HIDDEN_RELOCATOR_ID, {
        kind: "place",
        objectId: CRATE_ID,
        position: relocator.position,
      });
      if (placedByRelocator.status !== "succeeded") throw new Error("failed to finish hidden crate relocation");

      // Do not let the research fixture wait at the future reacquisition target.
      // The next ordinary World tick moves it south, away from Janek's search and
      // away from Ida, while the crate remains at the original hidden position.
      world.setActorMotionIntent(HIDDEN_RELOCATOR_ID, { x: 0, y: hiddenRelocationSpeed });

      materialKnowledge.sample();
      const privateAfter = materialKnowledge.snapshot();
      if (JSON.stringify(privateAfter) !== JSON.stringify(privateBefore)) {
        throw new Error("hidden relocation leaked into Janek material knowledge");
      }
      const leakedRelocator = world.residentDiagnostics(JANEK_ID).recentPercepts
        .some((percept) => percept.actorId === HIDDEN_RELOCATOR_ID);
      if (leakedRelocator) throw new Error("hidden relocator leaked into Janek actor perception");

      const after = world.materialObject(CRATE_ID);
      if (!after || after.location.kind !== "free") throw new Error("crate is not free after hidden relocation");
      relocationApplied = true;
      return {
        tickBefore,
        tickAfter: world.tick,
        from: { ...before.location.position },
        to: { ...after.location.position },
      };
    },
    hiddenRelocationApplied(): boolean {
      return relocationApplied;
    },
    stepJanek(): FiveResidentJanekMissingCrateStep {
      if (!relocationApplied) {
        throw new Error("hidden crate relocation must be applied before Janek execution begins");
      }
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

      const checked = materialKnowledge.checkedAbsence(CRATE_ID);
      if (!checked) return { status: "blocked_without_checked_absence", local };

      if (!pressureEvidence) {
        pressureEvidence = kernel.recordEvidence({
          id: `evidence:janek:checked-absence:${CRATE_ID}:${checked.checkedAtTick}`,
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

/**
 * Convenience composition retained for deterministic/core tests.
 *
 * It now delegates to the staged specimen and explicitly applies the adversarial
 * relocation before returning. Browser evidence can instead keep that relocation
 * visible as its own causal boundary through createFiveResidentJanekMissingCrateStagedSlice().
 */
export function createFiveResidentJanekMissingCrateSlice(
  options: FiveResidentJanekMissingCrateOptions = {},
): FiveResidentJanekMissingCrateSlice {
  const staged = createFiveResidentJanekMissingCrateStagedSlice(options);
  staged.relocateCrateHidden();
  return staged;
}

function prehistoryRetreatActivity(): ResidentActivity {
  return {
    id: "activity:janek:missing-crate-prehistory-retreat",
    kind: "travel",
    targetActorId: null,
    targetPosition: { ...PREHISTORY_RETREAT_TARGET },
    text: null,
    speed: 115,
    reason: "fixture-only retreat after legally seeing the familiar crate",
  };
}

function prehistoryIdleActivity(): ResidentActivity {
  return {
    id: "activity:janek:missing-crate-prehistory-complete",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "fixture prehistory complete; waiting for recovered missing-crate run",
  };
}
