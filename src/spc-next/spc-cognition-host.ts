import type { ResidentCognitionContext } from "./cognition-contract";
import { CognitionCoordinator, type CognitionDispatch } from "./cognition-coordinator";
import { CognitionGrounder } from "./cognition-grounder";
import type { RegionNavigationGraph } from "./region-navigation";
import {
  ResidentCognitionOwner,
  type CognitionSettlement,
  type ResidentCognitionAttempt,
} from "./resident-cognition-owner";
import type { ResidentRuntime } from "./resident-runtime";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export interface SpcCognitionRequest {
  readonly id: string;
  readonly residentId: string;
  readonly context: ResidentCognitionContext;
}

interface LocalRequestAuthority {
  dispatch: CognitionDispatch;
  owner: ResidentCognitionOwner;
  residentAttempt: ResidentCognitionAttempt;
}

export type SpcCognitionHostSettlement = CognitionSettlement
  | { status: "rejected"; reason: "unknown_host_request" };

export class SpcCognitionHost {
  private readonly coordinator: CognitionCoordinator;
  private readonly owners = new Map<string, ResidentCognitionOwner>();
  private readonly residents = new Map<string, ResidentRuntime>();
  private readonly authority = new WeakMap<SpcCognitionRequest, LocalRequestAuthority>();
  private readonly activeRequests = new Set<SpcCognitionRequest>();

  constructor(
    private readonly world: SpcWorldRuntime,
    residentRuntimes: readonly ResidentRuntime[],
    navigation: RegionNavigationGraph,
    maxConcurrent = 5,
  ) {
    this.coordinator = new CognitionCoordinator(maxConcurrent);
    for (const resident of residentRuntimes) {
      if (this.residents.has(resident.profile.id)) throw new Error(`duplicate resident cognition owner: ${resident.profile.id}`);
      this.residents.set(resident.profile.id, resident);
      this.owners.set(resident.profile.id, new ResidentCognitionOwner(resident, new CognitionGrounder(navigation)));
    }
  }

  collectReadyBatches(): number {
    let collected = 0;
    for (const resident of this.residents.values()) {
      const batch = resident.takeCognitionBatch(this.world.tick);
      if (!batch) continue;
      this.coordinator.enqueue(batch);
      collected += 1;
    }
    return collected;
  }

  startReadyRequests(): SpcCognitionRequest[] {
    const dispatches = this.coordinator.startReady(this.world.tick);
    const requests: SpcCognitionRequest[] = [];
    for (const dispatch of dispatches) {
      const owner = this.owners.get(dispatch.residentId);
      const resident = this.residents.get(dispatch.residentId);
      if (!owner || !resident) {
        this.coordinator.settle(dispatch.id);
        continue;
      }
      const residentAttempt = owner.prepare(dispatch.batch);
      if (!residentAttempt) {
        resident.requeueCognitionBatch(dispatch.batch);
        this.coordinator.settle(dispatch.id);
        continue;
      }
      const request: SpcCognitionRequest = {
        id: dispatch.id,
        residentId: dispatch.residentId,
        context: structuredClone(residentAttempt.context),
      };
      this.authority.set(request, { dispatch, owner, residentAttempt });
      this.activeRequests.add(request);
      requests.push(request);
    }
    return requests;
  }

  settle(request: SpcCognitionRequest, rawProposal: unknown): SpcCognitionHostSettlement {
    const local = this.authority.get(request);
    if (!local || !this.activeRequests.has(request)) return { status: "rejected", reason: "unknown_host_request" };
    this.activeRequests.delete(request);
    this.coordinator.settle(local.dispatch.id);

    const resident = this.residents.get(request.residentId);
    const actor = this.world.publicSnapshot().actors.find((candidate) => candidate.id === request.residentId);
    if (!resident || !actor) {
      local.owner.abandon(local.residentAttempt);
      return { status: "rejected", reason: "grounding_rejected", detail: "resident_actor_missing" };
    }
    const region = this.world.regionAt(actor.position);
    const result = local.owner.settle(local.residentAttempt, rawProposal, {
      tick: this.world.tick,
      currentPosition: actor.position,
      currentRegionId: region?.id ?? null,
    });

    if (result.status === "applied") {
      if (result.activityTransition) {
        this.world.setResidentActivity(request.residentId, result.activityTransition);
      }
      resident.scheduleAdaptiveReview(
        this.world.tick,
        result.proposal.reviewAfterSeconds,
        this.world.options.fixedDeltaSeconds,
      );
    }
    return result;
  }

  abandon(request: SpcCognitionRequest): boolean {
    const local = this.authority.get(request);
    if (!local || !this.activeRequests.has(request)) return false;
    this.activeRequests.delete(request);
    this.coordinator.settle(local.dispatch.id);
    return local.owner.abandon(local.residentAttempt);
  }

  state(): {
    coordinator: ReturnType<CognitionCoordinator["state"]>;
    activeRequestCount: number;
  } {
    return {
      coordinator: this.coordinator.state(),
      activeRequestCount: this.activeRequests.size,
    };
  }
}
