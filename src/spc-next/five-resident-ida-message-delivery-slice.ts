import type { KnownActorContext } from "./cognition-contract";
import { distanceSquared, type ResidentActivity, type Vec2, type WorldOccurrence } from "./contracts";
import {
  FIVE_RESIDENT_ANCHORS,
  FIVE_RESIDENT_FAMILIARITY,
  FIVE_RESIDENT_MATERIAL_OBJECTS,
  FIVE_RESIDENT_REGIONS,
} from "./five-resident-region";
import {
  ResidentContinuityKernel,
  type RunOutcomeReconciliationResult,
} from "./resident-continuity-kernel";
import {
  ResidentMessageDeliveryExecutor,
  type ResidentMessageDeliveryStep,
} from "./resident-message-delivery-executor";
import type { ResidentRuntime } from "./resident-runtime";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

export const IDA_MESSAGE_TEXT = "Mira says the field well needs checking before dusk.";
export const IDA_MESSAGE_MATTER_ID = "matter.ida.message-for-janek";
export const IDA_MESSAGE_RUN_ID = "run.ida.deliver-message-to-janek";

const IDA_ID = "resident.ida";
const MIRA_ID = "resident.mira";
const JANEK_ID = "resident.janek";
const IDA_HOME = Object.freeze({ x: 3_050, y: 880 });
const MIRA_WITNESS_POSITION = Object.freeze({ x: 1_980, y: 790 });
const JANEK_WORKSHOP_POSITION = Object.freeze({ x: 1_900, y: 720 });
const PREHISTORY_CONTACT_GUARD = 900;
const PREHISTORY_RETREAT_GUARD = 900;
const ARRIVAL_TOLERANCE = 20;

export type FiveResidentIdaMessageDeliveryStep =
  | { status: "running"; local: Extract<ResidentMessageDeliveryStep, { status: "running" }> }
  | {
      status: "delivered";
      local: Extract<ResidentMessageDeliveryStep, { status: "delivered" }>;
      reconciliation: RunOutcomeReconciliationResult;
    }
  | {
      status: "blocked";
      local: Extract<ResidentMessageDeliveryStep, { status: "blocked" }>;
      reconciliation: RunOutcomeReconciliationResult;
    }
  | { status: "authority_lost"; local: Extract<ResidentMessageDeliveryStep, { status: "authority_lost" }> };

export interface FiveResidentIdaMessageDeliverySlice {
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  authority: ResidentWorldExecutionAuthority;
  advanceOneWorldTick(): FiveResidentIdaMessageDeliveryStep;
  idaRecipientContact(): KnownActorContext | null;
  idaSourceContact(): KnownActorContext | null;
  reconciliation(): RunOutcomeReconciliationResult | null;
  deliveredOccurrence(): WorldOccurrence | null;
}

/**
 * I1 social vertical slice.
 *
 * The variable under test begins after authored prehistory. That prehistory establishes
 * identities through legal sight and an already-accepted private commitment: Mira had
 * previously asked Ida to carry one concrete message to Janek, and Ida accepted. I1
 * deliberately does NOT yet claim to model arbitrary request interpretation or the
 * moment responsibility is voluntarily accepted.
 *
 * Runtime pressure is narrower and causal: Ida must use only her private remembered
 * contact with Janek, physically reacquire him, emit the message through exact run
 * authority, and resolve her own matter only after the World accepted that speech
 * occurrence. Recipient understanding remains a separate future question.
 */
