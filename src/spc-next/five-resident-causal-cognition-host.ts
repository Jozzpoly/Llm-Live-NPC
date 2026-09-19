import { CognitionCoordinator, type CognitionDispatch } from "./cognition-coordinator";
import type { CognitionBatch, CognitionReason, WorldOccurrence } from "./contracts";
import type {
  AcceptedResidentCausalCommunicateCommitment,
  GroundedResidentCausalCommunicateCommitmentIntent,
} from "./resident-causal-communicate-commitment";
import type {
  AcceptedResidentCausalReasonCommitment,
  GroundedResidentCausalReasonCommitmentIntent,
} from "./resident-causal-reason-commitment";
import type {
  AcceptedResidentCausalTravelCommitment,
  GroundedResidentCausalTravelCommitmentIntent,
} from "./resident-causal-travel-commitment";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import type { PreparedResidentCausalLifeIntent } from "./resident-causal-life-substrate";
import {
  FiveResidentCausalLifeRuntime,
} from "./five-resident-causal-life-runtime";
import type { FiveResidentId } from "./five-resident-region";

export const CAUSAL_STALE_RETRY_TICKS = 15;
export const CAUSAL_REJECT_RETRY_TICKS = 60;
export const CAUSAL_PROVIDER_ERROR_RETRY_TICKS = 120;

export interface FiveResidentCausalCognitionRequest {
  readonly id: string;
  readonly residentId: FiveResidentId;
  readonly batch: CognitionBatch;
  readonly context: PreparedResidentCausalLifeIntent["attempt"]["context"];
}

interface RequestAuthority {
  dispatch: CognitionDispatch;
  prepared: PreparedResidentCausalLifeIntent;
}

type AcceptedCommitment =
  | AcceptedResidentCausalTravelCommitment
  | AcceptedResidentCausalCommunicateCommitment
  | AcceptedResidentCausalReasonCommitment;

