import {
  createFiveResidentJanekMissingCrateStagedSlice,
  type FiveResidentJanekMissingCrateOptions,
} from "./five-resident-missing-crate-slice";
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
export const MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID = "local.material.search.remembered-workshop-area";

export type MissingCrateLiveProviderPhase =
  | "awaiting_hidden_relocation"
  | "checking_last_known"
  | "provider_in_flight"
  | "searching"
  | "reacquired"
  | "semantic_only"
  | "provider_error"
  | "provider_stale"
  | "grounding_rejected"
  | "search_exhausted"
  | "authority_lost";

export interface FiveResidentJanekMissingCrateLiveProviderOptions extends FiveResidentJanekMissingCrateOptions {
  endpoint?: string;
  fetcher?: SemanticFetch;
}

export interface MissingCrateLiveProviderDiagnostics {
  phase: MissingCrateLiveProviderPhase;
  providerRequestStartedAtTick: number | null;
  arrivalPending: boolean;
  arrivalStatus: ResidentSemanticLiveArrival["status"] | null;
  admissionTick: number | null;
  admissionStatus: ResidentSemanticLiveAdmission["status"] | null;
  selectedCapabilityId: string | null;
  grounding: ResidentMaterialSearchCapabilityGroundingRecord | null;
  providerAttempts: number;
  providerArrivals: number;
  providerAdmissions: ReturnType<ResidentSemanticLiveHost["recentAdmissions"]>;
}

/**
 * First live-provider vertical slice for recovered SPC Next authority.
 *
 * This composition deliberately keeps asynchronous transport outside simulation
 * authority. requestMatter() may resolve at any wall-clock moment, but its Promise
 * continuation can only put an inert arrival into a local inbox. The first later
 * resident/World tick that observes that inbox performs semantic admission; only
 * then may resident-local capability grounding create an exact search run.
 *
 * No `await` exists in advanceOneWorldTick(). World therefore remains free to keep
 * advancing while the provider is in flight.
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
  let capability: ResidentMaterialSearchCapability | null = null;
  let search: ResidentMaterialSearchExecutor | null = null;
  let providerPromise: Promise<ResidentSemanticLiveArrival> | null = null;
  let arrivalInbox: ResidentSemanticLiveArrival | null = null;
  let providerRequestStartedAtTick: number | null = null;
  let arrivalStatus: ResidentSemanticLiveArrival["status"] | null = null;
  let admission: ResidentSemanticLiveAdmission | null = null;
  let grounding: ResidentMaterialSearchCapabilityGroundingRecord | null = null;
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

  function startProviderRequest(): void {
    if (providerPromise) throw new Error("missing-crate live provider request already started");
    capability = offerSearchCapability();
    providerRequestStartedAtTick = base.world.tick;
    providerPromise = host.requestMatter(MATTER_ID, {
      localCapabilities: [capability.offer()],
    });
    void providerPromise.then((arrival) => {
      // Transport completion is intentionally inert. Do not read or mutate World,
      // kernel, capability grounding or execution authority in this continuation.
      arrivalInbox = arrival;
      arrivalStatus = arrival.status;
    });
  }

  function admitInboxOnResidentTick(): void {
    if (!arrivalInbox || !capability) throw new Error("missing-crate live provider inbox/capability missing");
    const arrival = arrivalInbox;
    arrivalInbox = null;
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
    const grounded = capability.ground(
      selectedCapabilityId,
      admission.settlement.matter.semanticRevision,
    );
    if (grounded.status !== "grounded") {
      phase = selectedCapabilityId === null ? "semantic_only" : "grounding_rejected";
      return;
    }
    grounding = structuredClone(grounded.record);
    search = grounded.executor;
    phase = "searching";
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
        providerRequestStartedAtTick,
        arrivalPending: arrivalInbox !== null,
        arrivalStatus,
        admissionTick: admission && admission.status !== "arrival_rejected" ? admission.admissionTick : null,
        admissionStatus: admission?.status ?? null,
        selectedCapabilityId,
        grounding: grounding ? structuredClone(grounding) : null,
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
          startProviderRequest();
          phase = "provider_in_flight";
        } else if (local.status === "authority_lost") {
          phase = "authority_lost";
        }
        base.world.step();
        return;
      }

      if (phase === "provider_in_flight") {
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

      // Terminal-for-this-slice phases remain physically live. A later vertical
      // slice may add another semantic decision (for example pickup) without making
      // this first live-provider bridge pretend the continuing matter is resolved.
      base.world.step();
    },
  };
}
