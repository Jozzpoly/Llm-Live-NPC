import type { ResidentCognitionProposal } from "./cognition-contract";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import {
  ResidentLifeIntentOwner,
  type ResidentLifeIntentAdmission,
  type ResidentLifeIntentAttempt,
  type ResidentLifeSettlement,
} from "./resident-life-intent-owner";
import type {
  CognitionFetch,
  ResidentCognitionProviderErrorCode,
} from "./resident-cognition-live-host";

export type ResidentLifeIntentLiveArrival = Readonly<
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

type ResidentLifeLiveAdmission<T, Proposal> =
  | {
      status: "applied";
      admissionTick: number;
      settlement: Extract<ResidentLifeSettlement<T, Proposal>, { status: "applied" }>;
    }
  | {
      status: "stale";
      admissionTick: number;
      settlement: Extract<ResidentLifeSettlement<T, Proposal>, { status: "stale" }>;
    }
  | {
      status: "rejected";
      admissionTick: number;
      settlement: Extract<ResidentLifeSettlement<T, Proposal>, { status: "rejected" }>;
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

/** Compatibility result for the pre-commitment proposal vocabulary. */
export type ResidentLifeIntentLiveAdmission<T> = ResidentLifeLiveAdmission<T, ResidentCognitionProposal>;

/** Resident-life-native result whose semantic decision is independent from body activity. */
export type ResidentLifeCommitmentLiveAdmission<T> = ResidentLifeLiveAdmission<T, ResidentLifeIntentProposal>;

export interface ResidentLifeIntentAdmissionRecord {
  sequence: number;
  arrivalId: string;
  attemptId: string;
  residentId: string;
  admissionTick: number;
  arrivalStatus: ResidentLifeIntentLiveArrival["status"];
  outcomeStatus: "applied" | "stale" | "rejected" | "provider_error";
  detail: string;
}

interface PrivateArrivalAuthority {
  attempt: ResidentLifeIntentAttempt;
}

const MAX_RESPONSE_CHARACTERS = 262_144;
const ADMISSION_RECORD_LIMIT = 128;

/**
 * Asynchronous transport membrane for life-aware resident semantic intents.
 *
 * request() may complete at arbitrary wall-clock time, but the returned arrival is
 * inert. Provider/network completion cannot settle cognition, create a matter, bind a
 * run, claim the body or mutate World. Only explicit admission may consume the exact
 * host-owned arrival at a resident/World tick.
 *
 * `admitCommitment()` is the resident-life-native path. It delegates accept/decline/
 * defer/clarify settlement to ResidentLifeIntentOwner without turning that decision
 * into body authority. `admit()` remains a temporary compatibility path for callers
 * still using the older ResidentCognitionProposal activity vocabulary. Both consume
 * the same exact arrival authority, so one provider arrival can never be admitted by
 * both paths.
 *
 * Neither path owns grounding or execution. The caller supplies one bounded local
 * admission callback after exact attempt and staleness validation. Navigation/current
 * grounding, continuity and World authority stay outside this transport membrane.
 */
export class ResidentLifeIntentLiveHost {
  private arrivalSequence = 0;
  private admissionSequence = 0;
  private readonly arrivalAuthority = new WeakMap<object, PrivateArrivalAuthority>();
  private readonly activeArrivals = new Set<ResidentLifeIntentLiveArrival>();
  private readonly admittedArrivals = new WeakSet<object>();
  private readonly admissionRecords: ResidentLifeIntentAdmissionRecord[] = [];

  constructor(
    private readonly owner: ResidentLifeIntentOwner,
    private readonly endpoint = "/api/spc-next/life-intent",
    private readonly fetcher: CognitionFetch = fetch,
  ) {}

  async request(
    attempt: ResidentLifeIntentAttempt,
    options: { signal?: AbortSignal } = {},
  ): Promise<ResidentLifeIntentLiveArrival> {
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
      if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error("life-intent response too large");
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

  /** Compatibility admission for the older activityDirective proposal contract. */
  admit<T>(
    arrival: ResidentLifeIntentLiveArrival,
    admissionTick: number,
    currentLife: ResidentLifeCognitionView,
    admitIntent: (
      proposal: ResidentCognitionProposal,
      context: ResidentLifeCognitionContext,
    ) => ResidentLifeIntentAdmission<T>,
  ): ResidentLifeIntentLiveAdmission<T> {
    return this.admitWithSettlement(
      arrival,
      admissionTick,
      (attempt) => this.owner.settleIntent(
        attempt,
        arrival.status === "proposal" ? arrival.proposal : null,
        currentLife,
        admissionTick,
        admitIntent,
      ),
      "semantic_intent_applied",
    );
  }

  /**
   * Resident-life-native admission. Accepting a new commitment here does not itself
   * open a matter, bind a run, choose body focus or mutate World; those remain caller-
   * owned consequences after the exact proposal survives owner validation.
   */
  admitCommitment<T>(
    arrival: ResidentLifeIntentLiveArrival,
    admissionTick: number,
    currentLife: ResidentLifeCognitionView,
    admitIntent: (
      proposal: ResidentLifeIntentProposal,
      context: ResidentLifeCognitionContext,
    ) => ResidentLifeIntentAdmission<T>,
  ): ResidentLifeCommitmentLiveAdmission<T> {
    return this.admitWithSettlement(
      arrival,
      admissionTick,
      (attempt) => this.owner.settleCommitmentIntent(
        attempt,
        arrival.status === "proposal" ? arrival.proposal : null,
        currentLife,
        admissionTick,
        admitIntent,
      ),
      "semantic_commitment_applied",
    );
  }

  pendingArrivals(): number {
    return this.activeArrivals.size;
  }

  recentAdmissions(): ResidentLifeIntentAdmissionRecord[] {
    return this.admissionRecords.map((record) => structuredClone(record));
  }

  private admitWithSettlement<T, Proposal>(
    arrival: ResidentLifeIntentLiveArrival,
    admissionTick: number,
    settle: (attempt: ResidentLifeIntentAttempt) => ResidentLifeSettlement<T, Proposal>,
    appliedDetail: string,
  ): ResidentLifeLiveAdmission<T, Proposal> {
    assertAdmissionTick(admissionTick);
    const authority = this.claimArrival(arrival);
    if (!authority) {
      return {
        status: "arrival_rejected",
        reason: this.admittedArrivals.has(arrival) ? "already_admitted" : "unknown_arrival",
      };
    }

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

    const settlement = settle(authority.attempt);
    if (settlement.status === "applied") {
      this.recordAdmission(arrival, admissionTick, "applied", appliedDetail);
      return { status: "applied", admissionTick, settlement };
    }
    if (settlement.status === "stale") {
      this.recordAdmission(arrival, admissionTick, "stale", settlement.reason);
      return { status: "stale", admissionTick, settlement };
    }

    this.recordAdmission(arrival, admissionTick, "rejected", settlement.reason);
    return { status: "rejected", admissionTick, settlement };
  }

  /**
   * The only admission-authority consumption point. Both compatibility and commitment
   * paths must claim the same exact object identity here before touching the owner.
   */
  private claimArrival(arrival: ResidentLifeIntentLiveArrival): PrivateArrivalAuthority | null {
    const authority = this.arrivalAuthority.get(arrival);
    if (!authority) return null;
    this.arrivalAuthority.delete(arrival);
    this.activeArrivals.delete(arrival);
    this.admittedArrivals.add(arrival);
    return authority;
  }

  private registerErrorArrival(
    attempt: ResidentLifeIntentAttempt,
    code: ResidentCognitionProviderErrorCode,
  ): ResidentLifeIntentLiveArrival {
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
    attempt: ResidentLifeIntentAttempt,
    arrival: ResidentLifeIntentLiveArrival,
  ): ResidentLifeIntentLiveArrival {
    this.arrivalAuthority.set(arrival, { attempt });
    this.activeArrivals.add(arrival);
    return arrival;
  }

  private nextArrivalId(): string {
    return `resident-life-intent-arrival:${this.arrivalSequence++}`;
  }

  private recordAdmission(
    arrival: ResidentLifeIntentLiveArrival,
    admissionTick: number,
    outcomeStatus: ResidentLifeIntentAdmissionRecord["outcomeStatus"],
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
    throw new Error("resident life intent admission tick must be a non-negative safe integer");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
