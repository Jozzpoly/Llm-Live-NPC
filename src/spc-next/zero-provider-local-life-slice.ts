import type { ResidentPercept, Vec2, WorldOccurrence } from "./contracts";
import { MaterialObjectState } from "./material-world-state";
import { ResidentContinuityKernel, type ResidentTaskRunBinding } from "./resident-continuity-kernel";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentMaterialPickupExecutor, type ResidentMaterialPickupStep } from "./resident-material-pickup-executor";
import { ResidentMaterialPlaceExecutor, type ResidentMaterialPlaceStep } from "./resident-material-place-executor";
import type { ResidentRuntime } from "./resident-runtime";
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
  | { status: "running"; phase: "pickup"; local: ResidentMaterialPickupStep }
  | { status: "running"; phase: "delivery"; local: ResidentMaterialPlaceStep }
  | { status: "interruption_started"; interruption: ZeroProviderLocalInterruptionSnapshot }
  | { status: "interruption_responded"; interruption: ZeroProviderLocalInterruptionSnapshot }
  | { status: "interruption_holding"; interruption: ZeroProviderLocalInterruptionSnapshot }
  | { status: "interruption_resumed"; interruption: ZeroProviderLocalInterruptionSnapshot }
  | { status: "settled"; tick: number }
  | { status: "blocked"; phase: "pickup" | "delivery"; reason: string }
  | { status: "authority_lost"; phase: "pickup" | "delivery" };

