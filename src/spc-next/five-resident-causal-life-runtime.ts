import type { CognitionBatch } from "./contracts";
import {
  FIVE_RESIDENT_ROLE_PRESSURES,
  type FiveResidentId,
  type FiveResidentRegionComposition,
} from "./five-resident-region";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import {
  ResidentCausalExecutionCoordinator,
  type ResidentCausalExecutionStep,
} from "./resident-causal-execution-coordinator";
import {
  ResidentCausalLifeSubstrate,
  type PreparedResidentCausalLifeIntent,
} from "./resident-causal-life-substrate";

export type FiveResidentCausalLifeOwnership = "local_opening" | "recovered_life";

interface ResidentLane {
  life: ResidentCausalLifeSubstrate;
  execution: ResidentCausalExecutionCoordinator;
}

export interface FiveResidentCausalLifeTick {
  tick: number;
  claimedResidentIds: readonly FiveResidentId[];
  execution: Readonly<Partial<Record<FiveResidentId, ResidentCausalExecutionStep>>>;
}

export interface FiveResidentPreparedLifeIntent {
  residentId: FiveResidentId;
  batch: CognitionBatch;
  prepared: PreparedResidentCausalLifeIntent;
}

/**
 * Five-resident composition host for the transition from the bounded authored/local
 * opening into recovered causal life.
 *
 * A ResidentCausalLifeSubstrate claims exact World execution authority in its
 * constructor. Claiming it too early would disable ResidentRuntime.fastStep and freeze
 * the authored opening. This host therefore owns one explicit per-resident handoff:
 *
 *   local/authored activity -> natural idle boundary -> recovered causal life.
 *
 * Once claimed, a resident never falls back to legacy activity as execution authority.
 * The causal execution coordinator may latch legal effects for each claimed resident,
 * then the shared World advances exactly once for everybody.
 *
 * Provider transport and proposal policy deliberately remain outside this class. It
 * exposes ready life-intent attempts so a higher host can route them through real or
 * deterministic cognition without coupling network completion to World time.
 */
export class FiveResidentCausalLifeRuntime {
  private readonly lanes = new Map<FiveResidentId, ResidentLane>();
  private readonly navigation = createFiveResidentNavigationGraph();

  constructor(private readonly composition: FiveResidentRegionComposition) {
    this.claimReadyResidents();
  }

  get world(): FiveResidentRegionComposition["world"] {
    return this.composition.world;
  }

  ownership(residentId: FiveResidentId): FiveResidentCausalLifeOwnership {
    return this.lanes.has(residentId) ? "recovered_life" : "local_opening";
  }

  claimedResidentIds(): FiveResidentId[] {
    return FIVE_RESIDENT_ROLE_PRESSURES
      .map((entry) => entry.residentId as FiveResidentId)
      .filter((residentId) => this.lanes.has(residentId));
  }

  life(residentId: FiveResidentId): ResidentCausalLifeSubstrate | null {
    return this.lanes.get(residentId)?.life ?? null;
  }

  execution(residentId: FiveResidentId): ResidentCausalExecutionCoordinator | null {
    return this.lanes.get(residentId)?.execution ?? null;
  }

  takeReadyLifeIntentAttempts(): FiveResidentPreparedLifeIntent[] {
    const prepared: FiveResidentPreparedLifeIntent[] = [];
    for (const residentId of this.claimedResidentIds()) {
      const lane = this.lanes.get(residentId)!;
      const next = lane.life.takeReadyLifeIntentAttempt();
      if (!next) continue;
      prepared.push({
        residentId,
        batch: structuredClone(next.batch),
        prepared: next,
      });
    }
    return prepared;
  }

  advanceOneWorldTick(): FiveResidentCausalLifeTick {
    const execution: Partial<Record<FiveResidentId, ResidentCausalExecutionStep>> = {};
    for (const residentId of this.claimedResidentIds()) {
      execution[residentId] = this.lanes.get(residentId)!.execution.stepFocusedRun();
    }

    this.composition.world.step();
    this.claimReadyResidents();

    return {
      tick: this.composition.world.tick,
      claimedResidentIds: this.claimedResidentIds(),
      execution: structuredClone(execution),
    };
  }

  private claimReadyResidents(): void {
    for (const pressure of FIVE_RESIDENT_ROLE_PRESSURES) {
      const residentId = pressure.residentId as FiveResidentId;
      if (this.lanes.has(residentId)) continue;
      const resident = this.composition.runtimes[residentId];

      // This is only a one-way bootstrap boundary. After recovery, idle is a valid
      // causal-life state and never hands authority back to legacy execution.
      if (resident.publicState().activity.kind !== "idle") continue;

      const life = new ResidentCausalLifeSubstrate({
        residentId,
        resident,
        world: this.composition.world,
        navigation: this.navigation,
        identityNamespace: residentId.split(".").at(-1) ?? residentId,
      });
      this.lanes.set(residentId, {
        life,
        execution: new ResidentCausalExecutionCoordinator(life),
      });
    }
  }
}
