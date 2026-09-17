import {
  parseResidentCognitionProposal,
  type ResidentCognitionContext,
  type ResidentCognitionProposal,
} from "./cognition-contract";
import type { CognitionBatch } from "./contracts";
import {
  composeResidentLifeCognitionContext,
  type ResidentLifeCognitionContext,
} from "./resident-life-cognition-context";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
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

export type ResidentLifeIntentSettlement<T> =
  | {
      status: "applied";
      proposal: ResidentCognitionProposal;
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
 * `life`. Internally the existing strict ResidentCognitionProposal parser still uses
 * the exact frozen private evidence/knowledge projection from the same batch.
 *
 * This owner deliberately stops before continuity/execution authority. It cannot open
 * a matter, bind a run, choose body focus or mutate World. A caller may accept only a
 * bounded semantic intent after the proposal survives attention, local-activity and
 * recovered-life stale guards.
 */
export class ResidentLifeIntentOwner {
  private active: ActiveLifeIntentAttempt | null = null;
  private sequence = 0;

  constructor(private readonly resident: ResidentRuntime) {}

  prepare(batch: CognitionBatch, life: ResidentLifeCognitionView): ResidentLifeIntentAttempt | null {
    if (this.active) return null;
    if (batch.residentId !== this.resident.profile.id) {
      throw new Error("resident life intent batch belongs to another resident");
    }

    const parserContext = this.resident.cognitionContext(batch);
    const context = composeResidentLifeCognitionContext(parserContext, life);
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
    if (!this.active || attempt !== this.active.attempt) {
      return { status: "rejected", reason: "unknown_attempt" };
    }
    const active = this.active;
    this.active = null;

    const proposal = parseResidentCognitionProposal(rawProposal, active.parserContext);
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

    this.resident.applySemanticUpdates(proposal, tick, active.parserContext.recentPercepts);
    return {
      status: "applied",
      proposal,
      intent: admission.intent,
    };
  }

  state(): { activeAttemptId: string | null } {
    return { activeAttemptId: this.active?.attempt.id ?? null };
  }
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
