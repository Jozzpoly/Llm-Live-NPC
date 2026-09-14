import { parseResidentCognitionProposal, type ResidentCognitionContext, type ResidentCognitionProposal } from "./cognition-contract";
import { CognitionGrounder, type CognitionGroundingView } from "./cognition-grounder";
import type { CognitionBatch } from "./contracts";
import { ResidentRuntime, type ResidentCognitionRevision } from "./resident-runtime";

export interface ResidentCognitionAttempt {
  readonly id: string;
  readonly residentId: string;
  readonly batch: CognitionBatch;
  readonly context: ResidentCognitionContext;
  readonly revision: ResidentCognitionRevision;
  readonly activityIdAtRequest: string;
}

export type CognitionSettlement =
  | { status: "applied"; proposal: ResidentCognitionProposal; activityChanged: boolean }
  | { status: "stale"; reason: "newer_addressed_attention" | "activity_changed_while_keep" }
  | { status: "rejected"; reason: "unknown_attempt" | "proposal_invalid" | "grounding_rejected"; detail?: string };

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
      activityIdAtRequest: context.currentActivity.id,
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
    if (attempt !== this.activeAttempt) return { status: "rejected", reason: "unknown_attempt" };
    this.activeAttempt = null;

    const proposal = parseResidentCognitionProposal(rawProposal, attempt.context);
    if (!proposal) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "rejected", reason: "proposal_invalid" };
    }

    const currentRevision = this.resident.cognitionRevision();
    if (currentRevision.attention !== attempt.revision.attention) {
      return { status: "stale", reason: "newer_addressed_attention" };
    }

    const currentActivity = this.resident.publicState().activity;
    if (currentRevision.activity !== attempt.revision.activity
      && proposal.activityDirective.kind === "keep"
      && currentActivity.id !== attempt.activityIdAtRequest) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "stale", reason: "activity_changed_while_keep" };
    }

    const grounded = this.grounder.ground(proposal, {
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

    this.resident.applySemanticUpdates(proposal, groundingView.tick);
    if (grounded.kind === "set_activity") {
      this.resident.setActivity(grounded.activity, groundingView.tick);
      return { status: "applied", proposal, activityChanged: true };
    }
    return { status: "applied", proposal, activityChanged: false };
  }

  state(): { activeAttemptId: string | null } {
    return { activeAttemptId: this.activeAttempt?.id ?? null };
  }
}
