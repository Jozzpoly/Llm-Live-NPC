import { parseResidentCognitionProposal, type ResidentCognitionContext, type ResidentCognitionProposal } from "./cognition-contract";
import { CognitionGrounder, type CognitionGroundingView } from "./cognition-grounder";
import type { CognitionBatch, ResidentActivity } from "./contracts";
import { ResidentRuntime, type ResidentCognitionRevision } from "./resident-runtime";

export interface ResidentCognitionAttempt {
  readonly id: string;
  readonly residentId: string;
  readonly batch: CognitionBatch;
  readonly context: ResidentCognitionContext;
  readonly revision: ResidentCognitionRevision;
}

export type CognitionSettlement =
  | {
      status: "applied";
      proposal: ResidentCognitionProposal;
      activityTransition: ResidentActivity | null;
    }
  | { status: "stale"; reason: "newer_addressed_attention" | "activity_changed_during_request" }
  | { status: "rejected"; reason: "unknown_attempt" | "proposal_invalid" | "grounding_rejected"; detail?: string };

export type CognitionIntentAdmission<T> =
  | { status: "accepted"; intent: T }
  | { status: "rejected"; detail: string };

export type CognitionIntentSettlement<T> =
  | {
      status: "applied";
      proposal: ResidentCognitionProposal;
      intent: T;
    }
  | { status: "stale"; reason: "newer_addressed_attention" | "activity_changed_during_request" }
  | { status: "rejected"; reason: "unknown_attempt" | "proposal_invalid" | "intent_rejected"; detail?: string };

type ConsumedAttempt =
  | { status: "ready"; proposal: ResidentCognitionProposal }
  | { status: "stale"; reason: "newer_addressed_attention" | "activity_changed_during_request" }
  | { status: "rejected"; reason: "unknown_attempt" | "proposal_invalid" };

export class ResidentCognitionOwner {
  private activeAttempt: ResidentCognitionAttempt | null = null;
  private sequence = 0;

  constructor(
    private readonly resident: ResidentRuntime,
    private readonly grounder: CognitionGrounder,
  ) {}

  prepare(batch: CognitionBatch): ResidentCognitionAttempt | null {
    if (this.activeAttempt) return null;
    if (batch.residentId !== this.resident.profile.id) throw new Error("cognition batch belongs to another resident");
    const context = this.resident.cognitionContext(batch);
    const attempt: ResidentCognitionAttempt = {
      id: `resident-cognition:${batch.residentId}:${batch.requestedAtTick}:${this.sequence++}`,
      residentId: batch.residentId,
      batch: structuredClone(batch),
      context: structuredClone(context),
      revision: this.resident.cognitionRevision(),
    };
    this.activeAttempt = attempt;
    return attempt;
  }

  abandon(attempt: ResidentCognitionAttempt): boolean {
    if (attempt !== this.activeAttempt) return false;
    this.activeAttempt = null;
    this.resident.requeueCognitionBatch(attempt.batch);
    return true;
  }

  settle(
    attempt: ResidentCognitionAttempt,
    rawProposal: unknown,
    groundingView: Omit<CognitionGroundingView, "residentId" | "tick" | "context"> & { tick: number },
  ): CognitionSettlement {
    const consumed = this.consumeAttempt(attempt, rawProposal);
    if (consumed.status !== "ready") return consumed;

    const grounded = this.grounder.ground(consumed.proposal, {
      residentId: attempt.residentId,
      tick: groundingView.tick,
      currentPosition: groundingView.currentPosition,
      currentRegionId: groundingView.currentRegionId,
      context: attempt.context,
    });
    if (grounded.kind === "rejected") {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "rejected", reason: "grounding_rejected", detail: grounded.reason };
    }

    // Use the exact private percept projection that the provider was allowed to
    // cite, not whatever happens to remain in the bounded live ring after model
    // latency. This preserves provenance without granting stale proposal authority.
    this.resident.applySemanticUpdates(consumed.proposal, groundingView.tick, attempt.context.recentPercepts);
    return {
      status: "applied",
      proposal: consumed.proposal,
      activityTransition: grounded.kind === "set_activity" ? structuredClone(grounded.activity) : null,
    };
  }

  /**
   * Settle one resident-level cognition request into an already-bounded semantic intent
   * instead of a legacy ResidentActivity.
   *
   * The callback receives only the parsed proposal plus the exact private context that
   * was frozen when `prepare()` created this attempt. It may ground/validate a bounded
   * intent (for example a known-region route) but must not mutate World. The same stale
   * attention/activity checks and requeue semantics as `settle()` are applied first.
   * Private semantic updates are admitted only after the caller accepts the intent.
   *
   * This is the bridge for continuing-matter composition. It does not itself open a
   * matter, bind a run, or grant body authority.
   */
  settleIntent<T>(
    attempt: ResidentCognitionAttempt,
    rawProposal: unknown,
    tick: number,
    admit: (proposal: ResidentCognitionProposal, context: ResidentCognitionContext) => CognitionIntentAdmission<T>,
  ): CognitionIntentSettlement<T> {
    const consumed = this.consumeAttempt(attempt, rawProposal);
    if (consumed.status !== "ready") return consumed;

    const admission = admit(consumed.proposal, attempt.context);
    if (admission.status === "rejected") {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "rejected", reason: "intent_rejected", detail: admission.detail };
    }

    this.resident.applySemanticUpdates(consumed.proposal, tick, attempt.context.recentPercepts);
    return {
      status: "applied",
      proposal: consumed.proposal,
      intent: admission.intent,
    };
  }

  state(): { activeAttemptId: string | null } {
    return { activeAttemptId: this.activeAttempt?.id ?? null };
  }

  private consumeAttempt(attempt: ResidentCognitionAttempt, rawProposal: unknown): ConsumedAttempt {
    if (attempt !== this.activeAttempt) return { status: "rejected", reason: "unknown_attempt" };
    this.activeAttempt = null;

    const proposal = parseResidentCognitionProposal(rawProposal, attempt.context);
    if (!proposal) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "rejected", reason: "proposal_invalid" };
    }

    const currentRevision = this.resident.cognitionRevision();
    if (currentRevision.attention !== attempt.revision.attention) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "stale", reason: "newer_addressed_attention" };
    }
    if (currentRevision.activity !== attempt.revision.activity) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "stale", reason: "activity_changed_during_request" };
    }

    return { status: "ready", proposal };
  }
}
