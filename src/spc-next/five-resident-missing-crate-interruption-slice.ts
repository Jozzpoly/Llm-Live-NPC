import type { ResidentPercept, Vec2, WorldOccurrence } from "./contracts";
import { ResidentLocalContactRoutine, type ResidentLocalContactSnapshot } from "./resident-local-contact-routine";
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
  addressedDirection: Vec2 | null;
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


/**
 * First interruption/return pressure slice on top of the missing-crate recovery.
 *
 * The interruption must originate as a legal addressed speech percept. It opens a
 * separate resident matter and suspends — rather than rewrites or cancels — Janek's
 * search matter. The same search run binding survives the bounded response and
 * regains authority after the interrupt matter terminates.
 *
 * The short "Tak?" response and turn toward the heard direction are deliberately
 * local-brain routines, not LLM claims. Facing is derived only from Janek's private
 * directional hearing cue; this slice never asks World for the speaker's true
 * position in order to rotate the body.
 */
export function createFiveResidentJanekMissingCrateInterruptionSlice() {
  const base = createFiveResidentJanekMissingCrateRecoverySlice({
    // Participant is authored close enough to interrupt Janek during the first
    // search leg. The baseline scenario remains unchanged.
    playerStart: { x: 1_600, y: 620 },
  });
  const contactRoutine = new ResidentLocalContactRoutine(
    JANEK_ID,
    base.kernel,
    base.authority,
    base.world,
    {
      responseText: INTERRUPTION_RESPONSE,
      holdTicks: INTERRUPTION_HOLD_TICKS,
      responseRadius: PLAYER_CALL_RADIUS,
    },
  );
  const handledAddressedPercepts = new Set<string>();

  function snapshot(): MissingCrateInterruptionSnapshot {
    return projectContactSnapshot(contactRoutine.snapshot());
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

    contactRoutine.begin(percept, {
      matterId: MAIN_MATTER_ID,
      runId: SEARCH_RUN_ID,
    });
    handledAddressedPercepts.add(percept.id);
    return snapshot();
  }

  function advanceInterruption(): FiveResidentJanekMissingCrateInterruptionStep {
    const local = contactRoutine.step();
    base.world.step();

    if (local.status === "responded") {
      return { status: "interruption_responded", interruption: snapshot() };
    }
    if (local.status === "holding") {
      return { status: "interruption_holding", interruption: snapshot() };
    }
    return { status: "interruption_resumed", interruption: snapshot() };
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
      return contactRoutine.active() ? "interrupted" : base.phase();
    },
    interruption(): MissingCrateInterruptionSnapshot {
      return snapshot();
    },
    playerAddressJanek(text = "Janek, chwila!"): WorldOccurrence {
      if (base.phase() !== "searching" || contactRoutine.active()) {
        throw new Error("player may interrupt this specimen only during active material search");
      }
      return base.world.speak(PLAYER_ID, text, PLAYER_CALL_RADIUS, [JANEK_ID]);
    },
    advanceOneWorldTick(): FiveResidentJanekMissingCrateInterruptionStep {
      if (contactRoutine.active()) return advanceInterruption();

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

function projectContactSnapshot(
  snapshot: ResidentLocalContactSnapshot,
): MissingCrateInterruptionSnapshot {
  return {
    status: snapshot.status,
    addressedPerceptId: snapshot.perceptId,
    addressedDirection: snapshot.direction ? { ...snapshot.direction } : null,
    interruptMatterId: snapshot.contactMatterId,
    interruptRunId: snapshot.contactRunId,
    mainRunId: snapshot.interruptedRunId,
    startedAtTick: snapshot.startedAtTick,
    responseTick: snapshot.responseTick,
    responseOccurrenceId: snapshot.responseOccurrenceId,
    resumedAtTick: snapshot.completedAtTick,
    remainingHoldTicks: snapshot.remainingHoldTicks,
  };
}
