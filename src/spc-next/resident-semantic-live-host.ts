import {
  ResidentSemanticProviderMembrane,
  type ResidentLocalCapabilityOffer,
  type ResidentSemanticProviderAbandonment,
  type ResidentSemanticProviderSettlement,
} from "./resident-semantic-provider-membrane";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";

export type SemanticFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ResidentSemanticProviderErrorCode =
  | "network"
  | "http"
  | "invalid_response"
  | "correlation_mismatch";

export interface ResidentSemanticLiveRequestOptions {
  signal?: AbortSignal;
  localCapabilities?: readonly ResidentLocalCapabilityOffer[];
}

export type ResidentSemanticLiveArrival = Readonly<
  | {
      version: 2;
      arrivalId: string;
      providerRunId: string;
      status: "decision";
      decision: Readonly<{ semanticCourse: string; localCapabilityId: string | null }>;
    }
  | {
      version: 2;
      arrivalId: string;
      providerRunId: string;
      status: "provider_error";
      code: ResidentSemanticProviderErrorCode;
    }
>;

export type ResidentSemanticLiveAdmission =
  | {
      status: "applied";
      admissionTick: number;
      settlement: Extract<ResidentSemanticProviderSettlement, { status: "applied" }>;
    }
  | {
      status: "stale";
      admissionTick: number;
      settlement: Extract<ResidentSemanticProviderSettlement, { status: "stale" }>;
    }
  | {
      status: "provider_error";
      admissionTick: number;
      code: ResidentSemanticProviderErrorCode;
      abandonment: Extract<ResidentSemanticProviderAbandonment, { status: "abandoned" | "stale" }>;
    }
  | {
      status: "arrival_rejected";
      reason: "unknown_arrival" | "already_admitted" | "provider_attempt_missing";
    };

export interface ResidentSemanticAdmissionRecord {
  sequence: number;
  arrivalId: string;
  providerRunId: string;
  admissionTick: number;
  arrivalStatus: ResidentSemanticLiveArrival["status"];
  outcomeStatus: "applied" | "stale" | "provider_error";
  detail: string;
}

interface PrivateArrivalAuthority {
  providerRunId: string;
}

const MAX_RESPONSE_CHARACTERS = 32_768;
const ADMISSION_RECORD_LIMIT = 128;

/**
 * Browser/runtime transport host for matter-scoped semantic cognition.
 *
 * Provider arrival is deliberately NOT semantic admission. The async transport
 * path may finish at any wall-clock moment, but finishing it only creates an inert
 * host-owned arrival. Resident meaning changes (or an exact failed attempt is
 * abandoned) only when the caller explicitly admits that exact arrival at a
 * resident/World-owned cognition boundary.
 *
 * Local capabilities are offered by the resident/local brain. The provider may
 * select one offered id or null, but admission still does not bind a task/run or
 * mutate World. The caller must re-ground the selected capability against current
 * resident-local preconditions before execution authority can exist.
 *
 * Mutation authority remains in ResidentSemanticProviderMembrane. Arrival objects
 * contain correlation data only; a WeakMap sidecar binds object identity to the
 * exact local attempt, so structured clones and forged arrivals cannot consume
 * resident authority even if they know providerRunId.
 */
export class ResidentSemanticLiveHost {
  private arrivalSequence = 0;
  private admissionSequence = 0;
  private readonly arrivalAuthority = new WeakMap<object, PrivateArrivalAuthority>();
  private readonly activeArrivals = new Set<ResidentSemanticLiveArrival>();
  private readonly admittedArrivals = new WeakSet<object>();
  private readonly admissionRecords: ResidentSemanticAdmissionRecord[] = [];

  constructor(
    private readonly kernel: ResidentContinuityKernel,
    private readonly membrane = new ResidentSemanticProviderMembrane(),
    private readonly endpoint = "/api/spc-next/semantic",
    private readonly fetcher: SemanticFetch = fetch,
  ) {}