interface ActiveInterruption {
  interruptMatterId: string;
  interruptRunId: string;
  mainRunId: string;
  mainBinding: ResidentTaskRunBinding;
  addressedPerceptId: string;
  addressedDirection: Vec2 | null;
  startedAtTick: number;
  responseOccurrenceId: string | null;
  resumedAtTick: number | null;
  remainingHoldTicks: number;
  responded: boolean;
}

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
  kernel.bindRun({
    matterId: MAIN_MATTER_ID,
    taskId: "task.mira.local-life.pickup-basket",
    runId: PICKUP_RUN_ID,
  });

  const knowledge = new ResidentMaterialKnowledge(RESIDENT_ID, [OBJECT_ID], world);
  const authority = new ResidentWorldExecutionAuthority(RESIDENT_ID, kernel, world);
  const pickup = new ResidentMaterialPickupExecutor(
    PICKUP_RUN_ID,
    OBJECT_ID,
    knowledge,
    authority,
    world,
  );

  let place: ResidentMaterialPlaceExecutor | null = null;
  let phase: ZeroProviderLocalLifePhase = "pickup";
  let attention: ZeroProviderLocalAttention = {
    kind: "matter",
    matterId: MAIN_MATTER_ID,
    reason: "restore the workshop basket",
  };
  let activeInterruption: ActiveInterruption | null = null;
  let completedInterruption: ZeroProviderLocalInterruptionSnapshot | null = null;
  let interruptSequence = 0;
  const handledPercepts = new Set<string>();
  const localDecisions: ZeroProviderLocalDecision[] = [];

  function startDelivery(): void {
    kernel.bindRun({
      matterId: MAIN_MATTER_ID,
      taskId: "task.mira.local-life.place-basket",
      runId: PLACE_RUN_ID,
    });
    place = new ResidentMaterialPlaceExecutor(
      PLACE_RUN_ID,
      OBJECT_ID,
      DESTINATION,
      authority,
      world,
    );
    phase = "delivery";
  }

  function settlePerceptReasonLocally(percept: ResidentPercept): { id: string | null; settled: boolean } {
    const id = cognitionReasonIdForPercept(RESIDENT_ID, percept);
    if (!id) return { id: null, settled: false };
    return { id, settled: resident.settleCognitionReasonLocally(id) };
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
        && phase === "delivery"
        && activeInterruption === null;

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
    if (!main || main.status !== "active" || main.activeRunId !== PLACE_RUN_ID) {
      throw new Error("R1 local interruption requires active delivery run");
    }
    const mainBinding = kernel.runBinding(PLACE_RUN_ID);
    if (!mainBinding) throw new Error("R1 local interruption lost delivery binding");

    const seq = interruptSequence++;
    const evidence = kernel.recordEvidence({
      id: `evidence.mira.local-life.interrupt.${percept.tick}.${seq}`,
      tick: percept.tick,
      kind: "local_addressed_contact",
      summary: `Mira locally noticed addressed speech: ${percept.text ?? percept.summary}`,
    });
    const interruptMatterId = `matter.mira.local-life.contact.${percept.tick}.${seq}`;
    const interruptRunId = `run.mira.local-life.contact.${percept.tick}.${seq}`;
    kernel.openMatter({
      id: interruptMatterId,
      originEvidenceId: evidence.id,
      semanticCourse: "briefly acknowledge nearby addressed contact, then return to the basket matter",
    });
    kernel.bindRun({
      matterId: interruptMatterId,
      taskId: `task.mira.local-life.contact.${percept.tick}.${seq}`,
      runId: interruptRunId,
    });
    kernel.suspendMatter(MAIN_MATTER_ID, interruptMatterId);
    authority.enforceMotionAuthority();

    activeInterruption = {
      interruptMatterId,
      interruptRunId,
      mainRunId: PLACE_RUN_ID,
      mainBinding,
      addressedPerceptId: percept.id,
      addressedDirection: percept.spatial.kind === "directional"
        && Math.hypot(percept.spatial.direction.x, percept.spatial.direction.y) > 1e-9
        ? { ...percept.spatial.direction }
        : null,
      startedAtTick: world.tick,
      responseOccurrenceId: null,
      resumedAtTick: null,
      remainingHoldTicks: INTERRUPTION_HOLD_TICKS,
      responded: false,
    };
    attention = {
      kind: "actor",
      actorId: percept.actorId,
      reason: "locally acknowledge addressed contact",
    };
    phase = "interrupted";
    return interruptionSnapshot();
  }

  function advanceInterruption(): ZeroProviderLocalLifeStep {
    if (!activeInterruption) throw new Error("R1 interruption phase has no active interruption");

    if (!activeInterruption.responded) {
      const effects = [
        { kind: "motion" as const, desiredVelocity: { x: 0, y: 0 } },
        ...(activeInterruption.addressedDirection
          ? [{ kind: "look" as const, direction: { ...activeInterruption.addressedDirection } }]
          : []),
        {
          kind: "speech" as const,
          text: LOCAL_RESPONSE,
          radius: 420,
          addressedActorIds: [PLAYER_ID],
        },
      ];
      const applied = authority.apply({
        runId: activeInterruption.interruptRunId,
        effects,
      });
      if (applied.status !== "applied") {
        throw new Error(`R1 local interruption response failed: ${applied.status}`);
      }
      const speech = applied.occurrences.find((occurrence) => occurrence.kind === "speech");
      if (!speech) throw new Error("R1 local interruption produced no factual speech");
      activeInterruption.responded = true;
      activeInterruption.responseOccurrenceId = speech.id;
      world.step();
      knowledge.sample();
      processNewPercepts();
      return { status: "interruption_responded", interruption: interruptionSnapshot() };
    }

    if (activeInterruption.remainingHoldTicks > 0) {
      activeInterruption.remainingHoldTicks -= 1;
      world.step();
      knowledge.sample();
      processNewPercepts();
      return { status: "interruption_holding", interruption: interruptionSnapshot() };
    }

    const reconciliation = kernel.reconcileRunOutcome({
      runId: activeInterruption.interruptRunId,
      tick: world.tick,
      status: "succeeded",
      summary: `locally acknowledged addressed contact via ${activeInterruption.responseOccurrenceId ?? "speech"}`,
    });
    if (reconciliation.status !== "recorded") {
      throw new Error("R1 local interruption outcome did not reconcile");
    }
    kernel.resolveMatter(activeInterruption.interruptMatterId);
    authority.enforceMotionAuthority();
    if (!kernel.resumeMatter(MAIN_MATTER_ID)) {
      throw new Error("R1 local interruption could not resume main matter");
    }
    const restored = kernel.runBinding(activeInterruption.mainRunId);
    if (JSON.stringify(restored) !== JSON.stringify(activeInterruption.mainBinding)) {
      throw new Error("R1 local interruption changed the exact pre-contact run binding");
    }

    activeInterruption.resumedAtTick = world.tick;
    completedInterruption = snapshotActive(activeInterruption, "completed");
    activeInterruption = null;
    phase = "delivery";
    attention = {
      kind: "matter",
      matterId: MAIN_MATTER_ID,
      reason: "return to the still-unfinished basket matter",
    };
    world.step();
    knowledge.sample();
    processNewPercepts();
    return { status: "interruption_resumed", interruption: structuredClone(completedInterruption) };
  }

  function stepMainLife(): ZeroProviderLocalLifeStep {
    if (phase === "settled") {
      world.step();
      knowledge.sample();
      processNewPercepts();
      return { status: "settled", tick: world.tick };
    }

    if (phase === "pickup") {
      knowledge.sample();
      const local = pickup.step();
      if (local.status === "authority_lost") return { status: "authority_lost", phase: "pickup" };
      if (local.status === "blocked") return { status: "blocked", phase: "pickup", reason: local.reason };
      if (local.status === "succeeded") {
        const reconciled = kernel.reconcileRunOutcome({
          runId: local.runId,
          tick: local.materialOutcome.tick,
          status: "succeeded",
          summary: "Mira picked up the workshop basket for her local matter.",
        });
        if (reconciled.status !== "recorded") {
          return { status: "blocked", phase: "pickup", reason: "pickup outcome did not reconcile" };
        }
        startDelivery();
      }
    }

    if (phase === "delivery") {
      if (!place) throw new Error("R1 delivery phase has no local place executor");
      const local = place.step();
      if (local.status === "authority_lost") return { status: "authority_lost", phase: "delivery" };
      if (local.status === "blocked") return { status: "blocked", phase: "delivery", reason: local.reason };
      if (local.status === "succeeded") {
        const reconciled = kernel.reconcileRunOutcome({
          runId: local.runId,
          tick: local.materialOutcome.tick,
          status: "succeeded",
          summary: "Mira put the workshop basket back beside the local shelf.",
        });
        if (reconciled.status !== "recorded") {
          return { status: "blocked", phase: "delivery", reason: "place outcome did not reconcile" };
        }
        kernel.resolveMatter(MAIN_MATTER_ID);
        authority.enforceMotionAuthority();
        phase = "settled";
        attention = {
          kind: "quiet",
          reason: "basket matter is factually complete; no unresolved local reason requires action",
        };
      }
    }

    world.step();
    knowledge.sample();
    const started = processNewPercepts();
    if (started) return { status: "interruption_started", interruption: started };

    if (phase === "settled") return { status: "settled", tick: world.tick };
    if (phase === "delivery") {
      if (!place) throw new Error("R1 delivery executor disappeared");
      return { status: "running", phase: "delivery", local: place.step() };
    }
    return { status: "running", phase: "pickup", local: pickup.step() };
  }

  function interruptionSnapshot(): ZeroProviderLocalInterruptionSnapshot {
    if (activeInterruption) return snapshotActive(activeInterruption, "active");
    if (completedInterruption) return structuredClone(completedInterruption);
    return {
      status: "none",
      interruptMatterId: null,
      interruptRunId: null,
      mainRunId: null,
      addressedPerceptId: null,
      startedAtTick: null,
      responseOccurrenceId: null,
      resumedAtTick: null,
      remainingHoldTicks: 0,
    };
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
    providerRequestCount: () => 0,
    mainMatterId: MAIN_MATTER_ID,
    mainPlaceRunId: PLACE_RUN_ID,
    objectId: OBJECT_ID,
    destination: { ...DESTINATION },
    playerSpeak(text: string, addressed = false): WorldOccurrence {
      return world.speak(PLAYER_ID, text, 420, addressed ? [RESIDENT_ID] : []);
    },
    advanceOneWorldTick(): ZeroProviderLocalLifeStep {
      if (activeInterruption) return advanceInterruption();
      return stepMainLife();
    },
  };
}

function snapshotActive(
  active: ActiveInterruption,
  status: "active" | "completed",
): ZeroProviderLocalInterruptionSnapshot {
  return {
    status,
    interruptMatterId: active.interruptMatterId,
    interruptRunId: active.interruptRunId,
    mainRunId: active.mainRunId,
    addressedPerceptId: active.addressedPerceptId,
    startedAtTick: active.startedAtTick,
    responseOccurrenceId: active.responseOccurrenceId,
    resumedAtTick: active.resumedAtTick,
    remainingHoldTicks: active.remainingHoldTicks,
  };
}

function cognitionReasonIdForPercept(residentId: string, percept: ResidentPercept): string | null {
  if (percept.phenomenon === "speech" && percept.modality === "hearing" && percept.text) {
    return `reason:${residentId}:speech:${percept.occurrenceId}`;
  }
  if (percept.phenomenon === "interaction" || percept.phenomenon === "system") {
    return `reason:${residentId}:world:${percept.occurrenceId}`;
  }
  if (percept.phenomenon === "actor_sight_enter" || percept.phenomenon === "actor_sight_exit") {
    return `reason:${residentId}:sight:${percept.occurrenceId}`;
  }
  return null;
}