export function createFiveResidentIdaMessageDeliverySlice(): FiveResidentIdaMessageDeliverySlice {
  const { world, runtimes } = createIdaSpecimenWorld();
  establishIdaMessagePrehistory(world, runtimes);

  const idaJanek = knownActor(runtimes.ida, world.tick, JANEK_ID);
  const idaMira = knownActor(runtimes.ida, world.tick, MIRA_ID);
  const janekIda = knownActor(runtimes.janek, world.tick, IDA_ID);
  const miraIda = knownActor(runtimes.mira, world.tick, IDA_ID);
  if (!idaJanek?.lastKnownPosition || idaJanek.currentlyVisible) {
    throw new Error("I1 prehistory must leave Ida with stale-but-legal Janek contact evidence");
  }
  if (!idaMira || !janekIda || !miraIda) {
    throw new Error("I1 prehistory failed to establish legal participant identities through sight");
  }

  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:ida:accepted-message:origin",
    tick: world.tick,
    kind: "accepted_social_commitment",
    summary: `Earlier Mira asked Ida to tell Janek: ${IDA_MESSAGE_TEXT} Ida accepted the responsibility.`,
  });
  kernel.openMatter({
    id: IDA_MESSAGE_MATTER_ID,
    originEvidenceId: origin.id,
    semanticCourse: "find Janek from private contact evidence and deliver Mira's accepted message",
  });
  kernel.bindRun({
    matterId: IDA_MESSAGE_MATTER_ID,
    taskId: "task.ida.deliver-message-to-janek",
    runId: IDA_MESSAGE_RUN_ID,
  });

  const authority = new ResidentWorldExecutionAuthority(IDA_ID, kernel, world);
  const executor = new ResidentMessageDeliveryExecutor(
    IDA_MESSAGE_RUN_ID,
    JANEK_ID,
    IDA_MESSAGE_TEXT,
    (actorId) => knownActor(runtimes.ida, world.tick, actorId),
    authority,
    world,
  );

  let reconciled: RunOutcomeReconciliationResult | null = null;
  let delivered: WorldOccurrence | null = null;

  return {
    world,
    kernel,
    authority,
    advanceOneWorldTick(): FiveResidentIdaMessageDeliveryStep {
      if (reconciled?.status === "recorded") {
        const matter = kernel.matter(IDA_MESSAGE_MATTER_ID);
        if (matter?.status === "resolved" && delivered) {
          return {
            status: "delivered",
            local: {
              status: "delivered",
              runId: IDA_MESSAGE_RUN_ID,
              recipientId: JANEK_ID,
              occurrence: structuredClone(delivered),
            },
            reconciliation: structuredClone(reconciled),
          };
        }
      }

      const local = executor.step();
      if (local.status === "delivered") {
        delivered = structuredClone(local.occurrence);
        reconciled = kernel.reconcileRunOutcome({
          runId: local.runId,
          tick: local.occurrence.tick,
          status: "succeeded",
          summary: `Ida spoke the accepted message to Janek through World speech occurrence ${local.occurrence.id}`,
        });
        if (reconciled.status !== "recorded") {
          throw new Error("I1 delivery run could not reconcile its factual World speech outcome");
        }
        kernel.resolveMatter(IDA_MESSAGE_MATTER_ID);
        // World occurrence delivery is an authoritative phase, so advance the same
        // specimen tick before exposing terminal I1 evidence to callers.
        world.step();
        return { status: "delivered", local, reconciliation: structuredClone(reconciled) };
      }

      if (local.status === "blocked") {
        reconciled = kernel.reconcileRunOutcome({
          runId: local.runId,
          tick: world.tick,
          status: "blocked",
          summary: local.reason === "recipient_absent_at_best_known_contact"
            ? "Ida checked Janek's best-known contact point but did not reacquire him."
            : `Ida could not deliver the message: ${local.reason}.`,
        });
        world.step();
        return { status: "blocked", local, reconciliation: structuredClone(reconciled) };
      }

      world.step();
      if (local.status === "authority_lost") return { status: "authority_lost", local };
      return { status: "running", local };
    },
    idaRecipientContact(): KnownActorContext | null {
      return cloneKnownActor(knownActor(runtimes.ida, world.tick, JANEK_ID));
    },
    idaSourceContact(): KnownActorContext | null {
      return cloneKnownActor(knownActor(runtimes.ida, world.tick, MIRA_ID));
    },
    reconciliation(): RunOutcomeReconciliationResult | null {
      return reconciled ? structuredClone(reconciled) : null;
    },
    deliveredOccurrence(): WorldOccurrence | null {
      return delivered ? structuredClone(delivered) : null;
    },
  };
}

function createIdaSpecimenWorld(): {
  world: SpcWorldRuntime;
  runtimes: { mira: ResidentRuntime; janek: ResidentRuntime; ida: ResidentRuntime };
} {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 8_192, maxY: 8_192 },
    regions: FIVE_RESIDENT_REGIONS,
    anchors: FIVE_RESIDENT_ANCHORS,
    chunkSize: 256,
    fixedDeltaSeconds: 1 / 60,
  });

  world.addPlayer("player.jozz", { x: 620, y: 620 }, { maxSpeed: 150 });
  const mira = world.addResident(MIRA_ID, "Mira", { x: 760, y: 650 });
  const janek = world.addResident(JANEK_ID, "Janek", JANEK_WORKSHOP_POSITION);
  const ida = world.addResident(IDA_ID, "Ida", IDA_HOME);
  world.addResident("resident.oren", "Oren", { x: 4_650, y: 2_650 });
  world.addResident("resident.nela", "Nela", { x: 6_950, y: 1_100 });
  for (const object of FIVE_RESIDENT_MATERIAL_OBJECTS) world.addMaterialObject(object);

  for (const [residentId, familiarRegions] of Object.entries(FIVE_RESIDENT_FAMILIARITY)) {
    world.familiarizeResidentWithRegions(residentId, familiarRegions);
  }
  for (const residentId of [MIRA_ID, JANEK_ID, IDA_ID, "resident.oren", "resident.nela"]) {
    world.setResidentActivity(residentId, idleActivity(residentId, "I1 prehistory idle"));
  }
  return { world, runtimes: { mira, janek, ida } };
}

