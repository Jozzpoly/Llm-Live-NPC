import type { ResidentPercept, Vec2, WorldOccurrence } from "./contracts";
import {
  createFiveResidentJanekMissingCrateLiveProviderSlice,
  type FiveResidentJanekMissingCrateLiveProviderOptions,
  type MissingCrateLiveProviderPhase,
} from "./five-resident-missing-crate-live-provider-slice";
import type { MissingCrateInterruptionSnapshot } from "./five-resident-missing-crate-interruption-slice";

const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const MAIN_MATTER_ID = "matter.janek.missing-crate";
const LIVE_SEARCH_RUN_ID = "run.janek.search-nearby-workshop.live-provider";
const PLAYER_CALL_RADIUS = 420;
const INTERRUPTION_HOLD_TICKS = 24;
const INTERRUPTION_RESPONSE = "Tak?";

export type LiveProviderInterruptionStep =
  | { status: "base"; phase: MissingCrateLiveProviderPhase; base: void }
  | { status: "interruption_started"; interruption: MissingCrateInterruptionSnapshot }
  | { status: "interruption_responded"; interruption: MissingCrateInterruptionSnapshot }
  | { status: "interruption_holding"; interruption: MissingCrateInterruptionSnapshot }
  | { status: "interruption_resumed"; interruption: MissingCrateInterruptionSnapshot };

