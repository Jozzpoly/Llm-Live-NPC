import type { ResidentCognitionContext, ResidentCognitionProposal } from "./cognition-contract";
import {
  ResidentCognitionOwner,
  type CognitionIntentAdmission,
  type CognitionIntentSettlement,
  type ResidentCognitionAttempt,
} from "./resident-cognition-owner";

export type CognitionFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ResidentCognitionProviderErrorCode = "network" | "http" | "invalid_response";

export type ResidentCognitionLiveArrival = Readonly<
  | {
      version: 1;
      arrivalId: string;
      attemptId: string;
      residentId: string;
      status: "proposal";
      proposal: unknown;
    }
  | {
      version: 1;
      arrivalId: string;
      attemptId: string;
      residentId: string;
      status: "provider_error";
      code: ResidentCognitionProviderErrorCode;
    }
>;

export type ResidentCognitionLiveAdmission<T> =
  | {
      status: "applied";
      admissionTick: number;
      settlement: Extract<CognitionIntentSettlement<T>, { status: "applied" }>;
    }
  | {
      status: "stale";
      admissionTick: number;
      settlement: Extract<CognitionIntentSettlement<T>, { status: "stale" }>;
    }
  | {
      status: "rejected";
      admissionTick: number;
      settlement: Extract<CognitionIntentSettlement<T>, { status: "rejected" }>;
    }
  | {
      status: "provider_error";
      admissionTick: number;
      code: ResidentCognitionProviderErrorCode;
      abandonment: "abandoned" | "attempt_not_active";
    }
  | {
      status: "arrival_rejected";
      reason: "unknown_arrival" | "already_admitted";
    };

export interface ResidentCognitionAdmissionRecord {
  sequence: number;
  arrivalId: string;
  attemptId: string;
  residentId: string;
  admissionTick: number;
  arrivalStatus: ResidentCognitionLiveArrival["status"];
  outcomeStatus: "applied" | "stale" | "rejected" | "provider_error";
  detail: string;
}

interface PrivateArrivalAuthority {
  attempt: ResidentCognitionAttempt;
}

const MAX_RESPONSE_CHARACTERS = 262_144;
const ADMISSION_RECORD_LIMIT = 128;

/**
 * Browser/runtime transport host for resident-level cognition that may open or
 * reprioritize continuing matters.
 *
 * Network completion is deliberately inert. request() freezes the exact private
 * context already owned by ResidentCognitionOwner and may finish at any wall-clock
 * time, but it cannot apply semantic updates, open a matter, bind a run or move the
 * resident. Only admit() can consume the exact host-owned arrival at an explicit
 * resident/World tick through the same ResidentCognitionOwner attempt authority.
 *
 * Arrival object identity is private authority. Clones carrying the same public ids
 * cannot settle the resident attempt. Provider errors are also inert until admit()
 * explicitly abandons/requeues the exact attempt.
 */
export class ResidentCognitionLiveHost {
  private arrivalSequence = 0;
  private admissionSequence = 0;
  private readonly arrivalAuthority = new WeakMap<object, PrivateArrivalAuthority>();
  private readonly activeArrivals = new Set<ResidentCognitionLiveArrival>();
  private readonly admittedArrivals = new WeakSet<object>();
  private readonly admissionRecords: ResidentCognitionAdmissionRecord[] = [];

  constructor(
    private readonly owner: ResidentCognitionOwner,
    private readonly endpoint = "/api/spc-next/cognition",
    private readonly fetcher: CognitionFetch = fetch,
  ) {}

  async request(
    attempt: ResidentCognitionAttempt,
    options: { signal?: AbortSignal } = {},
  ): Promise<ResidentCognitionLiveArrival> {
    let response: Response;
    try {
      response = await this.fetcher.call(globalThis, this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(attempt.context),
        signal: options.signal,
      });
    } catch {
      return this.registerErrorArrival(attempt, "network");
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return this.registerErrorArrival(attempt, "http");
    }

