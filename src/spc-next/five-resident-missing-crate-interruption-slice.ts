import type { ResidentPercept, WorldOccurrence } from "./contracts";
import {
  createFiveResidentJanekMissingCrateRecoverySlice,
  type FiveResidentJanekMissingCrateRecoveryStep,
  type MissingCrateRecoveryPhase,
} from "./five-resident-missing-crate-recovery-slice";

const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const MAIN_MATTER_ID = "matter.janek.missing-crate";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop";
const PLAYER_CALL_RADIUS = 420;
const INTERRUPTION_HOLD_TICKS = 24;
const INTERRUPTION_RESPONSE = "Tak?";

export type MissingCrateInterruptionStatus = "none" | "active" | "completed";

export interface MissingCrateInterruptionSnapshot {
  status: MissingCrateInterruptionStatus;
  addressedPerceptId: string | null;
  interruptMatterId: string | null;
  interruptRunId: string | null;
  mainRunId: string | null;
  startedAtTick: number | null;
  responseTick: number | null;
  responseOccurrenceId: string | null;
  resumedAtTick: number | null;
  remainingHoldTicks: number;
}

export type FiveResidentJanekMissingCrateInterruptionStep =
  | { status: "base"; phase: MissingCrateRecoveryPhase; base: FiveResidentJanekMissingCrateRecoveryStep }
  | { status: "interruption_started"; interruption: MissingCrateInterruptionSnapshot }
  | { status: "interruption_responded"; interruption: MissingCrateInterruptionSnapshot }
  | { status: "interruption_holding"; interruption: MissingCrateInterruptionSnapshot }
  | { status: "interruption_resumed"; interruption: MissingCrateInterruptionSnapshot };

interface ActiveInterruption {
  addressedPerceptId: string;
  interruptMatterId: string;
  interruptRunId: string;
  mainRunId: string;
  startedAtTick: number;
  responseTick: number | null;
  responseOccurrenceId: string | null;
  resumedAtTick: number | null;
  remainingHoldTicks: number;
  responded: boolean;
}

/**
 * First interruption/return pressure slice on top of the missing-crate recovery.
 *
 * The interruption must originate as a legal addressed speech percept. It opens a
 * separate resident matter and suspends — rather than rewrites or cancels — Janek's
 * search matter. The same search run binding survives the bounded response and
 * regains authority after the interrupt matter terminates.
 *
 * The short "Tak?" response is deliberately a local-brain routine, not an LLM
 * claim. Higher cognition may later decide richer social meaning; this specimen
 * qualifies continuity and embodied interruption ownership first.
 */
