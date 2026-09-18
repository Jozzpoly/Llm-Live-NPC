import {
  FiveResidentCausalCognitionHost,
  type FiveResidentCausalCognitionRequest,
  type FiveResidentCausalCognitionSettlement,
} from "./five-resident-causal-cognition-host";
import {
  FiveResidentCausalLifeRuntime,
  type FiveResidentCausalLifeTick,
} from "./five-resident-causal-life-runtime";
import {
  FiveResidentCausalProviderTransport,
  type FiveResidentCausalProviderAdmission,
  type FiveResidentCausalProviderArrival,
} from "./five-resident-causal-provider-transport";
import {
  createFiveResidentRegionComposition,
  type FiveResidentId,
  type FiveResidentRegionComposition,
} from "./five-resident-region";
import type { CognitionFetch } from "./resident-cognition-live-host";

const PROVIDER_EVENT_LIMIT = 128;

export interface FiveResidentLivingProviderEvent {
  sequence: number;
  tick: number;
  residentId: string;
  requestId: string;
  status:
    | "request_started"
    | "arrival_ready"
    | "admitted"
    | "provider_error"
    | "transport_internal_error";
  detail: string;
}

export interface FiveResidentLivingRuntimeDiagnostics {
  tick: number;
  claimedResidentIds: readonly FiveResidentId[];
  cognition: ReturnType<FiveResidentCausalCognitionHost["state"]>;
  providerInFlightResidentIds: readonly string[];
  providerInboxCount: number;
  providerRequestCount: number;
  recentProviderEvents: readonly FiveResidentLivingProviderEvent[];
}

export interface FiveResidentUnifiedLivingRuntimeOptions {
  composition?: FiveResidentRegionComposition;
  maxConcurrentCognition?: number;
  endpoint?: string;
  fetcher?: CognitionFetch;
}

/**
 * Owner-facing composition of the recovered five-resident causal-life stack.
 *
 * Network completion never mutates World. Each authoritative tick is phased:
 * 1) already-focused local causal execution + one shared World step;
 * 2) explicit admission of provider arrivals that completed before this boundary;
 * 3) collection/fair scheduling of newly ready cognition pressure;
 * 4) asynchronous provider requests whose completions can only enter the inert inbox.
 *
 * This is intentionally the first unified living runtime rather than another isolated
 * capability slice. It still exposes bounded capability breadth: the provider is guided
 * toward idle / known-region travel / known-actor communication, while local authority
 * remains fail-closed for anything it cannot execute.
 */
export class FiveResidentUnifiedLivingRuntime {
  readonly composition: FiveResidentRegionComposition;
  readonly lifeRuntime: FiveResidentCausalLifeRuntime;
  readonly cognition: FiveResidentCausalCognitionHost;
  readonly provider: FiveResidentCausalProviderTransport;

  private readonly arrivalInbox: FiveResidentCausalProviderArrival[] = [];
  private readonly providerInFlight = new Map<string, FiveResidentCausalCognitionRequest>();
  private readonly recentProviderEvents: FiveResidentLivingProviderEvent[] = [];
  private providerRequestCount = 0;
  private providerEventSequence = 0;

  constructor(options: FiveResidentUnifiedLivingRuntimeOptions = {}) {
    this.composition = options.composition ?? createFiveResidentRegionComposition();
    this.lifeRuntime = new FiveResidentCausalLifeRuntime(this.composition);
    this.cognition = new FiveResidentCausalCognitionHost(
      this.lifeRuntime,
      options.maxConcurrentCognition ?? 5,
    );
    this.provider = new FiveResidentCausalProviderTransport(
      options.endpoint ?? "/api/spc-next/life-intent",
      options.fetcher ?? fetch,
    );
  }

  get world(): FiveResidentRegionComposition["world"] {
    return this.lifeRuntime.world;
  }

  advanceOneWorldTick(): FiveResidentCausalLifeTick {
    const tick = this.lifeRuntime.advanceOneWorldTick();
    this.admitProviderInbox();
    this.startReadyProviderRequests();
    return tick;
  }

