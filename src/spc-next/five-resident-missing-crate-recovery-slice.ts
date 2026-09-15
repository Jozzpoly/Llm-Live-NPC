import type { ResidentKnownMaterialObject } from "./resident-material-knowledge";
import { ResidentMaterialPickupExecutor, type ResidentMaterialPickupStep } from "./resident-material-pickup-executor";
import {
  radialMaterialSearchWaypoints,
  ResidentMaterialSearchExecutor,
  type ResidentMaterialSearchStep,
} from "./resident-material-search-executor";
import { ResidentSemanticProviderMembrane } from "./resident-semantic-provider-membrane";
import {
  createFiveResidentJanekMissingCrateStagedSlice,
  type FiveResidentJanekMissingCrateStep,
} from "./five-resident-missing-crate-slice";

const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop";
const PICKUP_RUN_ID = "run.janek.pickup-reacquired-crate";

export const MISSING_CRATE_RECOVERY_SEARCH_COURSE =
  "search the nearby workshop area for the familiar crate before deciding what to do next";
export const MISSING_CRATE_RECOVERY_PICKUP_COURSE = "pick up the reacquired workshop crate";

export type MissingCrateRecoveryPhase =
  | "awaiting_hidden_relocation"
  | "checking_last_known"
  | "awaiting_search_semantics"
  | "searching"
  | "awaiting_pickup_semantics"
  | "picking_up"
  | "resolved"
  | "search_exhausted"
  | "authority_lost";

export type FiveResidentJanekMissingCrateRecoveryStep =
  | { phase: "awaiting_hidden_relocation"; status: "relocated" }
  | { phase: "checking_last_known"; status: "running"; local: FiveResidentJanekMissingCrateStep }
  | { phase: "awaiting_search_semantics"; status: "semantic_pressure" }
  | { phase: "searching"; status: "semantic_admitted" | "running"; local?: ResidentMaterialSearchStep }
  | { phase: "awaiting_pickup_semantics"; status: "reacquired"; observation: ResidentKnownMaterialObject }
  | { phase: "picking_up"; status: "semantic_admitted" | "running"; local?: ResidentMaterialPickupStep }
  | { phase: "resolved"; status: "resolved" }
  | { phase: "search_exhausted"; status: "exhausted"; local: Extract<ResidentMaterialSearchStep, { status: "exhausted" }> }
  | { phase: "authority_lost"; status: "authority_lost" };

/**
 * Deterministic vertical research specimen for life after checked absence.
 *
 * The semantic provider outputs are scripted on purpose so this slice can qualify
 * resident authority, embodied search, legal reacquisition and subsequent material
 * action deterministically. This is NOT LIVE_PROVIDER evidence and must never be
 * promoted as proof that the external LLM/provider path is connected.
 */
