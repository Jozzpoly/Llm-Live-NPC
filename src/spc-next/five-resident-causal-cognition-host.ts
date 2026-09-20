import { CognitionCoordinator, type CognitionDispatch } from "./cognition-coordinator";
import type { CognitionBatch } from "./contracts";
import {
  ResidentCausalCognitionLane,
  type ResidentCausalCognitionRequest,
  type ResidentCausalCognitionSettlement,
} from "./resident-causal-cognition-lane";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import type { FiveResidentId } from "./five-resident-region";

export const CAUSAL_STALE_RETRY_TICKS = 15;
export const CAUSAL_REJECT_RETRY_TICKS = 60;
export const CAUSAL_PROVIDER_ERROR_RETRY_TICKS = 120;

export interface FiveResidentCausalCognitionRequest extends ResidentCausalCognitionRequest {
  readonly residentId: FiveResidentId;
}

export type FiveResidentCausalCognitionSettlement =
  | {
      status: "applied";
      residentId: FiveResidentId;
      decision: Extract<ResidentCausalCognitionSettlement, { status: "applied" }>["decision"];
      commitment: {
        matterId: string;
        runId: string;
      } | null;
    }
  | {
      status: "stale" | "rejected";
      residentId: FiveResidentId;
      reason: string;
      detail?: string;
    }
  | { status: "unknown_request" };

interface RequestAuthority {
  dispatch: CognitionDispatch;
  lane: ResidentCausalCognitionLane;
}

/**
 * Fair multi-resident coordinator around the resident-generic causal cognition lane.
 *
 * Queueing, concurrency and retry timing remain five-resident orchestration policy.
 * Exact semantic admission, speech-origin grounding, commitment materialization and
 * reason settlement live in ResidentCausalCognitionLane so compact R5 specimens and
 * the unified five-resident runtime exercise the same causal rules.
 */
export class FiveResidentCausalCognitionHost {
  private readonly coordinator: CognitionCoordinator;
  private readonly lanes = new Map<FiveResidentId, ResidentCausalCognitionLane>();
  private readonly authority = new WeakMap<FiveResidentCausalCognitionRequest, RequestAuthority>();
  private readonly active = new Set<FiveResidentCausalCognitionRequest>();
  private readonly retryNotBeforeTick = new Map<FiveResidentId, number>();

  constructor(
    private readonly runtime: FiveResidentCausalLifeRuntime,
    maxConcurrent = 5,
  ) {
    this.coordinator = new CognitionCoordinator(maxConcurrent);
  }

  collectReadyBatches(): number {
    const state = this.coordinator.state();
    const inFlight = new Set(state.inFlightResidents);
    let collected = 0;

    for (const residentId of this.runtime.claimedResidentIds()) {
      if (inFlight.has(residentId)) continue;
      const retryNotBefore = this.retryNotBeforeTick.get(residentId) ?? 0;
      if (this.runtime.world.tick < retryNotBefore) continue;
      const life = this.runtime.life(residentId);
      if (!life || life.lifeIntentOwner.state().activeAttemptId !== null) continue;
      const batch = life.resident.takeCognitionBatch(this.runtime.world.tick);
      if (!batch) continue;
      this.coordinator.enqueue(batch);
      collected += 1;
    }
    return collected;
  }

  startReadyRequests(): FiveResidentCausalCognitionRequest[] {
    const requests: FiveResidentCausalCognitionRequest[] = [];

    for (const dispatch of this.coordinator.startReady(this.runtime.world.tick)) {
      const residentId = dispatch.residentId as FiveResidentId;
      const lane = this.laneFor(residentId);
      if (!lane) {
        this.coordinator.settle(dispatch.id);
        continue;
      }

      const prepared = lane.prepare(dispatch.batch, dispatch.id);
      if (!prepared) {
        lane.life.resident.requeueCognitionBatch(dispatch.batch);
        this.coordinator.settle(dispatch.id);
        continue;
      }

      const request = prepared as FiveResidentCausalCognitionRequest;
      this.authority.set(request, { dispatch, lane });
      this.active.add(request);
      requests.push(request);
    }

    return requests;
  }

  settleCommitment(
    request: FiveResidentCausalCognitionRequest,
    rawProposal: unknown,
    originReasonId: string,
  ): FiveResidentCausalCognitionSettlement {
    const local = this.claimRequest(request);
    if (!local) return { status: "unknown_request" };

    const settlement = local.lane.settleCommitment(
      request,
      rawProposal,
      originReasonId,
    );
    this.coordinator.settle(local.dispatch.id);

    if (settlement.status === "unknown_request") {
      this.deferRetry(request.residentId, CAUSAL_REJECT_RETRY_TICKS);
      return {
        status: "rejected",
        residentId: request.residentId,
        reason: "resident_lane_request_missing",
      };
    }

    if (settlement.status !== "applied") {
      this.deferRetry(
        request.residentId,
        settlement.status === "stale"
          ? CAUSAL_STALE_RETRY_TICKS
          : CAUSAL_REJECT_RETRY_TICKS,
      );
      return {
        status: settlement.status,
        residentId: request.residentId,
        reason: settlement.reason,
        ...(settlement.detail ? { detail: settlement.detail } : {}),
      };
    }

    this.retryNotBeforeTick.delete(request.residentId);
    return {
      status: "applied",
      residentId: request.residentId,
      decision: settlement.decision,
      commitment: settlement.commitment
        ? structuredClone(settlement.commitment)
        : null,
    };
  }

  abandon(
    request: FiveResidentCausalCognitionRequest,
    retryAfterTicks = CAUSAL_PROVIDER_ERROR_RETRY_TICKS,
  ): boolean {
    const local = this.claimRequest(request);
    if (!local) return false;

    const abandoned = local.lane.abandon(request);
    this.coordinator.settle(local.dispatch.id);
    this.deferRetry(request.residentId, retryAfterTicks);
    return abandoned;
  }

  state() {
    return {
      ...this.coordinator.state(),
      activeRequestCount: this.active.size,
      retryNotBeforeTick: Object.fromEntries(
        [...this.retryNotBeforeTick.entries()]
          .sort((a, b) => a[0].localeCompare(b[0])),
      ),
    };
  }

  private laneFor(residentId: FiveResidentId): ResidentCausalCognitionLane | null {
    const existing = this.lanes.get(residentId);
    if (existing) return existing;

    const life = this.runtime.life(residentId);
    if (!life) return null;

    const lane = new ResidentCausalCognitionLane(life);
    this.lanes.set(residentId, lane);
    return lane;
  }

  private deferRetry(residentId: FiveResidentId, ticks: number): void {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new Error("causal cognition retry delay must be a non-negative safe integer");
    }
    if (ticks === 0) {
      this.retryNotBeforeTick.delete(residentId);
      return;
    }
    this.retryNotBeforeTick.set(residentId, this.runtime.world.tick + ticks);
  }

  private claimRequest(
    request: FiveResidentCausalCognitionRequest,
  ): RequestAuthority | null {
    const local = this.authority.get(request);
    if (!local || !this.active.has(request)) return null;
    this.authority.delete(request);
    this.active.delete(request);
    return local;
  }
}