    let raw: unknown;
    try {
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("cognition response too large");
      raw = JSON.parse(text);
    } catch {
      return this.registerErrorArrival(attempt, "invalid_response");
    }

    if (!isRecord(raw) || raw.ok !== true || !("proposal" in raw)) {
      return this.registerErrorArrival(attempt, "invalid_response");
    }

    return this.registerArrival(attempt, Object.freeze({
      version: 1 as const,
      arrivalId: this.nextArrivalId(),
      attemptId: attempt.id,
      residentId: attempt.residentId,
      status: "proposal" as const,
      proposal: structuredClone(raw.proposal),
    }));
  }

  admit<T>(
    arrival: ResidentCognitionLiveArrival,
    admissionTick: number,
    groundIntent: (
      proposal: ResidentCognitionProposal,
      context: ResidentCognitionContext,
    ) => CognitionIntentAdmission<T>,
  ): ResidentCognitionLiveAdmission<T> {
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
      const abandoned = this.owner.abandon(authority.attempt);
      this.recordAdmission(
        arrival,
        admissionTick,
        "provider_error",
        abandoned ? arrival.code : `${arrival.code}; attempt already inactive`,
      );
      return {
        status: "provider_error",
        admissionTick,
        code: arrival.code,
        abandonment: abandoned ? "abandoned" : "attempt_not_active",
      };
    }

    const settlement = this.owner.settleIntent(
      authority.attempt,
      arrival.proposal,
      admissionTick,
      groundIntent,
    );
    if (settlement.status === "applied") {
      this.recordAdmission(arrival, admissionTick, "applied", "resident cognition intent admitted");
      return { status: "applied", admissionTick, settlement };
    }
    if (settlement.status === "stale") {
      this.recordAdmission(arrival, admissionTick, "stale", settlement.reason);
      return { status: "stale", admissionTick, settlement };
    }

    this.recordAdmission(
      arrival,
      admissionTick,
      "rejected",
      settlement.detail ? `${settlement.reason}: ${settlement.detail}` : settlement.reason,
    );
    return { status: "rejected", admissionTick, settlement };
  }

  pendingArrivals(): number {
    return this.activeArrivals.size;
  }

  recentAdmissions(): ResidentCognitionAdmissionRecord[] {
    return this.admissionRecords.map((record) => structuredClone(record));
  }

  private registerErrorArrival(
    attempt: ResidentCognitionAttempt,
    code: ResidentCognitionProviderErrorCode,
  ): ResidentCognitionLiveArrival {
    return this.registerArrival(attempt, Object.freeze({
      version: 1 as const,
      arrivalId: this.nextArrivalId(),
      attemptId: attempt.id,
      residentId: attempt.residentId,
      status: "provider_error" as const,
      code,
    }));
  }

  private registerArrival(
    attempt: ResidentCognitionAttempt,
    arrival: ResidentCognitionLiveArrival,
  ): ResidentCognitionLiveArrival {
    this.arrivalAuthority.set(arrival, { attempt });
    this.activeArrivals.add(arrival);
    return arrival;
  }

  private nextArrivalId(): string {
    return `resident-cognition-arrival:${this.arrivalSequence++}`;
  }

  private recordAdmission(
    arrival: ResidentCognitionLiveArrival,
    admissionTick: number,
    outcomeStatus: ResidentCognitionAdmissionRecord["outcomeStatus"],
    detail: string,
  ): void {
    this.admissionRecords.push({
      sequence: this.admissionSequence++,
      arrivalId: arrival.arrivalId,
      attemptId: arrival.attemptId,
      residentId: arrival.residentId,
      admissionTick,
      arrivalStatus: arrival.status,
      outcomeStatus,
      detail,
    });
    while (this.admissionRecords.length > ADMISSION_RECORD_LIMIT) this.admissionRecords.shift();
  }
}

function assertAdmissionTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error("resident cognition admission tick must be a non-negative safe integer");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