export function createFiveResidentJanekMissingCrateRecoverySlice() {
  const base = createFiveResidentJanekMissingCrateStagedSlice();
  const provider = new ResidentSemanticProviderMembrane();
  let phase: MissingCrateRecoveryPhase = "awaiting_hidden_relocation";
  let search: ResidentMaterialSearchExecutor | null = null;
  let pickup: ResidentMaterialPickupExecutor | null = null;
  let reacquired: ResidentKnownMaterialObject | null = null;

  function admitSearchSemantics(): void {
    const providerRun = provider.prepare(base.kernel, MATTER_ID);
    const settled = provider.settle(base.kernel, providerRun.providerRunId, {
      semanticCourse: MISSING_CRATE_RECOVERY_SEARCH_COURSE,
    });
    if (settled.status !== "applied" || settled.matter.semanticRevision !== 3) {
      throw new Error(`missing-crate recovery search semantics failed: ${settled.status}`);
    }

    const remembered = base.materialKnowledge.lastKnownPosition(CRATE_ID);
    if (!remembered) throw new Error("missing-crate recovery has no remembered crate position");
    base.kernel.bindRun({
      matterId: MATTER_ID,
      taskId: "task.janek.search-nearby-workshop",
      runId: SEARCH_RUN_ID,
    });
    search = new ResidentMaterialSearchExecutor(
      SEARCH_RUN_ID,
      CRATE_ID,
      radialMaterialSearchWaypoints(remembered, 400, 8),
      base.materialKnowledge,
      base.authority,
      base.world,
    );
    phase = "searching";
  }

  function finishSearch(observation: ResidentKnownMaterialObject): void {
    const reconciled = base.kernel.reconcileRunOutcome({
      runId: SEARCH_RUN_ID,
      tick: base.world.tick,
      status: "succeeded",
      summary: `legally reacquired ${CRATE_ID} through bounded local search`,
    });
    if (reconciled.status !== "recorded") throw new Error("missing-crate recovery search reconciliation failed");

    const evidence = base.kernel.recordEvidence({
      id: `evidence:janek:material-reacquired:${CRATE_ID}:${base.world.tick}`,
      tick: base.world.tick,
      kind: "material_reacquired",
      summary: `The familiar workshop crate is visible again at (${observation.lastKnownPosition.x}, ${observation.lastKnownPosition.y}).`,
    });
    base.kernel.advanceSemanticContext(MATTER_ID, evidence.id);
    reacquired = structuredClone(observation);
    phase = "awaiting_pickup_semantics";
  }

  function admitPickupSemantics(): void {
    const providerRun = provider.prepare(base.kernel, MATTER_ID);
    const settled = provider.settle(base.kernel, providerRun.providerRunId, {
      semanticCourse: MISSING_CRATE_RECOVERY_PICKUP_COURSE,
    });
    if (settled.status !== "applied" || settled.matter.semanticRevision !== 5) {
      throw new Error(`missing-crate recovery pickup semantics failed: ${settled.status}`);
    }

    base.kernel.bindRun({
      matterId: MATTER_ID,
      taskId: "task.janek.pickup-reacquired-crate",
      runId: PICKUP_RUN_ID,
    });
    pickup = new ResidentMaterialPickupExecutor(
      PICKUP_RUN_ID,
      CRATE_ID,
      base.materialKnowledge,
      base.authority,
      base.world,
    );
    phase = "picking_up";
  }

  return {
    world: base.world,
    kernel: base.kernel,
    materialKnowledge: base.materialKnowledge,
    authority: base.authority,
    phase(): MissingCrateRecoveryPhase {
      return phase;
    },
    reacquiredObservation(): ResidentKnownMaterialObject | null {
      return reacquired ? structuredClone(reacquired) : null;
    },
    advanceOneWorldTick(): FiveResidentJanekMissingCrateRecoveryStep {
      if (phase === "awaiting_hidden_relocation") {
        base.relocateCrateHidden();
        phase = "checking_last_known";
        return { phase: "awaiting_hidden_relocation", status: "relocated" };
      }

      if (phase === "checking_last_known") {
        const local = base.stepJanek();
        if (local.status === "semantic_pressure") phase = "awaiting_search_semantics";
        else if (local.status === "authority_lost") phase = "authority_lost";
        base.world.step();
        if (phase === "awaiting_search_semantics") return { phase, status: "semantic_pressure" };
        if (phase === "authority_lost") return { phase, status: "authority_lost" };
        return { phase: "checking_last_known", status: "running", local };
      }

      if (phase === "awaiting_search_semantics") {
        admitSearchSemantics();
        base.world.step();
        return { phase: "searching", status: "semantic_admitted" };
      }

      if (phase === "searching") {
        if (!search) throw new Error("missing-crate recovery search executor missing");
        base.materialKnowledge.sample();
        const local = search.step();
        if (local.status === "found") {
          finishSearch(local.observation);
          base.world.step();
          return {
            phase: "awaiting_pickup_semantics",
            status: "reacquired",
            observation: structuredClone(local.observation),
          };
        }
        if (local.status === "exhausted") {
          base.kernel.reconcileRunOutcome({
            runId: SEARCH_RUN_ID,
            tick: base.world.tick,
            status: "blocked",
            summary: "bounded material search exhausted without reacquisition",
          });
          phase = "search_exhausted";
          base.world.step();
          return { phase, status: "exhausted", local };
        }
        if (local.status === "authority_lost") {
          phase = "authority_lost";
          base.world.step();
          return { phase, status: "authority_lost" };
        }
        base.world.step();
        return { phase: "searching", status: "running", local };
      }

      if (phase === "awaiting_pickup_semantics") {
        admitPickupSemantics();
        base.world.step();
        return { phase: "picking_up", status: "semantic_admitted" };
      }

      if (phase === "picking_up") {
        if (!pickup) throw new Error("missing-crate recovery pickup executor missing");
        base.materialKnowledge.sample();
        const local = pickup.step();
        if (local.status === "succeeded") {
          const reconciled = base.kernel.reconcileRunOutcome({
            runId: PICKUP_RUN_ID,
            tick: local.materialOutcome.tick,
            status: "succeeded",
            summary: `picked up legally reacquired ${CRATE_ID}`,
          });
          if (reconciled.status !== "recorded") throw new Error("missing-crate recovery pickup reconciliation failed");
          base.kernel.resolveMatter(MATTER_ID);
          phase = "resolved";
          base.world.step();
          return { phase, status: "resolved" };
        }
        if (local.status === "authority_lost") {
          phase = "authority_lost";
          base.world.step();
          return { phase, status: "authority_lost" };
        }
        if (local.status === "blocked") {
          throw new Error(`missing-crate recovery pickup unexpectedly blocked: ${local.reason}`);
        }
        base.world.step();
        return { phase: "picking_up", status: "running", local };
      }

      base.world.step();
      if (phase === "resolved") return { phase, status: "resolved" };
      if (phase === "search_exhausted") {
        throw new Error("missing-crate recovery cannot advance after exhausted search without new semantics");
      }
      return { phase: "authority_lost", status: "authority_lost" };
    },
  };
}
