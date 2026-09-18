import type { ResidentKernelEvidence } from "./resident-continuity-kernel";
import type { ResidentRuntime } from "./resident-runtime";

export interface ResidentLifeOutcomeReviewBridgeOptions {
  reviewAfterSeconds?: number;
  fixedDeltaSeconds?: number;
  rememberedOutcomeLimit?: number;
}

export type ResidentLifeOutcomeReviewObservation =
  | { status: "scheduled"; outcomeEvidenceId: string }
  | { status: "already_scheduled"; outcomeEvidenceId: string };

const DEFAULT_REVIEW_AFTER_SECONDS = 0.25;
const DEFAULT_FIXED_DELTA_SECONDS = 1 / 60;
const DEFAULT_REMEMBERED_OUTCOME_LIMIT = 128;

/**
 * Edge-triggered bridge from an already factual recovered-run outcome into the
 * resident's existing cognition cadence.
 *
 * Kernel evidence remains continuity truth, not a percept and not a cognition reason.
 * This bridge therefore creates no synthetic evidence and exposes no semantic/body
 * authority. It merely ensures that a newly observed factual outcome gets one bounded
 * near-term opportunity to be interpreted through the ordinary resident-life context.
 */
export class ResidentLifeOutcomeReviewBridge {
  private readonly observedOutcomeEvidenceIds = new Set<string>();
  private readonly observedOutcomeOrder: string[] = [];
  private readonly reviewAfterSeconds: number;
  private readonly fixedDeltaSeconds: number;
  private readonly rememberedOutcomeLimit: number;

  constructor(
    private readonly resident: Pick<ResidentRuntime, "scheduleAdaptiveReview">,
    options: ResidentLifeOutcomeReviewBridgeOptions = {},
  ) {
    this.reviewAfterSeconds = options.reviewAfterSeconds ?? DEFAULT_REVIEW_AFTER_SECONDS;
    this.fixedDeltaSeconds = options.fixedDeltaSeconds ?? DEFAULT_FIXED_DELTA_SECONDS;
    this.rememberedOutcomeLimit = options.rememberedOutcomeLimit ?? DEFAULT_REMEMBERED_OUTCOME_LIMIT;
    if (!Number.isFinite(this.reviewAfterSeconds) || this.reviewAfterSeconds <= 0) {
      throw new Error("life outcome reviewAfterSeconds must be positive and finite");
    }
    if (!Number.isFinite(this.fixedDeltaSeconds) || this.fixedDeltaSeconds <= 0) {
      throw new Error("life outcome fixedDeltaSeconds must be positive and finite");
    }
    if (!Number.isSafeInteger(this.rememberedOutcomeLimit) || this.rememberedOutcomeLimit < 1) {
      throw new Error("life outcome rememberedOutcomeLimit must be a positive safe integer");
    }
  }

  observe(
    outcomeEvidence: ResidentKernelEvidence,
    tick: number,
  ): ResidentLifeOutcomeReviewObservation {
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new Error("life outcome observation tick must be a non-negative safe integer");
    }
    if (!outcomeEvidence
      || outcomeEvidence.kind !== "task_outcome"
      || typeof outcomeEvidence.id !== "string"
      || outcomeEvidence.id.trim().length === 0
      || !Number.isSafeInteger(outcomeEvidence.tick)
      || outcomeEvidence.tick < 0
      || outcomeEvidence.tick > tick) {
      throw new Error("life outcome review requires task_outcome evidence");
    }

    if (this.observedOutcomeEvidenceIds.has(outcomeEvidence.id)) {
      return { status: "already_scheduled", outcomeEvidenceId: outcomeEvidence.id };
    }

    this.observedOutcomeEvidenceIds.add(outcomeEvidence.id);
    this.observedOutcomeOrder.push(outcomeEvidence.id);
    while (this.observedOutcomeOrder.length > this.rememberedOutcomeLimit) {
      const evicted = this.observedOutcomeOrder.shift();
      if (evicted !== undefined) this.observedOutcomeEvidenceIds.delete(evicted);
    }
    this.resident.scheduleAdaptiveReview(
      tick,
      this.reviewAfterSeconds,
      this.fixedDeltaSeconds,
    );
    return { status: "scheduled", outcomeEvidenceId: outcomeEvidence.id };
  }
}
