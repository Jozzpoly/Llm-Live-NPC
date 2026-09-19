import type { ResidentPercept, WorldOccurrence } from "./contracts";
import type { MaterialObjectState } from "./material-world-state";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import {
  ResidentLocalMaterialDeliveryRoutine,
  type ResidentLocalMaterialDeliveryStep,
} from "./resident-local-material-delivery-routine";
import {
  ResidentLocalContactRoutine,
  type ResidentLocalContactSnapshot,
} from "./resident-local-contact-routine";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const RESIDENT_ID = "resident.mira";
const PLAYER_ID = "player.jozz";
const OBJECT_ID = "basket.workshop.local-life";
const MAIN_MATTER_ID = "matter.mira.local-life.restore-basket";
const PICKUP_RUN_ID = "run.mira.local-life.pickup-basket";
const PLACE_RUN_ID = "run.mira.local-life.place-basket";
const DESTINATION = Object.freeze({ x: 1_080, y: 500 });
const INTERRUPTION_HOLD_TICKS = 12;
const LOCAL_RESPONSE = "Tak?";

export type ZeroProviderLocalLifePhase =
  | "pickup"
  | "delivery"
  | "interrupted"
  | "settled";

export type ZeroProviderLocalAttention =
  | { kind: "matter"; matterId: string; reason: string }
  | { kind: "actor"; actorId: string | null; reason: string }
  | { kind: "quiet"; reason: string };

export interface ZeroProviderLocalDecision {
  tick: number;
  perceptId: string;
  occurrenceId: string;
  classification: "background" | "interrupt";
  cognitionReasonId: string | null;
  cognitionReasonSettled: boolean;
  summary: string;
}

export interface ZeroProviderLocalInterruptionSnapshot {
  status: "none" | "active" | "completed";
  interruptMatterId: string | null;
  interruptRunId: string | null;
  mainRunId: string | null;
  addressedPerceptId: string | null;
  startedAtTick: number | null;
  responseOccurrenceId: string | null;
  resumedAtTick: number | null;
  remainingHoldTicks: number;
}

export type ZeroProviderLocalLifeStep =
  | { status: "running"; phase: "pickup" | "delivery"; local: ResidentLocalMaterialDeliveryStep }
  | { status: "pickup_completed"; tick: number }
  | { status: "interruption_started"; interruption: ZeroProviderLocalInterruptionSnapshot }
  | { status: "interruption_responded"; interruption: ZeroProviderLocalInterruptionSnapshot }
  | { status: "interruption_holding"; interruption: ZeroProviderLocalInterruptionSnapshot }
  | { status: "interruption_resumed"; interruption: ZeroProviderLocalInterruptionSnapshot }
  | { status: "settled"; tick: number }
  | { status: "blocked"; phase: "pickup" | "delivery"; reason: string }
  | { status: "authority_lost"; phase: "pickup" | "delivery" };


/**
 * R1 executable specimen: one resident keeps a mundane material matter alive with
 * zero provider cognition. Local perception relevance may close exact scheduler
 * pressure after it has been handled locally; no fake semantic proposal creates or
 * redirects the resident's purpose.
 *
 * The authored initial matter is intentional experimental starting context, analogous
 * to beginning a play session while a person is already in the middle of something.
 * From that point onward body execution, interruption, return and factual consequence
 * are resident-local + World-authoritative.
 */