  diagnostics(): FiveResidentLivingRuntimeDiagnostics {
    return {
      tick: this.world.tick,
      claimedResidentIds: this.lifeRuntime.claimedResidentIds(),
      cognition: structuredClone(this.cognition.state()),
      providerInFlightResidentIds: [...this.providerInFlight.values()]
        .map((request) => request.residentId)
        .sort(),
      providerInboxCount: this.arrivalInbox.length,
      providerRequestCount: this.providerRequestCount,
      recentProviderEvents: this.recentProviderEvents.map((event) => structuredClone(event)),
    };
  }

  life(residentId: FiveResidentId) {
    return this.lifeRuntime.life(residentId);
  }

  private admitProviderInbox(): void {
    const ready = this.arrivalInbox.splice(0, this.arrivalInbox.length);
    for (const arrival of ready) {
      const admission = this.provider.admit(arrival, this.cognition);
      this.recordAdmission(arrival, admission);
    }
  }

  private startReadyProviderRequests(): void {
    this.cognition.collectReadyBatches();
    for (const request of this.cognition.startReadyRequests()) {
      this.providerInFlight.set(request.id, request);
      this.providerRequestCount += 1;
      this.recordProviderEvent(
        request.residentId,
        request.id,
        "request_started",
        `provider request started with ${request.batch.reasons.length} reason(s)`,
      );

      void this.provider.request(request).then((arrival) => {
        this.providerInFlight.delete(request.id);
        this.arrivalInbox.push(arrival);
        this.recordProviderEvent(
          request.residentId,
          request.id,
          "arrival_ready",
          arrival.status === "proposal"
            ? `proposal arrived from origin ${arrival.originReasonId}`
            : `provider error arrival: ${arrival.code}`,
        );
      }).catch((error: unknown) => {
        this.providerInFlight.delete(request.id);
        const abandoned = this.cognition.abandon(request);
        this.recordProviderEvent(
          request.residentId,
          request.id,
          "transport_internal_error",
          `unexpected transport exception; request abandoned=${abandoned}; ${error instanceof Error ? error.message : "unknown error"}`,
        );
      });
    }
  }

  private recordAdmission(
    arrival: FiveResidentCausalProviderArrival,
    admission: FiveResidentCausalProviderAdmission,
  ): void {
    if (admission.status === "provider_error") {
      this.recordProviderEvent(
        arrival.residentId,
        arrival.requestId,
        "provider_error",
        `${admission.code}; abandonment=${admission.abandonment}`,
      );
      return;
    }
    if (admission.status === "arrival_rejected") {
      this.recordProviderEvent(
        arrival.residentId,
        arrival.requestId,
        "provider_error",
        `arrival rejected: ${admission.reason}`,
      );
      return;
    }

    this.recordProviderEvent(
      "residentId" in admission ? admission.residentId : arrival.residentId,
      arrival.requestId,
      "admitted",
      settlementDetail(admission),
    );
  }

  private recordProviderEvent(
    residentId: string,
    requestId: string,
    status: FiveResidentLivingProviderEvent["status"],
    detail: string,
  ): void {
    this.recentProviderEvents.push({
      sequence: this.providerEventSequence++,
      tick: this.world.tick,
      residentId,
      requestId,
      status,
      detail,
    });
    while (this.recentProviderEvents.length > PROVIDER_EVENT_LIMIT) {
      this.recentProviderEvents.shift();
    }
  }
}

function settlementDetail(admission: FiveResidentCausalCognitionSettlement): string {
  if (admission.status === "applied") {
    return admission.commitment
      ? `applied ${admission.decision}; matter=${admission.commitment.matterId}; run=${admission.commitment.runId}`
      : `applied ${admission.decision}; no new matter`;
  }
  if (admission.status === "unknown_request") return "unknown cognition request";
  return `${admission.status}: ${admission.reason}${admission.detail ? `; ${admission.detail}` : ""}`;
}
