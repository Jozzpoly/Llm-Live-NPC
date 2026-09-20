import { distanceSquared, type ResidentActivity, type Vec2 } from "./contracts";
import type { MaterialObjectState } from "./material-world-state";
import {
  ResidentContinuityKernel,
  type ResidentKernelEvidence,
  type RunOutcomeReconciliationResult,
} from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator, type ResidentExecutionArbitration } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import {
  ResidentLocalMaterialDeliveryRoutine,
  type ResidentLocalMaterialDeliveryStep,
} from "./resident-local-material-delivery-routine";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import {
  ResidentMaterialPickupExecutor,
  type ResidentMaterialPickupStep,
} from "./resident-material-pickup-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const RESIDENT_ID = "resident.janek";
const RELOCATOR_ID = "player.r4-relocator";

export const R4_PRIMARY_OBJECT_ID = "crate.r4.remembered";
export const R4_SECONDARY_OBJECT_ID = "basket.r4.available";
export const R4_IRRELEVANT_OBJECT_ID = "stool.r4.background";

export const R4_PRIMARY_MATTER_ID = "matter.janek.r4.missing-crate";
export const R4_SECONDARY_MATTER_ID = "matter.janek.r4.return-basket";

export const R4_PRIMARY_RUN_ID = "run.janek.r4.pickup-last-known-crate";
export const R4_SECONDARY_PICKUP_RUN_ID = "run.janek.r4.pickup-basket";
export const R4_SECONDARY_PLACE_RUN_ID = "run.janek.r4.place-basket";

const PRIMARY_START = Object.freeze({ x: 500, y: 500 });
const RETREAT_TARGET = Object.freeze({ x: 1_100, y: 500 });
const SECONDARY_START = Object.freeze({ x: 1_100, y: 550 });
export const R4_SECONDARY_DESTINATION = Object.freeze({ x: 1_450, y: 500 });
const IRRELEVANT_START = Object.freeze({ x: 1_180, y: 650 });
const RELOCATOR_SPEED = 24_000;
const RETREAT_GUARD = 420;

export type R4DenseWorkshopStep =
  | { status: "primary_running"; local: ResidentMaterialPickupStep }
  | {
      status: "primary_blocked";
      local: Extract<ResidentMaterialPickupStep, { status: "blocked" }>;
      checkedAbsenceEvidence: ResidentKernelEvidence;
      reconciliation: RunOutcomeReconciliationResult;
      arbitration: ResidentExecutionArbitration;
    }
  | { status: "secondary_running"; local: ResidentLocalMaterialDeliveryStep }
  | {
      status: "secondary_pickup_completed";
      local: Extract<ResidentLocalMaterialDeliveryStep, { status: "pickup_completed" }>;
      arbitrationRequest: ReturnType<ResidentExecutionArbitrator["request"]>;
    }
  | {
      status: "secondary_resolved";
      local: Extract<ResidentLocalMaterialDeliveryStep, { status: "succeeded" }>;
      arbitration: ResidentExecutionArbitration;
    }
  | { status: "authority_lost"; phase: "primary" | "secondary" }
  | { status: "blocked"; phase: "secondary"; reason: string };

export interface R4HiddenRelocation {
  from: Vec2;
  to: Vec2;
  tickBefore: number;
  tickAfter: number;
}

/**
 * R4-B composition experiment.
 *
 * Two resident-owned matters exist before the adversarial World change:
 *
 * A — retrieve a familiar crate from its remembered workshop position.
 * B — return an available basket to its known local shelf.
 *
 * A owns body focus. B owns a legal deferred pickup run. The external relocator moves
 * A while Janek is outside sight. When A later earns checked-absence evidence, its run
 * ends blocked but the matter remains open. Existing execution arbitration then gives
 * the free body to the one remaining deferred B run without inventing a preference.
 *
 * No provider exists in this composition. The nearby stool has resident-acquired
 * material knowledge but no matter/run and therefore must remain background truth.
 */
