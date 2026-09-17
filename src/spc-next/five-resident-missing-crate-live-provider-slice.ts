import {
  createFiveResidentJanekMissingCrateStagedSlice,
  type FiveResidentJanekMissingCrateOptions,
} from "./five-resident-missing-crate-slice";
import {
  ResidentMaterialPickupCapability,
  type ResidentMaterialPickupCapabilityGroundingRecord,
} from "./resident-material-pickup-capability";
import type { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import {
  ResidentMaterialSearchCapability,
  type ResidentMaterialSearchCapabilityGroundingRecord,
} from "./resident-material-search-capability";
import type { ResidentMaterialSearchExecutor } from "./resident-material-search-executor";
import {
  ResidentSemanticLiveHost,
  type ResidentSemanticLiveAdmission,
  type ResidentSemanticLiveArrival,
  type SemanticFetch,
} from "./resident-semantic-live-host";

const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const SEARCH_TASK_ID = "task.janek.search-nearby-workshop";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop.live-provider";
const PICKUP_TASK_ID = "task.janek.pickup-reacquired-crate.live-provider";
export const MISSING_CRATE_LIVE_PICKUP_RUN_ID = "run.janek.pickup-reacquired-crate.live-provider";
export const MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID = "local.material.search.remembered-workshop-area";
export const MISSING_CRATE_LIVE_PICKUP_CAPABILITY_ID = "local.material.pickup.visible-familiar-crate";

export type MissingCrateLiveProviderPhase =
  | "awaiting_hidden_relocation"
  | "checking_last_known"
  | "provider_in_flight"
  | "searching"
  | "reacquired"
  | "pickup_provider_in_flight"
  | "picking_up"
  | "resolved"
  | "semantic_only"
  | "pickup_semantic_only"
  | "provider_error"
  | "pickup_provider_error"
  | "provider_stale"
  | "pickup_provider_stale"
  | "grounding_rejected"
  | "pickup_grounding_rejected"
  | "pickup_offer_unavailable"
  | "pickup_blocked"
  | "search_exhausted"
  | "authority_lost";

export interface FiveResidentJanekMissingCrateLiveProviderOptions extends FiveResidentJanekMissingCrateOptions {
  endpoint?: string;
  fetcher?: SemanticFetch;
}

export interface MissingCrateLiveProviderDiagnostics {
  phase: MissingCrateLiveProviderPhase;
  providerStage: "search" | "pickup" | null;
  providerRequestStartedAtTick: number | null;
  providerRequestCount: number;
  arrivalPending: boolean;
  arrivalStatus: ResidentSemanticLiveArrival["status"] | null;
  admissionTick: number | null;
  admissionStatus: ResidentSemanticLiveAdmission["status"] | null;
  selectedCapabilityId: string | null;
  grounding: ResidentMaterialSearchCapabilityGroundingRecord | null;
  pickupGrounding: ResidentMaterialPickupCapabilityGroundingRecord | null;
  pickupOfferFailureReason: string | null;
  providerAttempts: number;
  providerArrivals: number;
  providerAdmissions: ReturnType<ResidentSemanticLiveHost["recentAdmissions"]>;
}

/**
 * Live-provider vertical slice for one continuing resident material matter.
 *
 * Provider transport never owns simulation time or execution authority. Each high-
 * level decision has the same sequence: resident-owned evidence/capabilities -> async
 * provider arrival -> later resident/World-tick admission -> fresh local grounding ->
 * exact embodied run. Reacquisition is not matter completion: it creates new semantic
 * evidence, then a second provider burst may select a separately offered visible-
 * pickup competence. The matter resolves only after the World confirms pickup.
 */
export function createFiveResidentJanekMissingCrateLiveProviderSlice(
  options: FiveResidentJanekMissingCrateLiveProviderOptions = {},
) {
  const base = createFiveResidentJanekMissingCrateStagedSlice({
    hiddenRelocationSpeed: options.hiddenRelocationSpeed,
    playerStart: options.playerStart,
  });
  const endpoint = options.endpoint ?? "/api/spc-next/semantic";
  const host = options.fetcher
    ? new ResidentSemanticLiveHost(base.kernel, undefined, endpoint, options.fetcher)
    : new ResidentSemanticLiveHost(base.kernel, undefined, endpoint);

  let phase: MissingCrateLiveProviderPhase = "awaiting_hidden_relocation";
  let searchCapability: ResidentMaterialSearchCapability | null = null;
  let pickupCapability: ResidentMaterialPickupCapability | null = null;
  let search: ResidentMaterialSearchExecutor | null = null;
  let pickup: ResidentMaterialPickupExecutor | null = null;
  let providerPromise: Promise<ResidentSemanticLiveArrival> | null = null;
  let providerStage: "search" | "pickup" | null = null;
  let arrivalInbox: ResidentSemanticLiveArrival | null = null;
  let providerRequestStartedAtTick: number | null = null;
  let providerRequestCount = 0;
  let arrivalStatus: ResidentSemanticLiveArrival["status"] | null = null;
  let admission: ResidentSemanticLiveAdmission | null = null;
  let searchGrounding: ResidentMaterialSearchCapabilityGroundingRecord | null = null;
  let pickupGrounding: ResidentMaterialPickupCapabilityGroundingRecord | null = null;
  let pickupOfferFailureReason: string | null = null;
  let selectedCapabilityId: string | null = null;

  function offerSearchCapability(): ResidentMaterialSearchCapability {
    const offered = ResidentMaterialSearchCapability.offer({
      capabilityId: MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID,
      summary: "Search the remembered workshop area for the familiar crate using local embodied movement and perception; this does not imply the crate is there.",
      matterId: MATTER_ID,
      taskId: SEARCH_TASK_ID,
      runId: SEARCH_RUN_ID,
      objectId: CRATE_ID,
      kernel: base.kernel,
      knowledge: base.materialKnowledge,
      authority: base.authority,
      world: base.world,
    });
    if (offered.status !== "offered") {
      throw new Error(`missing-crate live search capability unavailable: ${offered.reason}`);
    }
    return offered.capability;
  }

  function offerPickupCapability(): ResidentMaterialPickupCapability | null {
    const offered = ResidentMaterialPickupCapability.offer({
      capabilityId: MISSING_CRATE_LIVE_PICKUP_CAPABILITY_ID,
      summary: "Approach and pick up the familiar workshop crate that is currently visible, using local embodied movement and World material authority.",
      matterId: MATTER_ID,
      taskId: PICKUP_TASK_ID,
      runId: MISSING_CRATE_LIVE_PICKUP_RUN_ID,
      objectId: CRATE_ID,
      kernel: base.kernel,
      knowledge: base.materialKnowledge,
      authority: base.authority,
      world: base.world,
    });
    if (offered.status !== "offered") {
      pickupOfferFailureReason = offered.reason;
      return null;
    }
    pickupOfferFailureReason = null;
    return offered.capability;
  }

  function startProviderRequest(
    stage: "search" | "pickup",
    localCapabilities: readonly [{ id: string; summary: string }],
  ): void {
    if (providerPromise || arrivalInbox || providerStage) {
      throw new Error("missing-crate live provider request already active");
    }
    providerStage = stage;
    providerRequestStartedAtTick = base.world.tick;
    providerRequestCount += 1;
    arrivalStatus = null;
    admission = null;
    selectedCapabilityId = null;
    providerPromise = host.requestMatter(MATTER_ID, { localCapabilities });
    void providerPromise.then((arrival) => {
      // Transport completion is intentionally inert. Do not read or mutate World,
      // kernel, grounding or execution authority in this continuation.
      arrivalInbox = arrival;
      arrivalStatus = arrival.status;
    });
  }

  function startSearchProviderRequest(): void {
    searchCapability = offerSearchCapability();
    startProviderRequest("search", [searchCapability.offer()]);
  }

  function startPickupProviderRequest(): boolean {
    pickupCapability = offerPickupCapability();
    if (!pickupCapability) return false;
    startProviderRequest("pickup", [pickupCapability.offer()]);
    return true;
  }

  function consumeArrival(): { stage: "search" | "pickup"; arrival: ResidentSemanticLiveArrival } {
    if (!arrivalInbox || !providerStage) throw new Error("missing-crate live provider inbox/stage missing");
    const result = { stage: providerStage, arrival: arrivalInbox };
    arrivalInbox = null;
    providerPromise = null;
    providerStage = null;
    return result;
  }

  function admitSearchInboxOnResidentTick(arrival: ResidentSemanticLiveArrival): void {
    if (!searchCapability) throw new Error("missing-crate live search capability missing");
    admission = host.admit(arrival, base.world.tick);
    if (admission.status === "provider_error") {
      phase = "provider_error";
      return;
    }
    if (admission.status === "stale") {
      phase = "provider_stale";
      return;
    }
    if (admission.status !== "applied") {
      phase = "grounding_rejected";
      return;
    }

    selectedCapabilityId = admission.settlement.localCapabilityId;
    const grounded = searchCapability.ground(
      selectedCapabilityId,
      admission.settlement.matter.semanticRevision,
    );
    if (grounded.status !== "grounded") {
      phase = selectedCapabilityId === null ? "semantic_only" : "grounding_rejected";
      return;
    }
    searchGrounding = structuredClone(grounded.record);
    search = grounded.executor;
    phase = "searching";
  }

  function admitPickupInboxOnResidentTick(arrival: ResidentSemanticLiveArrival): void {
    if (!pickupCapability) throw new Error("missing-crate live pickup capability missing");
    admission = host.admit(arrival, base.world.tick);
    if (admission.status === "provider_error") {
      phase = "pickup_provider_error";
      return;
    }
    if (admission.status === "stale") {
      phase = "pickup_provider_stale";
      return;
    }
    if (admission.status !== "applied") {
      phase = "pickup_grounding_rejected";
      return;
    }

    selectedCapabilityId = admission.settlement.localCapabilityId;
    const grounded = pickupCapability.ground(
      selectedCapabilityId,
      admission.settlement.matter.semanticRevision,
    );
    if (grounded.status !== "grounded") {
      phase = selectedCapabilityId === null ? "pickup_semantic_only" : "pickup_grounding_rejected";
      return;
    }
    pickupGrounding = structuredClone(grounded.record);
    pickup = grounded.executor;
    phase = "picking_up";
  }

  function admitInboxOnResidentTick(): void {
    const { stage, arrival } = consumeArrival();
    if (stage === "search") admitSearchInboxOnResidentTick(arrival);
    else admitPickupInboxOnResidentTick(arrival);
  }

  return {
    world: base.world,
    kernel: base.kernel,
    materialKnowledge: base.materialKnowledge,
    authority: base.authority,
    phase(): MissingCrateLiveProviderPhase {
      return phase;
    },
    diagnostics(): MissingCrateLiveProviderDiagnostics {
      return {
        phase,
        providerStage,
        providerRequestStartedAtTick,
        providerRequestCount,
        arrivalPending: arrivalInbox !== null,
        arrivalStatus,
        admissionTick: admission && admission.status !== "arrival_rejected" ? admission.admissionTick : null,
        admissionStatus: admission?.status ?? null,
        selectedCapabilityId,
        grounding: searchGrounding ? structuredClone(searchGrounding) : null,
        pickupGrounding: pickupGrounding ? structuredClone(pickupGrounding) : null,
        pickupOfferFailureReason,
        providerAttempts: host.pendingProviderAttempts(),
        providerArrivals: host.pendingArrivals(),
        providerAdmissions: host.recentAdmissions(),
      };
    },
    async waitForProviderArrival(): Promise<ResidentSemanticLiveArrival | null> {
      if (!providerPromise) return null;
      await providerPromise;
      // Let the registered continuation that owns the inbox run before returning.
      await Promise.resolve();
      return arrivalInbox;
    },
    advanceOneWorldTick(): void {
      if (phase === "awaiting_hidden_relocation") {
        base.relocateCrateHidden();
        phase = "checking_last_known";
        return;
      }

      if (phase === "checking_last_known") {
        const local = base.stepJanek();
        if (local.status === "semantic_pressure") {
          startSearchProviderRequest();
          phase = "provider_in_flight";
        } else if (local.status === "authority_lost") {
          phase = "authority_lost";
        }
        base.world.step();
        return;
      }

      if (phase === "provider_in_flight" || phase === "pickup_provider_in_flight") {
        if (arrivalInbox) admitInboxOnResidentTick();
        base.world.step();
        return;
      }

      if (phase === "searching") {
        if (!search) throw new Error("missing-crate live provider search executor missing");
        base.materialKnowledge.sample();
        const local = search.step();
        if (local.status === "found") {
          const reconciled = base.kernel.reconcileRunOutcome({
            runId: SEARCH_RUN_ID,
            tick: base.world.tick,
            status: "succeeded",
            summary: `live-provider-guided local search legally reacquired ${CRATE_ID} by sight`,
          });
          if (reconciled.status !== "recorded") {
            throw new Error("missing-crate live provider search reconciliation failed");
          }
          const evidence = base.kernel.recordEvidence({
            id: `evidence:janek:live-provider-reacquired:${CRATE_ID}:${base.world.tick}`,
            tick: base.world.tick,
            kind: "material_reacquired",
            summary: `The familiar workshop crate is visible again at (${local.observation.lastKnownPosition.x}, ${local.observation.lastKnownPosition.y}).`,
          });
          base.kernel.advanceSemanticContext(MATTER_ID, evidence.id);
          phase = "reacquired";
        } else if (local.status === "exhausted") {
          base.kernel.reconcileRunOutcome({
            runId: SEARCH_RUN_ID,
            tick: base.world.tick,
            status: "blocked",
            summary: "live-provider-guided bounded material search exhausted without reacquisition",
          });
          phase = "search_exhausted";
        } else if (local.status === "authority_lost") {
          phase = "authority_lost";
        }
        base.world.step();
        return;
      }

      if (phase === "reacquired") {
        if (startPickupProviderRequest()) phase = "pickup_provider_in_flight";
        else phase = "pickup_offer_unavailable";
        base.world.step();
        return;
      }

      if (phase === "picking_up") {
        if (!pickup) throw new Error("missing-crate live provider pickup executor missing");
        base.materialKnowledge.sample();
        const local = pickup.step();
        if (local.status === "succeeded") {
          const reconciled = base.kernel.reconcileRunOutcome({
            runId: MISSING_CRATE_LIVE_PICKUP_RUN_ID,
            tick: local.materialOutcome.tick,
            status: "succeeded",
            summary: `picked up live-provider-guided reacquired ${CRATE_ID}`,
          });
          if (reconciled.status !== "recorded") {
            throw new Error("missing-crate live provider pickup reconciliation failed");
          }
          base.kernel.resolveMatter(MATTER_ID);
          phase = "resolved";
        } else if (local.status === "blocked") {
          const reconciled = base.kernel.reconcileRunOutcome({
            runId: MISSING_CRATE_LIVE_PICKUP_RUN_ID,
            tick: base.world.tick,
            status: "blocked",
            summary: local.reason,
          });
          if (reconciled.status !== "recorded") {
            throw new Error("missing-crate live provider blocked pickup reconciliation failed");
          }
          phase = "pickup_blocked";
        } else if (local.status === "authority_lost") {
          phase = "authority_lost";
        }
        base.world.step();
        return;
      }

      // Bounded terminal/reconsideration phases remain physically live. They do not
      // manufacture another semantic request without an explicit next life question.
      base.world.step();
    },
  };
}
