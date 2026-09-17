import type { ResidentRuntime } from "./resident-runtime";
import type { ResidentExecutionArbitration } from "./resident-execution-arbitrator";

export interface ResidentLifeChoiceReviewBridgeOptions {
  reviewAfterSeconds?: number;
  fixedDeltaSeconds?: number;
}

export type ResidentLifeChoiceReviewObservation =
  | { status: "scheduled"; candidateRunIds: readonly string[] }
  | { status: "already_scheduled"; candidateRunIds: readonly string[] }
  | { status: "not_required" };

const DEFAULT_REVIEW_AFTER_SECONDS = 0.25;
const DEFAULT_FIXED_DELTA_SECONDS = 1 / 60;

/**
 * Edge-triggered bridge from policy-free body arbitration to existing cognition cadence.
 *
 * The arbitrator deliberately stops at `choice_required`; it must not rank unrelated
 * matters or know about model scheduling. This bridge adds only cognition pressure:
 * a newly observed ambiguity moves the resident's existing quiet-review deadline near
 * term. Re-observing the same unresolved candidate set does NOT move that deadline,
 * preventing an every-tick observer from starving cognition forever.
 *
 * It never chooses a candidate, opens/closes a matter, binds a run, or mutates World.
 */
export class ResidentLifeChoiceReviewBridge {
  private activeAmbiguitySignature: string | null = null;
  private readonly reviewAfterSeconds: number;
  private readonly fixedDeltaSeconds: number;

  constructor(
    private readonly resident: Pick<ResidentRuntime, "scheduleAdaptiveReview">,
    options: ResidentLifeChoiceReviewBridgeOptions = {},
  ) {
    this.reviewAfterSeconds = options.reviewAfterSeconds ?? DEFAULT_REVIEW_AFTER_SECONDS;
    this.fixedDeltaSeconds = options.fixedDeltaSeconds ?? DEFAULT_FIXED_DELTA_SECONDS;
    if (!Number.isFinite(this.reviewAfterSeconds) || this.reviewAfterSeconds <= 0) {
      throw new Error("life choice reviewAfterSeconds must be positive and finite");
    }
    if (!Number.isFinite(this.fixedDeltaSeconds) || this.fixedDeltaSeconds <= 0) {
      throw new Error("life choice fixedDeltaSeconds must be positive and finite");
    }
  }

  observe(arbitration: ResidentExecutionArbitration, tick: number): ResidentLifeChoiceReviewObservation {
    if (!Number.isInteger(tick) || tick < 0) throw new Error("life choice observation tick must be a non-negative integer");

    if (arbitration.status !== "choice_required") {
      this.activeAmbiguitySignature = null;
      return { status: "not_required" };
    }

    const candidateRunIds = [...arbitration.candidateRunIds].sort((a, b) => a.localeCompare(b));
    if (candidateRunIds.length < 2 || new Set(candidateRunIds).size !== candidateRunIds.length) {
      throw new Error("life choice review requires at least two distinct candidate runs");
    }
    const signature = candidateRunIds.join("\u0000");
    if (signature === this.activeAmbiguitySignature) {
      return { status: "already_scheduled", candidateRunIds };
    }

    this.activeAmbiguitySignature = signature;
    this.resident.scheduleAdaptiveReview(tick, this.reviewAfterSeconds, this.fixedDeltaSeconds);
    return { status: "scheduled", candidateRunIds };
  }

  activeCandidateRunIds(): string[] {
    return this.activeAmbiguitySignature === null
      ? []
      : this.activeAmbiguitySignature.split("\u0000");
  }
}
