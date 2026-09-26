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
import type {
  PreparedResidentCausalLifeIntent,
  ResidentCausalLifeSubstrate,
} from "./resident-causal-life-substrate";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

export interface ResidentCausalCognitionRequest {
  readonly id: string;
  readonly residentId: string;
  readonly batch: CognitionBatch;
  readonly context: PreparedResidentCausalLifeIntent["attempt"]["context"];
}

interface RequestAuthority {
  prepared: PreparedResidentCausalLifeIntent;
}

type AcceptedCommitment =
  | AcceptedResidentCausalTravelCommitment
  | AcceptedResidentCausalCommunicateCommitment
  | AcceptedResidentCausalReasonCommitment;

export type ResidentCausalCognitionSettlement =
  | {
      status: "applied";
      residentId: string;
      decision: ResidentLifeIntentProposal["commitmentDecision"]["kind"];
      commitment: {
        matterId: string;
        runId: string;
      } | null;
    }
  | {
      status: "stale" | "rejected";
      residentId: string;
      reason: string;
      detail?: string;
    }
  | { status: "unknown_request" };

/**
 * One resident's reason-native higher-cognition admission lane.
 *
 * This is deliberately smaller than a scheduler, provider transport or multi-resident
 * coordinator. It owns only the causal transition:
 *
 *   exact CognitionBatch
 *     -> frozen ResidentLifeIntentAttempt
 *     -> locally admitted semantic commitment
 *     -> exact reason reconciliation
 *
 * It does not decide when provider work runs, does not perform network IO, does not
 * advance World time and never grants provider output direct World authority.
 *
 * The class is extracted from the already-qualified five-resident causal cognition
 * policy so compact R5 specimens and later multi-resident orchestration share the same
 * semantic admission rules instead of duplicating them.
 */
export class ResidentCausalCognitionLane {
  private sequence = 0;
  private readonly authority = new WeakMap<ResidentCausalCognitionRequest, RequestAuthority>();
  private readonly active = new Set<ResidentCausalCognitionRequest>();

  constructor(readonly life: ResidentCausalLifeSubstrate) {}

  takeReadyRequest(requestId?: string): ResidentCausalCognitionRequest | null {
    const prepared = this.life.takeReadyLifeIntentAttempt();
    return prepared ? this.register(prepared, requestId) : null;
  }

  prepare(
    batch: CognitionBatch,
    requestId?: string,
  ): ResidentCausalCognitionRequest | null {
    const prepared = this.life.prepareLifeIntentAttempt(batch);
    return prepared ? this.register(prepared, requestId) : null;
  }

  settleCommitment(
    request: ResidentCausalCognitionRequest,
    rawProposal: unknown,
    originReasonId: string,
  ): ResidentCausalCognitionSettlement {
    const local = this.claimRequest(request);
    if (!local) return { status: "unknown_request" };

    const originReason = local.prepared.batch.reasons.find(
      (reason) => reason.id === originReasonId,
    ) ?? null;
    if (!originReason) {
      this.life.lifeIntentOwner.abandon(local.prepared.attempt);
      return {
        status: "rejected",
        residentId: this.life.residentId,
        reason: "origin_reason_missing",
      };
    }

    const groundingBatch: CognitionBatch = {
      residentId: this.life.residentId,
      requestedAtTick: this.life.world.tick,
      reasons: structuredClone(local.prepared.batch.reasons),
    };
    const groundingContext = this.life.resident.cognitionContext(groundingBatch);

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
        }
      | {
          kind: "release_standing";
          matterId: string;
          occurrence: WorldOccurrence;
          reason: string;
        }
      | {
          kind: "complete_standing";
          matterId: string;
          outcomeEvidenceId: string;
          reason: string;
        };