export type FiveResidentCausalCognitionSettlement =
  | {
      status: "applied";
      residentId: FiveResidentId;
      decision: ResidentLifeIntentProposal["commitmentDecision"]["kind"];
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

/**
 * Fair cognition admission host for the unified five-resident causal-life runtime.
 *
 * It reuses CognitionCoordinator only for queueing/concurrency. Unlike the legacy
 * SpcCognitionHost it never installs provider output as ResidentRuntime activity.
 * Every accepted embodied decision must name one exact origin reason and pass through
 * resident-local grounding + continuity/run authority before execution can affect World.
 */
export class FiveResidentCausalCognitionHost {
  private readonly coordinator: CognitionCoordinator;
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
      const life = this.runtime.life(residentId);
      if (!life) {
        this.coordinator.settle(dispatch.id);
        continue;
      }

      const prepared = life.prepareLifeIntentAttempt(dispatch.batch);
      if (!prepared) {
        life.resident.requeueCognitionBatch(dispatch.batch);
        this.coordinator.settle(dispatch.id);
        continue;
      }

      const request = Object.freeze({
        id: dispatch.id,
        residentId,
        batch: structuredClone(dispatch.batch),
        context: structuredClone(prepared.attempt.context),
      }) satisfies FiveResidentCausalCognitionRequest;
      this.authority.set(request, { dispatch, prepared });
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

    const life = this.runtime.life(request.residentId);
    if (!life) {
      this.coordinator.settle(local.dispatch.id);
      return {
        status: "rejected",
        residentId: request.residentId,
        reason: "resident_life_missing",
      };
    }

    const originReason = local.prepared.batch.reasons.find((reason) => reason.id === originReasonId) ?? null;
    if (!originReason) {
      life.lifeIntentOwner.abandon(local.prepared.attempt);
      this.coordinator.settle(local.dispatch.id);
      this.deferRetry(request.residentId, CAUSAL_REJECT_RETRY_TICKS);
      return {
        status: "rejected",
        residentId: request.residentId,
        reason: "origin_reason_missing",
      };
    }

    const groundingBatch: CognitionBatch = {
      residentId: request.residentId,
      requestedAtTick: this.runtime.world.tick,
      reasons: structuredClone(local.prepared.batch.reasons),
    };
    const groundingContext = life.resident.cognitionContext(groundingBatch);

    type Admission =
      | { kind: "no_commitment" }
      | {
          kind: "speech_travel";
          occurrence: WorldOccurrence;
          intent: GroundedResidentCausalTravelCommitmentIntent;
        }
      | {
          kind: "speech_communicate";
          occurrence: WorldOccurrence;
          intent: GroundedResidentCausalCommunicateCommitmentIntent;
        }
      | {
          kind: "reason";
          intent: GroundedResidentCausalReasonCommitmentIntent;
        };

    const settlement = life.lifeIntentOwner.settleCommitmentIntent<Admission>(
      local.prepared.attempt,
      rawProposal,
      life.currentLifeView(),
      this.runtime.world.tick,
      (proposal, providerContext) => {
        if (proposal.commitmentDecision.kind !== "accept"
          || proposal.commitmentDecision.intent.kind === "idle") {
          return { status: "accepted", intent: { kind: "no_commitment" } };
        }

        if (originReason.kind === "heard_speech") {
          const occurrence = exactSpeechOccurrence(
            this.runtime,
            local.prepared,
            originReason,
          );
          if (!occurrence) {
            return { status: "rejected", detail: "speech origin occurrence unavailable" };
          }

          if (proposal.commitmentDecision.intent.kind === "travel") {
            const grounded = life.travelCommitments.groundPrivateSpeechCommitment({
              attempt: local.prepared.attempt,
              occurrence,
              proposal,
              providerContext,
              groundingContext,
            });
            return grounded.status === "accepted"
              ? { status: "accepted", intent: { kind: "speech_travel", occurrence, intent: grounded.intent } }
              : grounded;
          }

          if (proposal.commitmentDecision.intent.kind === "communicate") {
            const grounded = life.communicateCommitments.groundPrivateSpeechCommitment({
              attempt: local.prepared.attempt,
              occurrence,
              proposal,
              providerContext,
              groundingContext,
            });
            return grounded.status === "accepted"
              ? { status: "accepted", intent: { kind: "speech_communicate", occurrence, intent: grounded.intent } }
              : grounded;
          }

          return {
            status: "rejected",
            detail: "speech-origin commitment currently supports travel or communication",
          };
        }

        const grounded = life.reasonCommitments.groundCommitment({
          attempt: local.prepared.attempt,
          originReasonId,
          proposal,
          providerContext,
          groundingContext,
        });
        return grounded.status === "accepted"
          ? { status: "accepted", intent: { kind: "reason", intent: grounded.intent } }
          : grounded;
      },
    );

    this.coordinator.settle(local.dispatch.id);

    if (settlement.status !== "applied") {
      this.deferRetry(
        request.residentId,
        settlement.status === "stale" ? CAUSAL_STALE_RETRY_TICKS : CAUSAL_REJECT_RETRY_TICKS,
      );
      return {
        status: settlement.status,
        residentId: request.residentId,
        reason: settlement.reason,
        ...("detail" in settlement && settlement.detail ? { detail: settlement.detail } : {}),
      };
    }

    this.retryNotBeforeTick.delete(request.residentId);
    life.resident.scheduleAdaptiveReview(
      this.runtime.world.tick,
      settlement.proposal.reviewAfterSeconds,
      this.runtime.world.options.fixedDeltaSeconds,
    );

    const admitted = settlement.intent;
    let commitment: AcceptedCommitment | null = null;
    if (admitted.kind === "speech_travel") {
      commitment = life.travelCommitments.materializePrivateSpeechCommitment({
        attempt: local.prepared.attempt,
        occurrence: admitted.occurrence,
        proposal: settlement.proposal,
        intent: admitted.intent,
      });
    } else if (admitted.kind === "speech_communicate") {
      commitment = life.communicateCommitments.materializePrivateSpeechCommitment({
        attempt: local.prepared.attempt,
        occurrence: admitted.occurrence,
        proposal: settlement.proposal,
        intent: admitted.intent,
      });
    } else if (admitted.kind === "reason") {
      commitment = life.reasonCommitments.materializeCommitment({
        attempt: local.prepared.attempt,
        originReasonId,
        proposal: settlement.proposal,
        intent: admitted.intent,
        tick: this.runtime.world.tick,
      });
    }

    const decision = settlement.proposal.commitmentDecision.kind;
    const retainOriginUntilTick = decision === "defer" || decision === "clarify"
      ? this.runtime.world.tick + Math.max(
          1,
          Math.ceil(
            settlement.proposal.reviewAfterSeconds
              / this.runtime.world.options.fixedDeltaSeconds,
          ),
        )
      : undefined;

    life.resident.reconcileCognitionSettlement({
      batch: local.prepared.batch,
      originReasonId,
      decision,
      tick: this.runtime.world.tick,
      ...(retainOriginUntilTick === undefined ? {} : { retainOriginUntilTick }),
    });

    return {
      status: "applied",
      residentId: request.residentId,
      decision,
      commitment: commitment
        ? { matterId: commitment.matter.id, runId: commitment.runId }
        : null,
    };
  }

  abandon(
    request: FiveResidentCausalCognitionRequest,
    retryAfterTicks = CAUSAL_PROVIDER_ERROR_RETRY_TICKS,
  ): boolean {
    const local = this.claimRequest(request);
    if (!local) return false;
    const life = this.runtime.life(request.residentId);
    const abandoned = life?.lifeIntentOwner.abandon(local.prepared.attempt) ?? false;
    this.coordinator.settle(local.dispatch.id);
    this.deferRetry(request.residentId, retryAfterTicks);
    return abandoned;
  }

  state() {
    return {
      ...this.coordinator.state(),
      activeRequestCount: this.active.size,
      retryNotBeforeTick: Object.fromEntries(
        [...this.retryNotBeforeTick.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
    };
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

  private claimRequest(request: FiveResidentCausalCognitionRequest): RequestAuthority | null {
    const local = this.authority.get(request);
    if (!local || !this.active.has(request)) return null;
    this.authority.delete(request);
    this.active.delete(request);
    return local;
  }
}

function exactSpeechOccurrence(
  runtime: FiveResidentCausalLifeRuntime,
  prepared: PreparedResidentCausalLifeIntent,
  reason: CognitionReason,
): WorldOccurrence | null {
  const perceptId = reason.evidenceIds.length === 1 ? reason.evidenceIds[0] : null;
  if (!perceptId) return null;
  const percept = prepared.attempt.context.recentPercepts.find(
    (candidate) => candidate.id === perceptId && candidate.phenomenon === "speech",
  );
  if (!percept) return null;

  return runtime.world.diagnostics().recentOccurrences.find(
    (occurrence) => occurrence.id === percept.occurrenceId
      && occurrence.kind === "speech"
      && occurrence.text === percept.text,
  ) ?? null;
}