interface ActiveInterruption {
  addressedPerceptId: string;
  addressedDirection: Vec2 | null;
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
 * Player interruption pressure layered on the real/live-provider search path.
 *
 * The main search run is the exact run grounded from an admitted provider choice.
 * Addressed player speech may temporarily suspend that matter, but it cannot rewrite
 * its semantic revision, replace its binding or manufacture a new search plan. A
 * separate local player-contact matter owns the bounded acknowledgment. Once that
 * matter terminates, the same search binding regains authority and the existing
 * embodied search executor continues from where it was interrupted.
 */
export function createFiveResidentJanekMissingCrateLiveProviderInterruptionSlice(
  options: FiveResidentJanekMissingCrateLiveProviderOptions = {},
) {
  const base = createFiveResidentJanekMissingCrateLiveProviderSlice({
    ...options,
    playerStart: options.playerStart ?? { x: 1_600, y: 620 },
  });
  let active: ActiveInterruption | null = null;
  let completed: MissingCrateInterruptionSnapshot | null = null;
  const handledAddressedPercepts = new Set<string>();

  function snapshot(): MissingCrateInterruptionSnapshot {
    if (active) return snapshotActive(active, "active");
    if (completed) return structuredClone(completed);
    return emptySnapshot();
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

  function beginInterruption(percept: ResidentPercept): MissingCrateInterruptionSnapshot {
    const main = base.kernel.matter(MAIN_MATTER_ID);
    if (!main || main.status !== "active" || main.activeRunId !== LIVE_SEARCH_RUN_ID) {
      throw new Error("live-provider addressed interruption requires the exact active provider-grounded search run");
    }
    const mainBinding = base.kernel.runBinding(LIVE_SEARCH_RUN_ID);
    if (!mainBinding || mainBinding.semanticRevision !== main.semanticRevision) {
      throw new Error("provider-grounded search binding missing at interruption boundary");
    }

    const suffix = `${percept.tick}:${percept.id.replaceAll(":", "-")}`;
    const evidence = base.kernel.recordEvidence({
      id: `evidence:janek:live-provider-player-addressed:${suffix}`,
      tick: percept.tick,
      kind: "player_addressed_speech",
      summary: `Addressed speech interrupted Janek's provider-grounded search: ${percept.text ?? percept.summary}`,
    });
    const interruptMatterId = `matter.janek.live-provider-player-contact:${suffix}`;
    const interruptRunId = `run.janek.live-provider-player-contact:${suffix}`;
    base.kernel.openMatter({
      id: interruptMatterId,
      originEvidenceId: evidence.id,
      semanticCourse: "briefly acknowledge the addressed player, then return to the interrupted search",
    });
    base.kernel.bindRun({
      matterId: interruptMatterId,
      taskId: `task.janek.live-provider-player-contact:${suffix}`,
      runId: interruptRunId,
    });
    base.kernel.suspendMatter(MAIN_MATTER_ID, interruptMatterId);
    const revoked = base.authority.enforceMotionAuthority();
    if (revoked.status !== "revoked" || revoked.runId !== LIVE_SEARCH_RUN_ID) {
      throw new Error("provider-grounded search motion authority was not revoked by interruption");
    }

    active = {
      addressedPerceptId: percept.id,
      addressedDirection: percept.spatial.kind === "directional"
        && Math.hypot(percept.spatial.direction.x, percept.spatial.direction.y) > 1e-9
        ? { ...percept.spatial.direction }
        : null,
      interruptMatterId,
      interruptRunId,
      mainRunId: LIVE_SEARCH_RUN_ID,
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

  function advanceInterruption(): LiveProviderInterruptionStep {
    if (!active) throw new Error("no active live-provider interruption");

    if (!active.responded) {
      const effects = active.addressedDirection
        ? [
            { kind: "motion" as const, desiredVelocity: { x: 0, y: 0 } },
            { kind: "look" as const, direction: { ...active.addressedDirection } },
            {
              kind: "speech" as const,
              text: INTERRUPTION_RESPONSE,
              radius: PLAYER_CALL_RADIUS,
              addressedActorIds: [PLAYER_ID],
            },
          ]
        : [
            { kind: "motion" as const, desiredVelocity: { x: 0, y: 0 } },
            {
              kind: "speech" as const,
              text: INTERRUPTION_RESPONSE,
              radius: PLAYER_CALL_RADIUS,
              addressedActorIds: [PLAYER_ID],
            },
          ];
      const applied = base.authority.apply({ runId: active.interruptRunId, effects });
      if (applied.status !== "applied") throw new Error(`live-provider interrupt response failed: ${applied.status}`);
      const response = applied.occurrences.find((occurrence) => occurrence.kind === "speech") ?? null;
      if (!response) throw new Error("live-provider interrupt response did not create World speech");
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

    const bindingBeforeResume = base.kernel.runBinding(active.mainRunId);
    if (!bindingBeforeResume) throw new Error("provider-grounded search binding disappeared during interruption");
    const reconciled = base.kernel.reconcileRunOutcome({
      runId: active.interruptRunId,
      tick: base.world.tick,
      status: "succeeded",
      summary: `acknowledged addressed player via ${active.responseOccurrenceId ?? "speech"}`,
    });
    if (reconciled.status !== "recorded") throw new Error("live-provider interrupt reconciliation failed");
    base.kernel.resolveMatter(active.interruptMatterId);
    const revoked = base.authority.enforceMotionAuthority();
    if (revoked.status !== "revoked" || revoked.runId !== active.interruptRunId) {
      throw new Error("live-provider interrupt motion authority did not retire");
    }
    if (!base.kernel.resumeMatter(MAIN_MATTER_ID)) throw new Error("provider-grounded search matter failed to resume");

    const bindingAfterResume = base.kernel.runBinding(active.mainRunId);
    if (JSON.stringify(bindingAfterResume) !== JSON.stringify(bindingBeforeResume)) {
      throw new Error("provider-grounded search binding changed across player interruption");
    }
    if (!base.kernel.canRunMutateWorld(active.mainRunId)) {
      throw new Error("same provider-grounded search run did not regain World authority");
    }

    active.resumedAtTick = base.world.tick;
    completed = snapshotActive(active, "completed");
    active = null;
    base.world.step();
    return { status: "interruption_resumed", interruption: structuredClone(completed) };
  }

  return {
    world: base.world,
    kernel: base.kernel,
    materialKnowledge: base.materialKnowledge,
    authority: base.authority,
    diagnostics: base.diagnostics,
    waitForProviderArrival: base.waitForProviderArrival,
    phase(): MissingCrateLiveProviderPhase | "interrupted" {
      return active ? "interrupted" : base.phase();
    },
    interruption(): MissingCrateInterruptionSnapshot {
      return snapshot();
    },
    playerAddressJanek(text = "Janek, chwila!"): WorldOccurrence {
      if (base.phase() !== "searching" || active) {
        throw new Error("player may interrupt live-provider specimen only during active material search");
      }
      return base.world.speak(PLAYER_ID, text, PLAYER_CALL_RADIUS, [JANEK_ID]);
    },
    advanceOneWorldTick(): LiveProviderInterruptionStep {
      if (active) return advanceInterruption();
      base.advanceOneWorldTick();
      if (base.phase() === "searching") {
        const percept = newestUnhandledAddressedSpeech();
        if (percept) {
          return { status: "interruption_started", interruption: beginInterruption(percept) };
        }
      }
      return { status: "base", phase: base.phase(), base: undefined };
    },
  };
}

function emptySnapshot(): MissingCrateInterruptionSnapshot {
  return {
    status: "none",
    addressedPerceptId: null,
    addressedDirection: null,
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
  status: "active" | "completed",
): MissingCrateInterruptionSnapshot {
  return {
    status,
    addressedPerceptId: active.addressedPerceptId,
    addressedDirection: active.addressedDirection ? { ...active.addressedDirection } : null,
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