export function createFiveResidentJanekMissingCrateInterruptionSlice() {
  const base = createFiveResidentJanekMissingCrateRecoverySlice({
    // Participant is authored close enough to interrupt Janek during the first
    // search leg. The baseline scenario remains unchanged.
    playerStart: { x: 1_600, y: 620 },
  });
  let active: ActiveInterruption | null = null;
  let completed: MissingCrateInterruptionSnapshot | null = null;
  const handledAddressedPercepts = new Set<string>();

  function snapshot(): MissingCrateInterruptionSnapshot {
    if (active) return snapshotActive(active, "active");
    if (completed) return structuredClone(completed);
    return emptySnapshot();
  }

  function beginInterruption(percept: ResidentPercept): MissingCrateInterruptionSnapshot {
    const main = base.kernel.matter(MAIN_MATTER_ID);
    if (!main || main.status !== "active" || main.activeRunId !== SEARCH_RUN_ID) {
      throw new Error("addressed player interruption requires the active search run");
    }
    const mainBinding = base.kernel.runBinding(SEARCH_RUN_ID);
    if (!mainBinding || mainBinding.semanticRevision !== main.semanticRevision) {
      throw new Error("search run binding missing at interruption boundary");
    }

    const suffix = `${percept.tick}:${percept.id.replaceAll(":", "-")}`;
    const evidence = base.kernel.recordEvidence({
      id: `evidence:janek:player-addressed:${suffix}`,
      tick: percept.tick,
      kind: "player_addressed_speech",
      summary: `Addressed speech interrupted Janek: ${percept.text ?? percept.summary}`,
    });
    const interruptMatterId = `matter.janek.player-contact:${suffix}`;
    const interruptRunId = `run.janek.player-contact:${suffix}`;
    base.kernel.openMatter({
      id: interruptMatterId,
      originEvidenceId: evidence.id,
      semanticCourse: "briefly acknowledge the addressed player, then return to the interrupted search",
    });
    base.kernel.bindRun({
      matterId: interruptMatterId,
      taskId: `task.janek.player-contact:${suffix}`,
      runId: interruptRunId,
    });
    base.kernel.suspendMatter(MAIN_MATTER_ID, interruptMatterId);
    const revoked = base.authority.enforceMotionAuthority();
    if (revoked.status !== "revoked" || revoked.runId !== SEARCH_RUN_ID) {
      throw new Error("search motion authority was not revoked by the interruption");
    }

    active = {
      addressedPerceptId: percept.id,
      interruptMatterId,
      interruptRunId,
      mainRunId: SEARCH_RUN_ID,
      startedAtTick: base.world.tick,
      responseTick: null,
      responseOccurrenceId: null,
      resumedAtTick: null,
      remainingHoldTicks: INTERRUPTION_HOLD_TICKS,
      responded: false,
    };
    handledAddressedPercepts.add(percept.id);
    return snapshot();
  }

  function advanceInterruption(): FiveResidentJanekMissingCrateInterruptionStep {
    if (!active) throw new Error("no active interruption");

    if (!active.responded) {
      const applied = base.authority.apply({
        runId: active.interruptRunId,
        effects: [
          { kind: "motion", desiredVelocity: { x: 0, y: 0 } },
          {
            kind: "speech",
            text: INTERRUPTION_RESPONSE,
            radius: PLAYER_CALL_RADIUS,
            addressedActorIds: [PLAYER_ID],
          },
        ],
      });
      if (applied.status !== "applied") throw new Error(`interrupt response execution failed: ${applied.status}`);
      const response = applied.occurrences.find((occurrence) => occurrence.kind === "speech") ?? null;
      if (!response) throw new Error("interrupt response did not create a World speech occurrence");
      active.responded = true;
      active.responseTick = base.world.tick;
      active.responseOccurrenceId = response.id;
      base.world.step();
      return { status: "interruption_responded", interruption: snapshot() };
    }

    if (active.remainingHoldTicks > 0) {
      active.remainingHoldTicks -= 1;
      base.world.step();
      return { status: "interruption_holding", interruption: snapshot() };
    }

    const mainRunBindingBeforeResume = base.kernel.runBinding(active.mainRunId);
    if (!mainRunBindingBeforeResume) throw new Error("interrupted search run binding disappeared during hold");

    const reconciled = base.kernel.reconcileRunOutcome({
      runId: active.interruptRunId,
      tick: base.world.tick,
      status: "succeeded",
      summary: `acknowledged addressed player via ${active.responseOccurrenceId ?? "speech"}`,
    });
    if (reconciled.status !== "recorded") throw new Error("interrupt response reconciliation failed");
    base.kernel.resolveMatter(active.interruptMatterId);
    const revoked = base.authority.enforceMotionAuthority();
    if (revoked.status !== "revoked" || revoked.runId !== active.interruptRunId) {
      throw new Error("interrupt motion authority did not retire after response");
    }
    if (!base.kernel.resumeMatter(MAIN_MATTER_ID)) throw new Error("interrupted search matter failed to resume");

    const mainRunBindingAfterResume = base.kernel.runBinding(active.mainRunId);
    if (JSON.stringify(mainRunBindingAfterResume) !== JSON.stringify(mainRunBindingBeforeResume)) {
      throw new Error("search run binding changed across bounded player interruption");
    }
    if (!base.kernel.canRunMutateWorld(active.mainRunId)) {
      throw new Error("same search run did not regain World authority after interruption");
    }

    active.resumedAtTick = base.world.tick;
    completed = snapshotActive(active, "completed");
    active = null;
    base.world.step();
    return { status: "interruption_resumed", interruption: structuredClone(completed) };
  }

  function newestUnhandledAddressedSpeech(): ResidentPercept | null {
    const percepts = base.world.residentDiagnostics(JANEK_ID).recentPercepts;
    for (let index = percepts.length - 1; index >= 0; index -= 1) {
      const percept = percepts[index]!;
      if (handledAddressedPercepts.has(percept.id)) continue;
      if (percept.phenomenon !== "speech" || !percept.addressed || !percept.text) continue;
      return percept;
    }
    return null;
  }

  return {
    world: base.world,
    kernel: base.kernel,
    materialKnowledge: base.materialKnowledge,
    authority: base.authority,
    phase(): MissingCrateRecoveryPhase | "interrupted" {
      return active ? "interrupted" : base.phase();
    },
    interruption(): MissingCrateInterruptionSnapshot {
      return snapshot();
    },
    playerAddressJanek(text = "Janek, chwila!"): WorldOccurrence {
      if (base.phase() !== "searching" || active) {
        throw new Error("player may interrupt this specimen only during active material search");
      }
      return base.world.speak(PLAYER_ID, text, PLAYER_CALL_RADIUS, [JANEK_ID]);
    },
    advanceOneWorldTick(): FiveResidentJanekMissingCrateInterruptionStep {
      if (active) return advanceInterruption();

      const baseStep = base.advanceOneWorldTick();
      if (base.phase() === "searching") {
        const percept = newestUnhandledAddressedSpeech();
        if (percept) {
          return { status: "interruption_started", interruption: beginInterruption(percept) };
        }
      }
      return { status: "base", phase: base.phase(), base: baseStep };
    },
  };
}

function emptySnapshot(): MissingCrateInterruptionSnapshot {
  return {
    status: "none",
    addressedPerceptId: null,
    interruptMatterId: null,
    interruptRunId: null,
    mainRunId: null,
    startedAtTick: null,
    responseTick: null,
    responseOccurrenceId: null,
    resumedAtTick: null,
    remainingHoldTicks: 0,
  };
}

function snapshotActive(
  active: ActiveInterruption,
  status: Exclude<MissingCrateInterruptionStatus, "none">,
): MissingCrateInterruptionSnapshot {
  return {
    status,
    addressedPerceptId: active.addressedPerceptId,
    interruptMatterId: active.interruptMatterId,
    interruptRunId: active.interruptRunId,
    mainRunId: active.mainRunId,
    startedAtTick: active.startedAtTick,
    responseTick: active.responseTick,
    responseOccurrenceId: active.responseOccurrenceId,
    resumedAtTick: active.resumedAtTick,
    remainingHoldTicks: active.remainingHoldTicks,
  };
}