export function createR4DenseWorkshopSlice() {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_600, maxY: 1_000 },
    regions: [{
      id: "r4-workshop",
      label: "R4 Workshop",
      minX: 0,
      minY: 0,
      maxX: 1_600,
      maxY: 1_000,
    }],
    anchors: [
      { id: "anchor.r4.bench", label: "Workshop Bench", kind: "work", position: { ...PRIMARY_START }, radius: 42 },
      { id: "anchor.r4.shelf", label: "Basket Shelf", kind: "work", position: { ...R4_SECONDARY_DESTINATION }, radius: 42 },
    ],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });

  const resident = world.addResident(RESIDENT_ID, "Janek", { ...PRIMARY_START });
  world.familiarizeResidentWithRegions(RESIDENT_ID, ["r4-workshop"]);

  const objects: MaterialObjectState[] = [
    {
      id: R4_PRIMARY_OBJECT_ID,
      label: "Familiar Workshop Crate",
      radius: 18,
      location: { kind: "free", position: { ...PRIMARY_START } },
    },
    {
      id: R4_SECONDARY_OBJECT_ID,
      label: "Workshop Basket",
      radius: 18,
      location: { kind: "free", position: { ...SECONDARY_START } },
    },
    {
      id: R4_IRRELEVANT_OBJECT_ID,
      label: "Background Stool",
      radius: 18,
      location: { kind: "free", position: { ...IRRELEVANT_START } },
    },
  ];
  for (const object of objects) world.addMaterialObject(object);

  const knowledge = new ResidentMaterialKnowledge(
    RESIDENT_ID,
    [R4_PRIMARY_OBJECT_ID, R4_SECONDARY_OBJECT_ID, R4_IRRELEVANT_OBJECT_ID],
    world,
  );

  // Legal private history: Janek genuinely sees A before later losing sight of it.
  knowledge.sample();
  const acquiredPrimary = knowledge.observation(R4_PRIMARY_OBJECT_ID);
  if (!acquiredPrimary?.currentlyVisible) {
    throw new Error("R4 dense workshop failed to establish primary object history");
  }

  world.setResidentActivity(RESIDENT_ID, retreatActivity());
  let retreatGuard = 0;
  let body = residentBody(world);
  while (
    distanceSquared(body.position, PRIMARY_START) <= body.sightRadius ** 2
    && retreatGuard < RETREAT_GUARD
  ) {
    world.step();
    retreatGuard += 1;
    body = residentBody(world);
  }
  world.setResidentActivity(RESIDENT_ID, idleActivity());
  knowledge.sample();

  if (retreatGuard >= RETREAT_GUARD) {
    throw new Error("R4 dense workshop failed to move resident outside primary sight range");
  }
  const stalePrimary = knowledge.observation(R4_PRIMARY_OBJECT_ID);
  if (!stalePrimary || stalePrimary.currentlyVisible) {
    throw new Error("R4 dense workshop failed to preserve stale primary knowledge");
  }
  if (!knowledge.observation(R4_SECONDARY_OBJECT_ID)?.currentlyVisible) {
    throw new Error("R4 dense workshop secondary object is not locally available after prehistory");
  }
  if (!knowledge.observation(R4_IRRELEVANT_OBJECT_ID)?.currentlyVisible) {
    throw new Error("R4 dense workshop irrelevant object is not legally observable");
  }

  const kernel = new ResidentContinuityKernel();

  const primaryOrigin = kernel.recordEvidence({
    id: "evidence:janek:r4:primary-origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Janek already needs the familiar workshop crate he last saw beside the bench.",
  });
  kernel.openMatter({
    id: R4_PRIMARY_MATTER_ID,
    originEvidenceId: primaryOrigin.id,
    semanticCourse: "retrieve the familiar workshop crate from its last-known bench position",
  });
  kernel.bindRun({
    matterId: R4_PRIMARY_MATTER_ID,
    taskId: "task.janek.r4.pickup-last-known-crate",
    runId: R4_PRIMARY_RUN_ID,
  });

  const secondaryOrigin = kernel.recordEvidence({
    id: "evidence:janek:r4:secondary-origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Janek already intends to return the workshop basket to its local shelf.",
  });
  kernel.openMatter({
    id: R4_SECONDARY_MATTER_ID,
    originEvidenceId: secondaryOrigin.id,
    semanticCourse: "return the visible workshop basket to the local shelf",
  });

  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  const authority = new ResidentWorldExecutionAuthority(RESIDENT_ID, arbitrator, world);

  const primaryFocus = arbitrator.request(R4_PRIMARY_RUN_ID);
  if (primaryFocus.status !== "acquired") {
    throw new Error(`R4 primary run did not acquire initial body focus: ${primaryFocus.status}`);
  }

  const primaryExecutor = new ResidentMaterialPickupExecutor(
    R4_PRIMARY_RUN_ID,
    R4_PRIMARY_OBJECT_ID,
    knowledge,
    authority,
    world,
  );

  const secondaryRoutine = new ResidentLocalMaterialDeliveryRoutine({
    matterId: R4_SECONDARY_MATTER_ID,
    objectId: R4_SECONDARY_OBJECT_ID,
    destination: { ...R4_SECONDARY_DESTINATION },
    pickupTaskId: "task.janek.r4.pickup-basket",
    pickupRunId: R4_SECONDARY_PICKUP_RUN_ID,
    placeTaskId: "task.janek.r4.place-basket",
    placeRunId: R4_SECONDARY_PLACE_RUN_ID,
  }, kernel, knowledge, authority, world);

  const secondaryDemand = arbitrator.request(R4_SECONDARY_PICKUP_RUN_ID);
  if (secondaryDemand.status !== "busy") {
    throw new Error(`R4 secondary pickup should begin as deferred body demand: ${secondaryDemand.status}`);
  }

  let relocationApplied = false;
  let primaryBlocked = false;
  let primaryReconciliation: RunOutcomeReconciliationResult | null = null;
  let checkedAbsenceEvidence: ResidentKernelEvidence | null = null;
  let secondaryResolved = false;

  function relocatePrimaryHidden(): R4HiddenRelocation {
    if (relocationApplied) throw new Error("R4 hidden primary relocation already applied");

    const before = world.materialObject(R4_PRIMARY_OBJECT_ID);
    if (!before || before.location.kind !== "free") {
      throw new Error("R4 primary object is not free before hidden relocation");
    }
    const privateBefore = knowledge.observation(R4_PRIMARY_OBJECT_ID);
    if (!privateBefore || privateBefore.currentlyVisible) {
      throw new Error("R4 primary relocation requires already-stale private knowledge");
    }

    const tickBefore = world.tick;
    world.addPlayer(RELOCATOR_ID, before.location.position, { maxSpeed: RELOCATOR_SPEED });
    const pickup = world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "pickup",
      objectId: R4_PRIMARY_OBJECT_ID,
    });
    if (pickup.status !== "succeeded") throw new Error("R4 relocator failed to pick up primary object");

    world.setActorMotionIntent(RELOCATOR_ID, { x: -RELOCATOR_SPEED, y: 0 });
    world.step();
    world.setActorMotionIntent(RELOCATOR_ID, { x: 0, y: 0 });

    const relocator = world.publicSnapshot().actors.find((actor) => actor.id === RELOCATOR_ID);
    if (!relocator) throw new Error("R4 relocator body disappeared");
    const place = world.attemptMaterialAction(RELOCATOR_ID, {
      kind: "place",
      objectId: R4_PRIMARY_OBJECT_ID,
      position: relocator.position,
    });
    if (place.status !== "succeeded") throw new Error("R4 relocator failed to place primary object");

    // Leave the fixture moving away from the future checked-absence location.
    world.setActorMotionIntent(RELOCATOR_ID, { x: 0, y: RELOCATOR_SPEED });

    knowledge.sample();
    const privateAfter = knowledge.observation(R4_PRIMARY_OBJECT_ID);
    if (!privateAfter
      || privateAfter.currentlyVisible
      || privateAfter.lastKnownPosition.x !== privateBefore.lastKnownPosition.x
      || privateAfter.lastKnownPosition.y !== privateBefore.lastKnownPosition.y
      || privateAfter.observedAtTick !== privateBefore.observedAtTick) {
      throw new Error("R4 hidden relocation leaked current primary truth into resident knowledge");
    }

    relocationApplied = true;
    const after = world.materialObject(R4_PRIMARY_OBJECT_ID);
    if (!after || after.location.kind !== "free") {
      throw new Error("R4 primary object lost free World truth after relocation");
    }

    return {
      from: { ...before.location.position },
      to: { ...after.location.position },
      tickBefore,
      tickAfter: world.tick,
    };
  }

  function blockPrimary(local: Extract<ResidentMaterialPickupStep, { status: "blocked" }>): R4DenseWorkshopStep {
    if (!primaryReconciliation) {
      primaryReconciliation = kernel.reconcileRunOutcome({
        runId: R4_PRIMARY_RUN_ID,
        tick: world.tick,
        status: "blocked",
        summary: local.reason,
      });
    }
    if (primaryReconciliation.status !== "recorded") {
      throw new Error("R4 primary blocked outcome did not reconcile");
    }

    const checked = knowledge.checkedAbsence(R4_PRIMARY_OBJECT_ID);
    if (!checked) throw new Error("R4 primary blocked state lacks checked-absence evidence");

    if (!checkedAbsenceEvidence) {
      checkedAbsenceEvidence = kernel.recordEvidence({
        id: `evidence:janek:r4:checked-absence:${checked.checkedAtTick}`,
        tick: checked.checkedAtTick,
        kind: "checked_absence",
        summary: `Checked (${checked.checkedPosition.x}, ${checked.checkedPosition.y}); the familiar crate is not visible there now.`,
      });
      kernel.advanceSemanticContext(R4_PRIMARY_MATTER_ID, checkedAbsenceEvidence.id);
      resident.promoteSemanticPressure({
        id: `reason:${RESIDENT_ID}:r4:checked-absence:${R4_PRIMARY_OBJECT_ID}`,
        tick: checkedAbsenceEvidence.tick,
        kind: "uncertainty",
        salience: 0.9,
        summary: `Expected familiar material object is absent: ${checkedAbsenceEvidence.summary}`,
        evidenceIds: [checkedAbsenceEvidence.id],
      });
    }

    primaryBlocked = true;
    const arbitration = arbitrator.reconcile();
    if (arbitration.status !== "acquired_deferred"
      || arbitration.runId !== R4_SECONDARY_PICKUP_RUN_ID) {
      throw new Error(`R4 blocked primary did not hand body to the sole deferred local matter: ${arbitration.status}`);
    }

    world.step();
    return {
      status: "primary_blocked",
      local,
      checkedAbsenceEvidence: structuredClone(checkedAbsenceEvidence),
      reconciliation: structuredClone(primaryReconciliation),
      arbitration: structuredClone(arbitration),
    };
  }

  function advanceSecondary(): R4DenseWorkshopStep {
    const local = secondaryRoutine.step();

    if (local.status === "authority_lost") {
      return { status: "authority_lost", phase: "secondary" };
    }
    if (local.status === "blocked") {
      return { status: "blocked", phase: "secondary", reason: local.reason };
    }

    if (local.status === "pickup_completed") {
      const arbitrationRequest = arbitrator.request(R4_SECONDARY_PLACE_RUN_ID);
      if (arbitrationRequest.status !== "acquired") {
        throw new Error(`R4 secondary place successor did not acquire free body: ${arbitrationRequest.status}`);
      }
      world.step();
      return {
        status: "secondary_pickup_completed",
        local,
        arbitrationRequest: structuredClone(arbitrationRequest),
      };
    }

    if (local.status === "succeeded") {
      secondaryResolved = true;
      const arbitration = arbitrator.reconcile();
      world.step();
      return {
        status: "secondary_resolved",
        local,
        arbitration: structuredClone(arbitration),
      };
    }

    world.step();
    return { status: "secondary_running", local };
  }

  return {
    world,
    resident,
    kernel,
    knowledge,
    focus,
    arbitrator,
    authority,
    primaryMatterId: R4_PRIMARY_MATTER_ID,
    secondaryMatterId: R4_SECONDARY_MATTER_ID,
    relocatePrimaryHidden,
    primaryBlocked: () => primaryBlocked,
    secondaryResolved: () => secondaryResolved,
    checkedAbsenceEvidence: () => checkedAbsenceEvidence ? structuredClone(checkedAbsenceEvidence) : null,
    advanceOneWorldTick(): R4DenseWorkshopStep {
      if (!relocationApplied) {
        throw new Error("R4 hidden primary relocation must be applied before recovered execution begins");
      }

      if (!primaryBlocked) {
        knowledge.sample();
        const local = primaryExecutor.step();
        if (local.status === "authority_lost") {
          world.step();
          return { status: "authority_lost", phase: "primary" };
        }
        if (local.status === "blocked") return blockPrimary(local);
        world.step();
        return { status: "primary_running", local };
      }

      if (!secondaryResolved) return advanceSecondary();

      world.step();
      return {
        status: "secondary_resolved",
        local: secondaryRoutine.step() as Extract<ResidentLocalMaterialDeliveryStep, { status: "succeeded" }>,
        arbitration: arbitrator.reconcile(),
      };
    },
  };
}

function residentBody(world: SpcWorldRuntime) {
  const body = world.publicSnapshot().actors.find((actor) => actor.id === RESIDENT_ID);
  if (!body) throw new Error("R4 resident body missing");
  return body;
}

function retreatActivity(): ResidentActivity {
  return {
    id: "activity:janek:r4-prehistory-retreat",
    kind: "travel",
    targetActorId: null,
    targetPosition: { ...RETREAT_TARGET },
    text: null,
    speed: 115,
    reason: "fixture prehistory after legally seeing the primary object",
  };
}

function idleActivity(): ResidentActivity {
  return {
    id: "activity:janek:r4-prehistory-complete",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "R4 fixture prehistory complete; recovered run authority now owns body execution",
  };
}
