import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import {
  ResidentLifeChoiceOwner,
  type ResidentLifeChoiceAttempt,
  type ResidentLifeChoiceSettlement,
} from "./resident-life-choice-owner";
import type {
  CognitionFetch,
  ResidentCognitionProviderErrorCode,
} from "./resident-cognition-live-host";

export type ResidentLifeChoiceLiveArrival = Readonly<
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

export type ResidentLifeChoiceLiveAdmission =
  | {
      status: "applied";
      admissionTick: number;
      settlement: Extract<ResidentLifeChoiceSettlement, { status: "applied" }>;
    }
  | {
      status: "stale";
      admissionTick: number;
      settlement: Extract<ResidentLifeChoiceSettlement, { status: "stale" }>;
    }
  | {
      status: "rejected";
      admissionTick: number;
      settlement: Extract<ResidentLifeChoiceSettlement, { status: "rejected" }>;
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

export interface ResidentLifeChoiceAdmissionRecord {
  sequence: number;
  arrivalId: string;
  attemptId: string;
  residentId: string;
  admissionTick: number;
  arrivalStatus: ResidentLifeChoiceLiveArrival["status"];
  outcomeStatus: "applied" | "stale" | "rejected" | "provider_error";
  detail: string;
}

interface PrivateArrivalAuthority {
  attempt: ResidentLifeChoiceAttempt;
}

const MAX_RESPONSE_CHARACTERS = 262_144;
const ADMISSION_RECORD_LIMIT = 128;

/**
 * Asynchronous transport membrane for resident-life ambiguity decisions.
 *
 * request() may finish at any wall-clock time but a returned object is inert: it
 * cannot focus a run, change a matter, mutate World or even settle the resident
 * choice attempt. Only admit() can consume the exact host-owned arrival at an
 * explicit World/resident tick, and settlement is revalidated against a freshly
 * captured ResidentLifeCognitionView so changed life truth makes the old answer stale.
 *
 * This host still does not execute the admitted choice. A caller must separately map
 * an admitted matter to its current exact run and pass through execution arbitration.
 */
export class ResidentLifeChoiceLiveHost {
  private arrivalSequence = 0;
  private admissionSequence = 0;
  private readonly arrivalAuthority = new WeakMap<object, PrivateArrivalAuthority>();
  private readonly activeArrivals = new Set<ResidentLifeChoiceLiveArrival>();
  private readonly admittedArrivals = new WeakSet<object>();
  private readonly admissionRecords: ResidentLifeChoiceAdmissionRecord[] = [];

  constructor(
    private readonly owner: ResidentLifeChoiceOwner,
    private readonly endpoint = "/api/spc-next/life-choice",
    private readonly fetcher: CognitionFetch = fetch,
  ) {}

  async request(
    attempt: ResidentLifeChoiceAttempt,
    options: { signal?: AbortSignal } = {},
  ): Promise<ResidentLifeChoiceLiveArrival> {
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
      if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("life-choice response too large");
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

  admit(
    arrival: ResidentLifeChoiceLiveArrival,
    admissionTick: number,
    currentLife: ResidentLifeCognitionView,
  ): ResidentLifeChoiceLiveAdmission {
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
      const abandoned = this.owner.abandon(authority.attempt, admissionTick);
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

    const settlement = this.owner.settle(
      authority.attempt,
      arrival.proposal,
      currentLife,
      admissionTick,
    );
    if (settlement.status === "applied") {
      this.recordAdmission(arrival, admissionTick, "applied", settlement.decision.kind);
      return { status: "applied", admissionTick, settlement };
    }
    if (settlement.status === "stale") {
      this.recordAdmission(arrival, admissionTick, "stale", settlement.reason);
      return { status: "stale", admissionTick, settlement };
    }

    this.recordAdmission(arrival, admissionTick, "rejected", settlement.reason);
    return { status: "rejected", admissionTick, settlement };
  }

  pendingArrivals(): number {
    return this.activeArrivals.size;
  }

  recentAdmissions(): ResidentLifeChoiceAdmissionRecord[] {
    return this.admissionRecords.map((record) => structuredClone(record));
  }

  private registerErrorArrival(
    attempt: ResidentLifeChoiceAttempt,
    code: ResidentCognitionProviderErrorCode,
  ): ResidentLifeChoiceLiveArrival {
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
    attempt: ResidentLifeChoiceAttempt,
    arrival: ResidentLifeChoiceLiveArrival,
  ): ResidentLifeChoiceLiveArrival {
    this.arrivalAuthority.set(arrival, { attempt });
    this.activeArrivals.add(arrival);
    return arrival;
  }

  private nextArrivalId(): string {
    return `resident-life-choice-arrival:${this.arrivalSequence++}`;
  }

  private recordAdmission(
    arrival: ResidentLifeChoiceLiveArrival,
    admissionTick: number,
    outcomeStatus: ResidentLifeChoiceAdmissionRecord["outcomeStatus"],
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
    throw new Error("resident life choice admission tick must be a non-negative safe integer");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