export function createZeroProviderLocalLifeSlice() {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_400, maxY: 1_000 },
    regions: [{
      id: "local-workshop",
      label: "Local Workshop",
      minX: 0,
      minY: 0,
      maxX: 1_400,
      maxY: 1_000,
    }],
    anchors: [
      { id: "anchor.local.workbench", label: "Workbench", kind: "work", position: { x: 760, y: 500 }, radius: 42 },
      { id: "anchor.local.shelf", label: "Shelf", kind: "work", position: { ...DESTINATION }, radius: 42 },
    ],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });

  world.addPlayer(PLAYER_ID, { x: 520, y: 700 });
  const resident = world.addResident(RESIDENT_ID, "Mira", { x: 700, y: 500 });
  world.familiarizeResidentWithRegions(RESIDENT_ID, ["local-workshop"]);
  const object: MaterialObjectState = {
    id: OBJECT_ID,
    label: "Workshop Basket",
    radius: 18,
    location: { kind: "free", position: { x: 760, y: 500 } },
  };
  world.addMaterialObject(object);

  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence.mira.local-life.restore-basket.origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Mira already intends to put the workshop basket back beside the shelf before returning to quiet local life.",
  });
  kernel.openMatter({
    id: MAIN_MATTER_ID,
    originEvidenceId: origin.id,
    semanticCourse: "put the workshop basket back beside the local shelf",
  });
  const knowledge = new ResidentMaterialKnowledge(RESIDENT_ID, [OBJECT_ID], world);
  const authority = new ResidentWorldExecutionAuthority(RESIDENT_ID, kernel, world);
  const materialRoutine = new ResidentLocalMaterialDeliveryRoutine({
    matterId: MAIN_MATTER_ID,
    objectId: OBJECT_ID,
    destination: DESTINATION,
    pickupTaskId: "task.mira.local-life.pickup-basket",
    pickupRunId: PICKUP_RUN_ID,
    placeTaskId: "task.mira.local-life.place-basket",
    placeRunId: PLACE_RUN_ID,
  }, kernel, knowledge, authority, world);
  const contactRoutine = new ResidentLocalContactRoutine(
    RESIDENT_ID,
    kernel,
    authority,
    world,
    {
      responseText: LOCAL_RESPONSE,
      holdTicks: INTERRUPTION_HOLD_TICKS,
      responseRadius: 420,
    },
  );
  let phase: ZeroProviderLocalLifePhase = "pickup";
  let attention: ZeroProviderLocalAttention = {
    kind: "matter",
    matterId: MAIN_MATTER_ID,
    reason: "restore the workshop basket",
  };
  let phaseBeforeContact: Exclude<ZeroProviderLocalLifePhase, "interrupted"> | null = null;
  const handledPercepts = new Set<string>();
  const localDecisions: ZeroProviderLocalDecision[] = [];

  function settlePerceptReasonLocally(percept: ResidentPercept): { id: string | null; settled: boolean } {
    const settled = resident.settlePerceptCognitionLocally(percept.id);
    return {
      id: settled[0]?.id ?? null,
      settled: settled.length > 0,
    };
  }

  function processNewPercepts(): ZeroProviderLocalInterruptionSnapshot | null {
    const percepts = world.residentDiagnostics(RESIDENT_ID).recentPercepts;
    let started: ZeroProviderLocalInterruptionSnapshot | null = null;

    for (const percept of percepts) {
      if (handledPercepts.has(percept.id)) continue;
      handledPercepts.add(percept.id);

      const shouldInterrupt = percept.phenomenon === "speech"
        && percept.modality === "hearing"
        && percept.addressed
        && percept.text !== null
        && phase !== "interrupted"
        && !contactRoutine.active();

      const settled = settlePerceptReasonLocally(percept);
      localDecisions.push({
        tick: world.tick,
        perceptId: percept.id,
        occurrenceId: percept.occurrenceId,
        classification: shouldInterrupt ? "interrupt" : "background",
        cognitionReasonId: settled.id,
        cognitionReasonSettled: settled.settled,
        summary: shouldInterrupt
          ? `locally interrupt for addressed speech: ${percept.text}`
          : `locally bounded/background: ${percept.summary}`,
      });

      if (shouldInterrupt) {
        started = beginInterruption(percept);
      }
    }

    return started;
  }

  function beginInterruption(percept: ResidentPercept): ZeroProviderLocalInterruptionSnapshot {
    const main = kernel.matter(MAIN_MATTER_ID);
    const interrupted = main?.status === "active" && main.activeRunId
      ? { matterId: MAIN_MATTER_ID, runId: main.activeRunId }
      : null;

    phaseBeforeContact = phase === "interrupted" ? null : phase;
    contactRoutine.begin(percept, interrupted);
    attention = {
      kind: "actor",
      actorId: percept.actorId,
      reason: "locally acknowledge addressed contact",
    };
    phase = "interrupted";
    return interruptionSnapshot();
  }

  function advanceInterruption(): ZeroProviderLocalLifeStep {
    const local = contactRoutine.step();

    if (local.status === "completed") {
      const returnPhase = phaseBeforeContact ?? "settled";
      phaseBeforeContact = null;
      phase = returnPhase;
      attention = returnPhase === "settled"
        ? {
            kind: "quiet",
            reason: "no unresolved local matter requires action after bounded contact",
          }
        : {
            kind: "matter",
            matterId: MAIN_MATTER_ID,
            reason: "return to the still-unfinished basket matter",
          };
    }

    world.step();
    knowledge.sample();
    processNewPercepts();

    if (local.status === "responded") {
      return { status: "interruption_responded", interruption: interruptionSnapshot() };
    }
    if (local.status === "holding") {
      return { status: "interruption_holding", interruption: interruptionSnapshot() };
    }
    return { status: "interruption_resumed", interruption: interruptionSnapshot() };
  }

  function stepMainLife(): ZeroProviderLocalLifeStep {
    if (phase === "settled") {
      world.step();
      knowledge.sample();
      processNewPercepts();
      return { status: "settled", tick: world.tick };
    }

    const local = materialRoutine.step();
    let step: ZeroProviderLocalLifeStep;

    if (local.status === "authority_lost") {
      step = { status: "authority_lost", phase: local.phase };
    } else if (local.status === "blocked") {
      step = { status: "blocked", phase: local.phase, reason: local.reason };
    } else if (local.status === "pickup_completed") {
      phase = "delivery";
      step = { status: "pickup_completed", tick: world.tick };
    } else if (local.status === "succeeded") {
      phase = "settled";
      attention = {
        kind: "quiet",
        reason: "basket matter is factually complete; no unresolved local reason requires action",
      };
      step = { status: "settled", tick: world.tick };
    } else {
      phase = local.phase;
      step = { status: "running", phase: local.phase, local };
    }

    world.step();
    knowledge.sample();
    const started = processNewPercepts();
    if (started) return { status: "interruption_started", interruption: started };

    if (phase === "settled") return { status: "settled", tick: world.tick };
    return step;
  }

  function interruptionSnapshot(): ZeroProviderLocalInterruptionSnapshot {
    return projectContactSnapshot(contactRoutine.snapshot());
  }

  return {
    world,
    kernel,
    resident,
    materialKnowledge: knowledge,
    authority,
    phase: () => phase,
    attention: (): ZeroProviderLocalAttention => structuredClone(attention),
    interruption: () => interruptionSnapshot(),
    localDecisions: (): ZeroProviderLocalDecision[] => structuredClone(localDecisions),
    pendingCognitionReasons: () => resident.pendingCognitionReasons(),
    mainMatterId: MAIN_MATTER_ID,
    mainPlaceRunId: PLACE_RUN_ID,
    objectId: OBJECT_ID,
    destination: { ...DESTINATION },
    playerSpeak(text: string, addressed = false): WorldOccurrence {
      return world.speak(PLAYER_ID, text, 420, addressed ? [RESIDENT_ID] : []);
    },
    advanceOneWorldTick(): ZeroProviderLocalLifeStep {
      if (contactRoutine.active()) return advanceInterruption();
      return stepMainLife();
    },
  };
}


function projectContactSnapshot(
  snapshot: ResidentLocalContactSnapshot,
): ZeroProviderLocalInterruptionSnapshot {
  return {
    status: snapshot.status,
    interruptMatterId: snapshot.contactMatterId,
    interruptRunId: snapshot.contactRunId,
    mainRunId: snapshot.interruptedRunId,
    addressedPerceptId: snapshot.perceptId,
    startedAtTick: snapshot.startedAtTick,
    responseOccurrenceId: snapshot.responseOccurrenceId,
    resumedAtTick: snapshot.completedAtTick,
    remainingHoldTicks: snapshot.remainingHoldTicks,
  };
}
