import { deriveSpcIdentifier } from "./identity-contract";
import type { ResidentRuntime } from "./resident-runtime";
import type { ResidentExecutionArbitration } from "./resident-execution-arbitrator";

export interface ResidentLifeChoiceReviewBridgeOptions {
  /** Historical compatibility only; R2 no longer manufactures quiet-review pressure from this delay. */
  reviewAfterSeconds?: number;
  /** Historical compatibility only; R2 no longer manufactures quiet-review pressure from this cadence. */
  fixedDeltaSeconds?: number;
}

export type ResidentLifeChoiceReviewObservation =
  | { status: "scheduled"; candidateRunIds: readonly string[] }
  | { status: "already_scheduled"; candidateRunIds: readonly string[] }
  | { status: "not_required" };

/**
 * Edge-triggered bridge from policy-free body arbitration to explicit semantic
 * pressure.
 *
 * A real `choice_required` boundary is itself the reason cognition may be needed.
 * R2 therefore records one inspectable `uncertainty` reason instead of moving a
 * quiet-review timer and hoping passage of time later fabricates a reason.
 *
 * Re-observing the same unresolved candidate set does not duplicate pressure.
 * A changed candidate set supersedes the same resident-scoped ambiguity reason instead
 * of creating a second event that could later resurrect obsolete B/C truth.
 * The bridge never ranks candidates, opens/closes a matter, binds a run or mutates World.
 */
export class ResidentLifeChoiceReviewBridge {
  private activeAmbiguitySignature: string | null = null;

  constructor(
    private readonly resident: Pick<
      ResidentRuntime,
      "profile" | "promoteSemanticPressure" | "invalidateSemanticPressure"
    >,
    options: ResidentLifeChoiceReviewBridgeOptions = {},
  ) {
    if (options.reviewAfterSeconds !== undefined
      && (!Number.isFinite(options.reviewAfterSeconds) || options.reviewAfterSeconds <= 0)) {
      throw new Error("life choice reviewAfterSeconds must be positive and finite");
    }
    if (options.fixedDeltaSeconds !== undefined
      && (!Number.isFinite(options.fixedDeltaSeconds) || options.fixedDeltaSeconds <= 0)) {
      throw new Error("life choice fixedDeltaSeconds must be positive and finite");
    }
  }

  observe(arbitration: ResidentExecutionArbitration, tick: number): ResidentLifeChoiceReviewObservation {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new Error("life choice observation tick must be a non-negative integer");
    }

    if (arbitration.status !== "choice_required") {
      if (this.activeAmbiguitySignature !== null) {
        this.resident.invalidateSemanticPressure(
          this.reasonId(),
          tick,
          "resident execution no longer requires a multi-matter semantic choice",
        );
      }
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
    this.resident.promoteSemanticPressure({
      id: this.reasonId(),
      tick,
      kind: "uncertainty",
      salience: 0.8,
      summary: `Resident execution requires a semantic choice among ${candidateRunIds.join(", ")}.`,
      evidenceIds: candidateRunIds,
    });
    return { status: "scheduled", candidateRunIds };
  }

  activeCandidateRunIds(): string[] {
    return this.activeAmbiguitySignature === null
      ? []
      : this.activeAmbiguitySignature.split("\u0000");
  }

  private reasonId(): string {
    return deriveSpcIdentifier(
      "reason-life-choice",
      this.resident.profile.id,
    );
  }
}
