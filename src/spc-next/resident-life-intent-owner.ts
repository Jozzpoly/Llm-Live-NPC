import {
  parseResidentCognitionProposal,
  type ResidentCognitionContext,
  type ResidentCognitionProposal,
} from "./cognition-contract";
import type { CognitionBatch } from "./contracts";
import {
  parseResidentLifeIntentProposal,
  type ResidentLifeIntentProposal,
} from "./resident-life-intent-contract";
import {
  composeResidentLifeCognitionContext,
  type ResidentLifeCognitionContext,
} from "./resident-life-cognition-context";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import type { ResidentLifeSelfContext } from "./resident-life-self-context";
import { ResidentRuntime, type ResidentCognitionRevision } from "./resident-runtime";

export interface ResidentLifeIntentAttempt {
  readonly id: string;
  readonly residentId: string;
  readonly batch: CognitionBatch;
  readonly context: ResidentLifeCognitionContext;
  readonly revision: ResidentCognitionRevision;
  readonly lifeFingerprint: string;
}

export type ResidentLifeIntentAdmission<T> =
  | { status: "accepted"; intent: T }
  | { status: "rejected"; detail: string };

export type ResidentLifeSettlement<T, Proposal> =
  | {
      status: "applied";
      proposal: Proposal;
      intent: T;
    }
  | {
      status: "stale";
      reason: "newer_addressed_attention" | "local_activity_changed_during_request" | "resident_life_changed_during_request";
    }
  | {
      status: "rejected";
      reason: "unknown_attempt" | "proposal_invalid" | "intent_rejected";
      detail?: string;
    };

/** Compatibility settlement for the pre-commitment ResidentCognitionProposal path. */
export type ResidentLifeIntentSettlement<T> = ResidentLifeSettlement<T, ResidentCognitionProposal>;

/** Settlement whose semantic decision is independent from current body activity. */
export type ResidentLifeCommitmentSettlement<T> = ResidentLifeSettlement<T, ResidentLifeIntentProposal>;

interface ActiveLifeIntentAttempt {
  attempt: ResidentLifeIntentAttempt;
  parserContext: ResidentCognitionContext;
}

/**
 * Life-aware semantic-intent authority for cognition that occurs while recovered
 * resident matters/runs already exist.
 *
 * Provider-facing input is `resident_life_cognition_v1`: legacy activity is exposed
 * only as `localActivity`, while recovered continuing-matter/body truth is carried in
 * `life`. Both settlement paths validate against the exact same frozen private frame
 * and share one attempt/staleness/admission authority core.
 *
 * `settleCommitmentIntent()` is the resident-life-native boundary: accept/decline/
 * defer/clarify describes whether a new continuing matter should exist and therefore
 * does not imply replacement of the currently focused body run. `settleIntent()` is a
 * temporary compatibility path for existing verticals that still emit the older
 * ResidentCognitionProposal activity vocabulary.
 *
 * This owner deliberately stops before continuity/execution authority. It cannot open
 * a matter, bind a run, choose body focus or mutate World. A caller may accept only a
 * bounded semantic intent after the proposal survives attention, local-activity and
 * recovered-life stale guards.
 */
export class ResidentLifeIntentOwner {
  private active: ActiveLifeIntentAttempt | null = null;
  private sequence = 0;

  constructor(
    private readonly resident: ResidentRuntime,
    private readonly self?: ResidentLifeSelfContext,
  ) {}

  prepare(batch: CognitionBatch, life: ResidentLifeCognitionView): ResidentLifeIntentAttempt | null {
    if (this.active) return null;
    if (batch.residentId !== this.resident.profile.id) {
      throw new Error("resident life intent batch belongs to another resident");
    }

    const parserContext = this.resident.cognitionContext(batch);
    const context = composeResidentLifeCognitionContext(parserContext, life, this.self);
    const attempt: ResidentLifeIntentAttempt = {
      id: `resident-life-intent:${batch.residentId}:${batch.requestedAtTick}:${this.sequence++}`,
      residentId: batch.residentId,
      batch: structuredClone(batch),
      context: structuredClone(context),
      revision: this.resident.cognitionRevision(),
      lifeFingerprint: fingerprintLife(life),
    };
    this.active = {
      attempt,
      parserContext: structuredClone(parserContext),
    };
    return attempt;
  }

