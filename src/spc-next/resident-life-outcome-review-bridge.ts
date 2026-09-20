import { deriveSpcIdentifier } from "./identity-contract";
import type { ResidentKernelEvidence } from "./resident-continuity-kernel";
import type { ResidentRuntime } from "./resident-runtime";

export interface ResidentLifeOutcomeReviewBridgeOptions {
  /** Historical compatibility only; explicit outcome pressure no longer needs a quiet-review delay. */
  reviewAfterSeconds?: number;
  /** Historical compatibility only; explicit outcome pressure no longer needs a quiet-review cadence. */
  fixedDeltaSeconds?: number;
  rememberedOutcomeLimit?: number;
}

export type ResidentLifeOutcomeReviewObservation =
  | { status: "scheduled"; outcomeEvidenceId: string }
  | { status: "already_scheduled"; outcomeEvidenceId: string };

const DEFAULT_REMEMBERED_OUTCOME_LIMIT = 128;

/**
 * Edge-triggered bridge from an already factual recovered-run outcome into explicit
 * resident semantic pressure.
 *
 * Kernel outcome evidence is already the causal reason. R2 therefore promotes one
 * bounded `activity_completed` pressure tied to that exact evidence instead of
 * moving a quiet-review timer.
 *
 * The bridge does not interpret the outcome, create synthetic evidence or mutate
 * body/World authority.
 */
export class ResidentLifeOutcomeReviewBridge {
  private readonly observedOutcomeEvidenceIds = new Set<string>();
  private readonly observedOutcomeOrder: string[] = [];
  private readonly rememberedOutcomeLimit: number;

  constructor(
    private readonly resident: Pick<ResidentRuntime, "promoteSemanticPressure">,
    options: ResidentLifeOutcomeReviewBridgeOptions = {},
  ) {
    this.rememberedOutcomeLimit = options.rememberedOutcomeLimit ?? DEFAULT_REMEMBERED_OUTCOME_LIMIT;
    if (options.reviewAfterSeconds !== undefined
      && (!Number.isFinite(options.reviewAfterSeconds) || options.reviewAfterSeconds <= 0)) {
      throw new Error("life outcome reviewAfterSeconds must be positive and finite");
    }
    if (options.fixedDeltaSeconds !== undefined
      && (!Number.isFinite(options.fixedDeltaSeconds) || options.fixedDeltaSeconds <= 0)) {
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

    this.resident.promoteSemanticPressure({
      id: deriveSpcIdentifier("reason-life-outcome", outcomeEvidence.id),
      tick,
      kind: "activity_completed",
      salience: 0.65,
      summary: `Factual run outcome requires resident interpretation: ${outcomeEvidence.summary}`,
      evidenceIds: [outcomeEvidence.id],
    });

    return { status: "scheduled", outcomeEvidenceId: outcomeEvidence.id };
  }
}
