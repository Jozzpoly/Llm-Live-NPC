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
import type { ResidentCausalProviderUsage } from "./resident-causal-provider-transport";
import {
  createCognitionFetchHardBudget,
  type CognitionFetchHardBudget,
  type CognitionFetchHardBudgetSnapshot,
} from "./cognition-fetch-hard-budget";

const PROVIDER_EVENT_LIMIT = 128;

/** Bounded default for an experimental live session, NOT a dollar/token spending limit. */
export const DEFAULT_UNIFIED_LIVING_MAX_UPSTREAM_REQUESTS = 32;

/** Locally admitted semantic choice, never a provider claim of physical success. */
export interface FiveResidentAdmittedCognitionChoice {
  originReasonId: string;
  kind: Extract<FiveResidentCausalCognitionSettlement, { status: "applied" }>["decision"];
  /** Model-stated reason from an already locally admitted proposal; never World evidence. */
  declaredRationale: string | null;
  matterId: string | null;
  runId: string | null;
}

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
  /** Parsed from Worker output; not proof of billed spend or free-tier eligibility. */
  usage?: ResidentCausalProviderUsage;
  /** Present only after local causal admission, not on upstream arrival or rejection. */
  admittedChoice?: FiveResidentAdmittedCognitionChoice;
}

/** Opt-in one-shot, local-browser evidence. This contains resident-private context.
 * Never transmit it to telemetry, static public pages, or GitHub automatically.
 * It contains no provider API key, login token or session cookie.
 */
export interface FiveResidentManualResearchProbe {
  residentId: FiveResidentId;
  requestId: string;
  dispatchedAtTick: number;
  /** EXACT frozen request payload sent to Worker, not a reconstructed context. */
  submitted: FiveResidentCausalCognitionRequest["context"];
  reasons: FiveResidentCausalCognitionRequest["batch"]["reasons"];
  /** An upstream reply is untrusted data until the LOCAL settlement below. */
  providerArrival: FiveResidentCausalProviderArrival | null;
  localSettlement: FiveResidentCausalProviderAdmission | null;
  transportFailed: boolean;
}

export interface FiveResidentLivingRuntimeDiagnostics {
  tick: number;
  claimedResidentIds: readonly FiveResidentId[];
  cognition: ReturnType<FiveResidentCausalCognitionHost["state"]>;
  providerInFlightResidentIds: readonly string[];
  providerInboxCount: number;
  providerRequestCount: number;
  providerHardBudget: CognitionFetchHardBudgetSnapshot;
  recentProviderEvents: readonly FiveResidentLivingProviderEvent[];
}

export interface FiveResidentUnifiedLivingRuntimeOptions {
  composition?: FiveResidentRegionComposition;
  maxConcurrentCognition?: number;
  endpoint?: string;
  fetcher?: CognitionFetch;
  /** Deliberately finite; raise explicitly for a budgeted research campaign. */
  maxUpstreamRequests?: number;
  /** Keep the original multi-resident automatic mode unless explicitly researching manual dispatch. */
  providerDispatchMode?: "automatic" | "manual";
  /** Tested #158 donor; resident-private relation makes only actual re-encounters reviewable. */
  socialReencounter?: boolean;
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
  private readonly providerHardBudget: CognitionFetchHardBudget;
  private readonly providerDispatchMode: "automatic" | "manual";

  private readonly arrivalInbox: FiveResidentCausalProviderArrival[] = [];
  private readonly providerInFlight = new Map<string, FiveResidentCausalCognitionRequest>();
  private readonly recentProviderEvents: FiveResidentLivingProviderEvent[] = [];
  private providerRequestCount = 0;
  private providerEventSequence = 0;
  private manualProbe: FiveResidentManualResearchProbe | null = null;