function establishIdaMessagePrehistory(
  world: SpcWorldRuntime,
  runtimes: { mira: ResidentRuntime; janek: ResidentRuntime; ida: ResidentRuntime },
): void {
  // Ida and Mira converge on Janek's workshop. This physically establishes the
  // identities used by the authored commitment instead of smuggling global actor ids
  // into private resident knowledge merely because the fixture knows them.
  world.setResidentActivity(IDA_ID, travelActivity("ida-prehistory-contact", JANEK_WORKSHOP_POSITION, "meet Janek before the I1 commitment begins"));
  world.setResidentActivity(MIRA_ID, travelActivity("mira-prehistory-witness", MIRA_WITNESS_POSITION, "be near Janek for the later addressed-speech witness test"));

  let contactGuard = 0;
  while (contactGuard < PREHISTORY_CONTACT_GUARD) {
    world.step();
    contactGuard += 1;
    const idaJanek = knownActor(runtimes.ida, world.tick, JANEK_ID);
    const idaMira = knownActor(runtimes.ida, world.tick, MIRA_ID);
    const janekIda = knownActor(runtimes.janek, world.tick, IDA_ID);
    const miraIda = knownActor(runtimes.mira, world.tick, IDA_ID);
    if (idaJanek?.currentlyVisible && idaMira && janekIda && miraIda) break;
  }
  if (contactGuard >= PREHISTORY_CONTACT_GUARD) {
    throw new Error("I1 prehistory could not establish Ida/Mira/Janek identity contact");
  }

  world.setResidentActivity(IDA_ID, travelActivity("ida-prehistory-retreat", IDA_HOME, "return to the crossroads before the message-delivery specimen begins"));

  let retreatGuard = 0;
  while (retreatGuard < PREHISTORY_RETREAT_GUARD) {
    world.step();
    retreatGuard += 1;
    const idaPosition = actorPosition(world, IDA_ID);
    const miraPosition = actorPosition(world, MIRA_ID);
    const idaJanek = knownActor(runtimes.ida, world.tick, JANEK_ID);
    if (
      distanceSquared(idaPosition, IDA_HOME) <= ARRIVAL_TOLERANCE ** 2
      && distanceSquared(miraPosition, MIRA_WITNESS_POSITION) <= ARRIVAL_TOLERANCE ** 2
      && idaJanek
      && !idaJanek.currentlyVisible
    ) break;
  }
  if (retreatGuard >= PREHISTORY_RETREAT_GUARD) {
    throw new Error("I1 prehistory could not separate Ida from Janek while preserving contact history");
  }

  world.setResidentActivity(IDA_ID, idleActivity(IDA_ID, "I1 commitment starts from Ida's own social route"));
  world.setResidentActivity(MIRA_ID, idleActivity(MIRA_ID, "remain a nearby but unaddressed speech witness"));
  world.step();
}

function knownActor(runtime: ResidentRuntime, tick: number, actorId: string): KnownActorContext | null {
  const context = runtime.cognitionContext({
    residentId: runtime.profile.id,
    requestedAtTick: tick,
    reasons: [],
  });
  const actor = context.knownActors.find((candidate) => candidate.id === actorId);
  return actor ? cloneKnownActor(actor) : null;
}

function cloneKnownActor(actor: KnownActorContext | null): KnownActorContext | null {
  return actor ? structuredClone(actor) : null;
}

function actorPosition(world: SpcWorldRuntime, actorId: string): Vec2 {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`I1 fixture actor missing: ${actorId}`);
  return { ...actor.position };
}

function idleActivity(id: string, reason: string): ResidentActivity {
  return {
    id: `activity:${id}:idle:i1`,
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason,
  };
}

function travelActivity(id: string, targetPosition: Vec2, reason: string): ResidentActivity {
  return {
    id: `activity:${id}:travel:i1`,
    kind: "travel",
    targetActorId: null,
    targetPosition: { ...targetPosition },
    text: null,
    speed: 110,
    reason,
  };
}