  /**
   * Starts one exact semantic proposal and performs transport only. The returned
   * arrival is inert until admit() is called. No branch of this method settles or
   * abandons resident semantic authority from a Promise continuation.
   */
  async requestMatter(
    matterId: string,
    options: ResidentSemanticLiveRequestOptions = {},
  ): Promise<ResidentSemanticLiveArrival> {
    const run = this.membrane.prepare(
      this.kernel,
      matterId,
      options.localCapabilities ?? [],
    );
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(run),
        signal: options.signal,
      });
    } catch {
      return this.registerErrorArrival(run.providerRunId, "network");
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return this.registerErrorArrival(run.providerRunId, "http");
    }

    let raw: unknown;
    try {
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("semantic response too large");
      raw = JSON.parse(text);
    } catch {
      return this.registerErrorArrival(run.providerRunId, "invalid_response");
    }

    const envelope = parseEnvelope(raw);
    if (!envelope) return this.registerErrorArrival(run.providerRunId, "invalid_response");
    if (envelope.providerRunId !== run.providerRunId) {
      return this.registerErrorArrival(run.providerRunId, "correlation_mismatch");
    }

    return this.registerArrival(Object.freeze({
      version: 2 as const,
      arrivalId: this.nextArrivalId(),
      providerRunId: run.providerRunId,
      status: "decision" as const,
      decision: Object.freeze({ ...envelope.decision }),
    }));
  }

  /** Backward-compatible convenience name for callers not offering local capabilities. */
  reviewMatter(matterId: string, signal?: AbortSignal): Promise<ResidentSemanticLiveArrival> {
    return this.requestMatter(matterId, { signal });
  }

  /**
   * Admits one exact host-owned arrival at an explicit simulation/cognition tick.
   * Staleness is evaluated here, not at network-arrival time.
   */
  admit(arrival: ResidentSemanticLiveArrival, admissionTick: number): ResidentSemanticLiveAdmission {
    assertAdmissionTick(admissionTick);
    const authority = this.arrivalAuthority.get(arrival);
    if (!authority) {
      return {
        status: "arrival_rejected",
        reason: this.admittedArrivals.has(arrival) ? "already_admitted" : "unknown_arrival",
      };
    }

    this.arrivalAuthority.delete(arrival);
    this.activeArrivals.delete(arrival);
    this.admittedArrivals.add(arrival);

    if (arrival.status === "provider_error") {
      const abandonment = this.membrane.abandon(this.kernel, authority.providerRunId);
      if (abandonment.status === "local_run_rejected") {
        return { status: "arrival_rejected", reason: "provider_attempt_missing" };
      }
      this.recordAdmission(arrival, admissionTick, "provider_error", arrival.code);
      return {
        status: "provider_error",
        admissionTick,
        code: arrival.code,
        abandonment,
      };
    }

    const settlement = this.membrane.settle(
      this.kernel,
      authority.providerRunId,
      arrival.decision,
    );
    if (settlement.status === "applied") {
      const capabilityDetail = settlement.localCapabilityId ?? "none";
      this.recordAdmission(
        arrival,
        admissionTick,
        "applied",
        `semantic revision ${settlement.matter.semanticRevision}; local capability ${capabilityDetail}`,
      );
      return { status: "applied", admissionTick, settlement };
    }
    if (settlement.status === "stale") {
      this.recordAdmission(arrival, admissionTick, "stale", settlement.reason);
      return { status: "stale", admissionTick, settlement };
    }

    // A decision arrival was parsed against the strict network shape before
    // registration. Any later invalid/local rejection is therefore either an
    // unoffered capability selection or an internal authority inconsistency; fail
    // closed and retire whatever exact attempt still exists.
    if (settlement.status === "invalid_output") {
      const abandonment = this.membrane.abandon(this.kernel, authority.providerRunId);
      if (abandonment.status !== "local_run_rejected") {
        this.recordAdmission(arrival, admissionTick, "provider_error", "invalid_response");
        return {
          status: "provider_error",
          admissionTick,
          code: "invalid_response",
          abandonment,
        };
      }
    }
    return { status: "arrival_rejected", reason: "provider_attempt_missing" };
  }

  pendingProviderAttempts(): number {
    return this.membrane.activeLocalRunCount();
  }

  pendingArrivals(): number {
    return this.activeArrivals.size;
  }

  recentAdmissions(): ResidentSemanticAdmissionRecord[] {
    return this.admissionRecords.map((record) => structuredClone(record));
  }

  private registerErrorArrival(
    providerRunId: string,
    code: ResidentSemanticProviderErrorCode,
  ): ResidentSemanticLiveArrival {
    return this.registerArrival(Object.freeze({
      version: 2 as const,
      arrivalId: this.nextArrivalId(),
      providerRunId,
      status: "provider_error" as const,
      code,
    }));
  }

  private registerArrival(arrival: ResidentSemanticLiveArrival): ResidentSemanticLiveArrival {
    this.arrivalAuthority.set(arrival, { providerRunId: arrival.providerRunId });
    this.activeArrivals.add(arrival);
    return arrival;
  }

  private nextArrivalId(): string {
    return `semantic-arrival:${this.arrivalSequence++}`;
  }

  private recordAdmission(
    arrival: ResidentSemanticLiveArrival,
    admissionTick: number,
    outcomeStatus: ResidentSemanticAdmissionRecord["outcomeStatus"],
    detail: string,
  ): void {
    this.admissionRecords.push({
      sequence: this.admissionSequence++,
      arrivalId: arrival.arrivalId,
      providerRunId: arrival.providerRunId,
      admissionTick,
      arrivalStatus: arrival.status,
      outcomeStatus,
      detail,
    });
    while (this.admissionRecords.length > ADMISSION_RECORD_LIMIT) this.admissionRecords.shift();
  }
}

function parseEnvelope(value: unknown): {
  providerRunId: string;
  decision: { semanticCourse: string; localCapabilityId: string | null };
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.ok !== true || typeof record.providerRunId !== "string" || record.providerRunId.trim().length === 0) return null;
  if (!record.decision || typeof record.decision !== "object" || Array.isArray(record.decision)) return null;
  const decision = record.decision as Record<string, unknown>;
  if (Object.keys(decision).some((key) => key !== "semanticCourse" && key !== "localCapabilityId")) return null;
  if (typeof decision.semanticCourse !== "string") return null;
  const semanticCourse = decision.semanticCourse.trim();
  if (!semanticCourse || semanticCourse.length > 2_000) return null;
  if (!Object.hasOwn(decision, "localCapabilityId")) return null;
  const localCapabilityId = decision.localCapabilityId;
  if (localCapabilityId !== null && (typeof localCapabilityId !== "string" || localCapabilityId.length < 1 || localCapabilityId.length > 128)) {
    return null;
  }
  return {
    providerRunId: record.providerRunId,
    decision: { semanticCourse, localCapabilityId },
  };
}

function assertAdmissionTick(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("semantic admission tick must be a non-negative safe integer");
  }
}