    const settlement = this.life.lifeIntentOwner.settleCommitmentIntent<Admission>(
      local.prepared.attempt,
      rawProposal,
      this.life.currentLifeView(),
      this.life.world.tick,
      (proposal, providerContext) => {
        if (proposal.commitmentDecision.kind === "complete_standing") {
          const completionDecision = proposal.commitmentDecision;
          if (originReason.kind !== "activity_completed" || originReason.evidenceIds.length !== 1) {
            return {
              status: "rejected",
              detail: "standing completion requires one exact activity-completed outcome origin",
            };
          }
          const outcomeEvidenceId = originReason.evidenceIds[0]!;
          const outcomeEvidence = this.life.kernel.recentEvidenceSnapshot().find(
            (candidate) => candidate.id === outcomeEvidenceId,
          ) ?? null;
          if (!outcomeEvidence
            || outcomeEvidence.kind !== "task_outcome"
            || !outcomeEvidence.sourceRunId) {
            return {
              status: "rejected",
              detail: "standing completion factual task outcome unavailable",
            };
          }
          const matter = providerContext.life.matters.find(
            (candidate) => candidate.id === completionDecision.matterId,
          ) ?? null;
          if (!matter
            || (matter.status !== "active" && matter.status !== "suspended")
            || matter.activeRun !== null
            || matter.semanticIntent?.kind !== "standing_social_commitment") {
            return {
              status: "rejected",
              detail: "standing completion target is not one open run-free standing commitment",
            };
          }
          return {
            status: "accepted",
            intent: {
              kind: "complete_standing",
              matterId: matter.id,
              outcomeEvidenceId,
              reason: completionDecision.reason,
            },
          };
        }

        if (proposal.commitmentDecision.kind === "release_standing") {
          const releaseDecision = proposal.commitmentDecision;
          if (originReason.kind !== "heard_speech") {
            return {
              status: "rejected",
              detail: "standing commitment release requires exact heard-speech origin",
            };
          }
          const occurrence = exactSpeechOccurrence(this.life, local.prepared, originReason);
          if (!occurrence) {
            return { status: "rejected", detail: "standing release speech occurrence unavailable" };
          }
          const matter = providerContext.life.matters.find(
            (candidate) => candidate.id === releaseDecision.matterId,
          ) ?? null;
          if (!matter
            || (matter.status !== "active" && matter.status !== "suspended")
            || matter.activeRun !== null
            || matter.semanticIntent?.kind !== "standing_social_commitment") {
            return {
              status: "rejected",
              detail: "standing release target is not one open run-free standing commitment",
            };
          }
          if (occurrence.actorId !== matter.semanticIntent.counterpartyActorId
            || !occurrence.addressedActorIds.includes(this.life.residentId)) {
            return {
              status: "rejected",
              detail: "standing release origin is not factual addressed speech from its counterparty",
            };
          }
          return {
            status: "accepted",
            intent: {
              kind: "release_standing",
              matterId: matter.id,
              occurrence,
              reason: releaseDecision.reason,
            },
          };
        }

        if (proposal.commitmentDecision.kind !== "accept"
          || proposal.commitmentDecision.intent.kind === "idle") {
          return { status: "accepted", intent: { kind: "no_commitment" } };
        }

        if (originReason.kind === "heard_speech") {
          const occurrence = exactSpeechOccurrence(this.life, local.prepared, originReason);
          if (!occurrence) {
            return { status: "rejected", detail: "speech origin occurrence unavailable" };
          }

          if (proposal.commitmentDecision.intent.kind === "travel") {
            const grounded = this.life.travelCommitments.groundPrivateSpeechCommitment({
              attempt: local.prepared.attempt,
              occurrence,
              proposal,
              providerContext,
              groundingContext,
            });
            return grounded.status === "accepted"
              ? {
                  status: "accepted",
                  intent: {
                    kind: "speech_travel",
                    occurrence,
                    intent: grounded.intent,
                  },
                }
              : grounded;
          }

          if (proposal.commitmentDecision.intent.kind === "communicate") {
            const grounded = this.life.communicateCommitments.groundPrivateSpeechCommitment({
              attempt: local.prepared.attempt,
              occurrence,
              proposal,
              providerContext,
              groundingContext,
            });
            return grounded.status === "accepted"
              ? {
                  status: "accepted",
                  intent: {
                    kind: "speech_communicate",
                    occurrence,
                    intent: grounded.intent,
                  },
                }
              : grounded;
          }

          return {
            status: "rejected",
            detail: "speech-origin commitment currently supports travel or communication",
          };
        }

        const grounded = this.life.reasonCommitments.groundCommitment({
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

    if (settlement.status !== "applied") {
      return {
        status: settlement.status,
        residentId: this.life.residentId,
        reason: settlement.reason,
        ...("detail" in settlement && settlement.detail
          ? { detail: settlement.detail }
          : {}),
      };
    }

    this.life.resident.scheduleAdaptiveReview(
      this.life.world.tick,
      settlement.proposal.reviewAfterSeconds,
      this.life.world.options.fixedDeltaSeconds,
    );

    const admitted = settlement.intent;
    let commitment: AcceptedCommitment | null = null;
    if (admitted.kind === "speech_travel") {
      commitment = this.life.travelCommitments.materializePrivateSpeechCommitment({
        attempt: local.prepared.attempt,
        occurrence: admitted.occurrence,
        proposal: settlement.proposal,
        intent: admitted.intent,
      });
    } else if (admitted.kind === "speech_communicate") {
      commitment = this.life.communicateCommitments.materializePrivateSpeechCommitment({
        attempt: local.prepared.attempt,
        occurrence: admitted.occurrence,
        proposal: settlement.proposal,
        intent: admitted.intent,
      });
    } else if (admitted.kind === "reason") {
      commitment = this.life.reasonCommitments.materializeCommitment({
        attempt: local.prepared.attempt,
        originReasonId,
        proposal: settlement.proposal,
        intent: admitted.intent,
        tick: this.life.world.tick,
      });
    } else if (admitted.kind === "release_standing") {
      this.life.originatedSocialCommitments.releaseAfterCounterpartySpeech({
        matterId: admitted.matterId,
        occurrenceId: admitted.occurrence.id,
        tick: this.life.world.tick,
        reason: admitted.reason,
      });
    } else if (admitted.kind === "complete_standing") {
      this.life.originatedSocialCommitments.completeAfterFactualOutcome({
        matterId: admitted.matterId,
        outcomeEvidenceId: admitted.outcomeEvidenceId,
        tick: this.life.world.tick,
        reason: admitted.reason,
      });
    }

    const decision = settlement.proposal.commitmentDecision.kind;
    const retainOriginUntilTick = decision === "defer" || decision === "clarify"
      ? this.life.world.tick + Math.max(
          1,
          Math.ceil(
            settlement.proposal.reviewAfterSeconds
              / this.life.world.options.fixedDeltaSeconds,
          ),
        )
      : undefined;

    this.life.resident.reconcileCognitionSettlement({
      batch: local.prepared.batch,
      originReasonId,
      decision,
      tick: this.life.world.tick,
      ...(retainOriginUntilTick === undefined ? {} : { retainOriginUntilTick }),
    });

    return {
      status: "applied",
      residentId: this.life.residentId,
      decision,
      commitment: commitment
        ? { matterId: commitment.matter.id, runId: commitment.runId }
        : null,
    };
  }

  abandon(request: ResidentCausalCognitionRequest): boolean {
    const local = this.claimRequest(request);
    if (!local) return false;
    return this.life.lifeIntentOwner.abandon(local.prepared.attempt);
  }

  state(): {
    residentId: string;
    activeRequestCount: number;
    activeAttemptId: string | null;
  } {
    return {
      residentId: this.life.residentId,
      activeRequestCount: this.active.size,
      activeAttemptId: this.life.lifeIntentOwner.state().activeAttemptId,
    };
  }

  private register(
    prepared: PreparedResidentCausalLifeIntent,
    requestId?: string,
  ): ResidentCausalCognitionRequest {
    const id = requestId
      ?? "resident-causal-cognition:"
        + this.life.residentId
        + ":"
        + this.life.world.tick
        + ":"
        + this.sequence++;
    if (!id.trim()) throw new Error("resident causal cognition request id must be non-empty");
    const request = Object.freeze({
      id,
      residentId: this.life.residentId,
      batch: structuredClone(prepared.batch),
      context: structuredClone(prepared.attempt.context),
    }) satisfies ResidentCausalCognitionRequest;
    this.authority.set(request, { prepared });
    this.active.add(request);
    return request;
  }

  private claimRequest(
    request: ResidentCausalCognitionRequest,
  ): RequestAuthority | null {
    const local = this.authority.get(request);
    if (!local || !this.active.has(request)) return null;
    this.authority.delete(request);
    this.active.delete(request);
    return local;
  }
}

function exactSpeechOccurrence(
  life: ResidentCausalLifeSubstrate,
  prepared: PreparedResidentCausalLifeIntent,
  reason: CognitionReason,
): WorldOccurrence | null {
  const perceptId = reason.evidenceIds.length === 1 ? reason.evidenceIds[0] : null;
  if (!perceptId) return null;
  const percept = prepared.attempt.context.recentPercepts.find(
    (candidate) => candidate.id === perceptId && candidate.phenomenon === "speech",
  );
  if (!percept) return null;

  return life.world.diagnostics().recentOccurrences.find(
    (occurrence) => occurrence.id === percept.occurrenceId
      && occurrence.kind === "speech"
      && occurrence.text === percept.text,
  ) ?? null;
}