  abandon(attempt: ResidentLifeIntentAttempt): boolean {
    if (!this.active || attempt !== this.active.attempt) return false;
    this.active = null;
    this.resident.requeueCognitionBatch(attempt.batch);
    return true;
  }

  /**
   * Resident-life-native settlement. A new commitment can be accepted while another
   * recovered run keeps exact body focus; the admission callback still owns any later
   * transition into continuity/execution state.
   */
  settleCommitmentIntent<T>(
    attempt: ResidentLifeIntentAttempt,
    rawProposal: unknown,
    currentLife: ResidentLifeCognitionView,
    tick: number,
    admit: (
      proposal: ResidentLifeIntentProposal,
      context: ResidentLifeCognitionContext,
    ) => ResidentLifeIntentAdmission<T>,
  ): ResidentLifeCommitmentSettlement<T> {
    return this.settleWithParser(
      attempt,
      rawProposal,
      currentLife,
      tick,
      parseResidentLifeIntentProposal,
      admit,
      commitmentSemanticUpdateProjection,
    );
  }

  /**
   * Compatibility path for existing causal verticals. New life-commitment work should
   * prefer settleCommitmentIntent() so body directives are not overloaded as matter
   * acceptance semantics.
   */
  settleIntent<T>(
    attempt: ResidentLifeIntentAttempt,
    rawProposal: unknown,
    currentLife: ResidentLifeCognitionView,
    tick: number,
    admit: (
      proposal: ResidentCognitionProposal,
      context: ResidentLifeCognitionContext,
    ) => ResidentLifeIntentAdmission<T>,
  ): ResidentLifeIntentSettlement<T> {
    return this.settleWithParser(
      attempt,
      rawProposal,
      currentLife,
      tick,
      parseResidentCognitionProposal,
      admit,
      (proposal) => proposal,
    );
  }

  state(): { activeAttemptId: string | null } {
    return { activeAttemptId: this.active?.attempt.id ?? null };
  }

  private settleWithParser<T, Proposal>(
    attempt: ResidentLifeIntentAttempt,
    rawProposal: unknown,
    currentLife: ResidentLifeCognitionView,
    tick: number,
    parse: (value: unknown, context: ResidentCognitionContext) => Proposal | null,
    admit: (
      proposal: Proposal,
      context: ResidentLifeCognitionContext,
    ) => ResidentLifeIntentAdmission<T>,
    semanticUpdateProjection: (proposal: Proposal) => ResidentCognitionProposal,
  ): ResidentLifeSettlement<T, Proposal> {
    if (!this.active || attempt !== this.active.attempt) {
      return { status: "rejected", reason: "unknown_attempt" };
    }
    const active = this.active;
    this.active = null;

    const proposal = parse(rawProposal, active.parserContext);
    if (!proposal) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "rejected", reason: "proposal_invalid" };
    }

    const revision = this.resident.cognitionRevision();
    if (revision.attention !== attempt.revision.attention) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "stale", reason: "newer_addressed_attention" };
    }
    if (revision.activity !== attempt.revision.activity) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "stale", reason: "local_activity_changed_during_request" };
    }
    if (fingerprintLife(currentLife) !== attempt.lifeFingerprint) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "stale", reason: "resident_life_changed_during_request" };
    }

    const admission = admit(proposal, attempt.context);
    if (admission.status === "rejected") {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "rejected", reason: "intent_rejected", detail: admission.detail };
    }

    // ResidentMind currently accepts the older proposal envelope even though it only
    // consumes beliefs/concerns. The projection below is semantic-update plumbing only;
    // this owner never applies its activityDirective to ResidentRuntime activity.
    this.resident.applySemanticUpdates(
      semanticUpdateProjection(proposal),
      tick,
      active.parserContext.recentPercepts,
    );
    return {
      status: "applied",
      proposal,
      intent: admission.intent,
    };
  }
}

function commitmentSemanticUpdateProjection(
  proposal: ResidentLifeIntentProposal,
): ResidentCognitionProposal {
  return {
    version: 1,
    activityDirective: {
      kind: "keep",
      reason: `life commitment semantic updates: ${proposal.commitmentDecision.reason}`,
    },
    beliefs: structuredClone(proposal.beliefs),
    concerns: structuredClone(proposal.concerns),
    reviewAfterSeconds: proposal.reviewAfterSeconds,
  };
}

function fingerprintLife(life: ResidentLifeCognitionView): string {
  return JSON.stringify(sortValue(life));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortValue(record[key])]));
}