  constructor(options: FiveResidentUnifiedLivingRuntimeOptions = {}) {
    this.providerDispatchMode = options.providerDispatchMode ?? "automatic";
    this.composition = options.composition ?? createFiveResidentRegionComposition();
    this.lifeRuntime = new FiveResidentCausalLifeRuntime(this.composition, {
      socialReencounter: options.socialReencounter ?? false,
    });
    this.cognition = new FiveResidentCausalCognitionHost(
      this.lifeRuntime,
      options.maxConcurrentCognition ?? 5,
    );
    this.providerHardBudget = createCognitionFetchHardBudget(
      options.fetcher ?? fetch,
      options.maxUpstreamRequests ?? (this.providerDispatchMode === "manual"
        ? 1
        : DEFAULT_UNIFIED_LIVING_MAX_UPSTREAM_REQUESTS),
    );
    this.provider = new FiveResidentCausalProviderTransport(
      options.endpoint ?? "/api/spc-next/life-intent",
      this.providerHardBudget.fetch,
    );
  }

  get world(): FiveResidentRegionComposition["world"] {
    return this.lifeRuntime.world;
  }

  advanceOneWorldTick(): FiveResidentCausalLifeTick {
    const tick = this.lifeRuntime.advanceOneWorldTick();
    this.admitProviderInbox();
    if (this.providerDispatchMode === "automatic") this.startReadyProviderRequests();
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
      providerHardBudget: this.providerHardBudget.snapshot(),
      recentProviderEvents: this.recentProviderEvents.map((event) => structuredClone(event)),
    };
  }

  life(residentId: FiveResidentId) {
    return this.lifeRuntime.life(residentId);
  }

  /** Browser operator export ONLY. No secrets, server upload, implicit persistence
   * or additional upstream calls. The exact resident-private model input is sensitive.
   */
  manualResearchProbe(): FiveResidentManualResearchProbe | null {
    return this.providerDispatchMode === "manual" && this.manualProbe
      ? structuredClone(this.manualProbe)
      : null;
  }

  /** Manual research: advance World independently, then initiate at most one
   * resident's already-earned private cognition batch by explicit operator action.
   * No synthetic cognition reason is created and no unanswered batch is fabricated.
   * A session hard cap is consumed before any physical fetch.
   */
  requestOneResidentCognition(residentId: FiveResidentId):
    "started" | "no_reason" | "resident_unavailable" | "budget_exhausted" {
    if (this.providerDispatchMode !== "manual") {
      throw new Error("manual cognition cannot be invoked in automatic mode");
    }
    if (!this.lifeRuntime.claimedResidentIds().includes(residentId)) {
      return "resident_unavailable";
    }
    if (this.providerHardBudget.snapshot().exhausted) return "budget_exhausted";
    return this.startReadyProviderRequests(residentId) === 1
      ? "started"
      : "no_reason";
  }

  private admitProviderInbox(): void {
    const ready = this.arrivalInbox.splice(0, this.arrivalInbox.length);
    for (const arrival of ready) {
      const admission = this.provider.admit(arrival, this.cognition);
      if (this.manualProbe?.requestId === arrival.requestId) {
        this.manualProbe.localSettlement = structuredClone(admission);
      }
      this.recordAdmission(arrival, admission);
    }
  }

  private startReadyProviderRequests(residentId?: FiveResidentId): number {
    // A session with exhausted physical upstream authority may keep running its
    // World and local brain, but it must never generate further network attempts
    // or an infinite provider-error/retry treadmill.
    if (this.providerHardBudget.snapshot().exhausted) return 0;
    this.cognition.collectReadyBatches(residentId ? [residentId] : undefined);
    let started = 0;
    for (const request of this.cognition.startReadyRequests(residentId ? [residentId] : undefined)) {
      // Filtering happens BEFORE queue dispatch. A manual operator selection
      // cannot turn unselected residents into in-flight/abandoned requests.
      started += 1;
      this.providerInFlight.set(request.id, request);
      this.providerRequestCount += 1;
      if (this.providerDispatchMode === "manual" && residentId !== undefined) {
        this.manualProbe = {
          requestId: request.id,
          residentId: request.residentId,
          dispatchedAtTick: this.world.tick,
          submitted: structuredClone(request.context),
          reasons: structuredClone(request.batch.reasons),
          providerArrival: null,
          localSettlement: null,
          transportFailed: false,
        };
      }
      this.recordProviderEvent(
        request.residentId,
        request.id,
        "request_started",
        `provider request started with ${request.batch.reasons.length} reason(s): ${request.batch.reasons.slice(0, 12).map(r => `${r.kind}:${r.id}`).join(", ")}`,
      );

      void this.provider.request(request).then((arrival) => {
        this.providerInFlight.delete(request.id);
        this.arrivalInbox.push(arrival);
        if (this.manualProbe?.requestId === request.id) {
          this.manualProbe.providerArrival = structuredClone(arrival);
        }
        this.recordProviderEvent(
          request.residentId,
          request.id,
          "arrival_ready",
          arrival.status === "proposal"
            ? `proposal arrived from origin ${arrival.originReasonId} (${request.batch.reasons.find(r => r.id === arrival.originReasonId)?.kind ?? "unknown"}); ${arrival.usage ? `usage ${arrival.usage.inputTokens ?? "?"}/${arrival.usage.outputTokens ?? "?"}/${arrival.usage.totalTokens ?? "?"} tokens, ${arrival.usage.model}, ${arrival.usage.elapsedMs}ms` : "usage unavailable"}`
            : `provider error arrival: ${arrival.code}${arrival.detail ? `; ${arrival.detail}` : ""}; ${arrival.usage ? `usage ${arrival.usage.inputTokens ?? "?"}/${arrival.usage.outputTokens ?? "?"}/${arrival.usage.totalTokens ?? "?"} tokens, ${arrival.usage.model}, ${arrival.usage.elapsedMs}ms` : "usage unavailable"}`,
          ...(arrival.usage ? [arrival.usage] : []),
        );
      }).catch((error: unknown) => {
        this.providerInFlight.delete(request.id);
        const abandoned = this.cognition.abandon(request);
        if (this.manualProbe?.requestId === request.id) {
          this.manualProbe.transportFailed = true;
        }
        this.recordProviderEvent(
          request.residentId,
          request.id,
          "transport_internal_error",
          `unexpected transport exception; request abandoned=${abandoned}; ${error instanceof Error ? error.message : "unknown error"}`,
        );
      });
    }
    return started;
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
        `${admission.code}${admission.detail ? `; ${admission.detail}` : ""}; abandonment=${admission.abandonment}`,
        ...(arrival.status === "provider_error" && arrival.usage ? [arrival.usage] : []),
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
      undefined,
      admission.status === "applied" && arrival.status === "proposal"
        ? {
            originReasonId: arrival.originReasonId,
            kind: admission.decision,
            declaredRationale: readAdmittedProposalRationale(arrival.proposal),
            matterId: admission.commitment?.matterId ?? null,
            runId: admission.commitment?.runId ?? null,
          }
        : undefined,
    );
  }

  private recordProviderEvent(
    residentId: string,
    requestId: string,
    status: FiveResidentLivingProviderEvent["status"],
    detail: string,
    usage?: ResidentCausalProviderUsage,
    admittedChoice?: FiveResidentAdmittedCognitionChoice,
  ): void {
    this.recentProviderEvents.push({
      sequence: this.providerEventSequence++,
      tick: this.world.tick,
      residentId,
      requestId,
      status,
      detail,
      ...(usage ? { usage: structuredClone(usage) } : {}),
      ...(admittedChoice ? { admittedChoice: structuredClone(admittedChoice) } : {}),
    });
    while (this.recentProviderEvents.length > PROVIDER_EVENT_LIMIT) {
      this.recentProviderEvents.shift();
    }
  }
}

/** Presentation-only; the model's raw words have no authority of their own.
 * This is called ONLY after the resident-local admission returned "applied".
 * Local proposal validation independently enforces the bounded reason contract.
 */
function readAdmittedProposalRationale(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const decision = (raw as { commitmentDecision?: unknown }).commitmentDecision;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) return null;
  const reason = (decision as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim().length > 0 && reason.length <= 1_200
    ? reason
    : null;
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
