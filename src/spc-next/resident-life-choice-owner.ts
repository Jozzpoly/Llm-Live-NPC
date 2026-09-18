import type { CognitionBatch } from "./contracts";
import {
  composeResidentLifeCognitionContext,
  type ResidentLifeCognitionContext,
} from "./resident-life-cognition-context";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentRuntime, type ResidentCognitionRevision } from "./resident-runtime";

export type ResidentLifeChoiceDecision =
  | {
      kind: "focus_matter";
      matterId: string;
      reason: string;
      reviewAfterSeconds: number;
    }
  | {
      kind: "defer_all";
      reason: string;
      reviewAfterSeconds: number;
    };

export interface ResidentLifeChoiceAttempt {
  readonly id: string;
  readonly residentId: string;
  readonly batch: CognitionBatch;
  readonly context: ResidentLifeCognitionContext;
  readonly candidateMatterIds: readonly string[];
  readonly revision: ResidentCognitionRevision;
  readonly lifeFingerprint: string;
}

export type ResidentLifeChoiceSettlement =
  | { status: "applied"; decision: ResidentLifeChoiceDecision }
  | {
      status: "stale";
      reason: "newer_addressed_attention" | "local_activity_changed_during_request" | "resident_life_changed_during_request";
    }
  | { status: "rejected"; reason: "unknown_attempt" | "proposal_invalid" };

const MIN_REVIEW_SECONDS = 0.25;
const MAX_REVIEW_SECONDS = 600;
const MAX_REASON_LENGTH = 1_200;

/**
 * Bounded higher-cognition authority for the first earned multi-matter question:
 * several already-grounded, still-current resident matters are waiting for the same
 * currently-free coarse body resource.
 *
 * The owner does NOT invent priorities, open matters, execute actions or mutate World.
 * It freezes the exact private resident context + recovered life truth, then admits
 * only a choice among the candidate matter ids that were actually deferred at that
 * boundary (or an explicit decision to defer all). Attention, local-activity or life
 * changes while a provider is thinking make the old answer stale.
 */
export class ResidentLifeChoiceOwner {
  private activeAttempt: ResidentLifeChoiceAttempt | null = null;
  private sequence = 0;

  constructor(private readonly resident: ResidentRuntime) {}

  prepare(batch: CognitionBatch, life: ResidentLifeCognitionView): ResidentLifeChoiceAttempt | null {
    if (this.activeAttempt) return null;
    if (batch.residentId !== this.resident.profile.id) {
      throw new Error("resident life choice batch belongs to another resident");
    }
    if (life.body.focusedRunId !== null) {
      throw new Error("resident life choice requires a free coarse body");
    }

    const candidateMatterIds = candidateMatters(life);
    if (candidateMatterIds.length < 2) {
      throw new Error("resident life choice requires at least two deferred legal matters");
    }
    assertAllDeferredRunsRepresented(life, candidateMatterIds);

    const privateContext = this.resident.cognitionContext(batch);
    const context = composeResidentLifeCognitionContext(privateContext, life);
    const attempt: ResidentLifeChoiceAttempt = {
      id: `resident-life-choice:${batch.residentId}:${batch.requestedAtTick}:${this.sequence++}`,
      residentId: batch.residentId,
      batch: structuredClone(batch),
      context: structuredClone(context),
      candidateMatterIds: [...candidateMatterIds],
      revision: this.resident.cognitionRevision(),
      lifeFingerprint: fingerprintLife(life),
    };
    this.activeAttempt = attempt;
    return attempt;
  }

  abandon(attempt: ResidentLifeChoiceAttempt): boolean {
    if (attempt !== this.activeAttempt) return false;
    this.activeAttempt = null;
    this.resident.requeueCognitionBatch(attempt.batch);
    return true;
  }

  settle(
    attempt: ResidentLifeChoiceAttempt,
    rawProposal: unknown,
    currentLife: ResidentLifeCognitionView,
  ): ResidentLifeChoiceSettlement {
    if (attempt !== this.activeAttempt) return { status: "rejected", reason: "unknown_attempt" };
    this.activeAttempt = null;

    const decision = parseChoice(rawProposal, attempt.candidateMatterIds);
    if (!decision) {
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
      return { status: "stale", reason: "local_activity_changed_during_request" };
    }
    if (fingerprintLife(currentLife) !== attempt.lifeFingerprint) {
      this.resident.requeueCognitionBatch(attempt.batch);
      return { status: "stale", reason: "resident_life_changed_during_request" };
    }

    return { status: "applied", decision };
  }

  state(): { activeAttemptId: string | null } {
    return { activeAttemptId: this.activeAttempt?.id ?? null };
  }
}

function candidateMatters(life: ResidentLifeCognitionView): string[] {
  return life.matters
    .filter((matter) => matter.status === "active"
      && matter.activeRun?.canMutateWorld === true
      && matter.activeRun.bodyState === "deferred")
    .map((matter) => matter.id)
    .sort((a, b) => a.localeCompare(b));
}

function assertAllDeferredRunsRepresented(
  life: ResidentLifeCognitionView,
  candidateMatterIds: readonly string[],
): void {
  const representedRuns = new Set(
    life.matters
      .filter((matter) => candidateMatterIds.includes(matter.id))
      .map((matter) => matter.activeRun?.runId)
      .filter((runId): runId is string => Boolean(runId)),
  );
  for (const runId of life.body.deferredRunIds) {
    if (!representedRuns.has(runId)) {
      throw new Error(`resident life choice scope omitted deferred run: ${runId}`);
    }
  }
  if (representedRuns.size !== life.body.deferredRunIds.length) {
    throw new Error("resident life choice scope contains deferred matter not present in body demand");
  }
}

function parseChoice(
  raw: unknown,
  candidateMatterIds: readonly string[],
): ResidentLifeChoiceDecision | null {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.decision)) return null;
  if (!hasOnlyKeys(raw, ["version", "decision"])) return null;
  const decision = raw.decision;
  const kind = decision.kind;
  const reason = boundedString(decision.reason, MAX_REASON_LENGTH);
  const reviewAfterSeconds = boundedNumber(decision.reviewAfterSeconds, MIN_REVIEW_SECONDS, MAX_REVIEW_SECONDS);
  if (!reason || reviewAfterSeconds === null) return null;

  if (kind === "focus_matter") {
    if (!hasOnlyKeys(decision, ["kind", "matterId", "reason", "reviewAfterSeconds"])) return null;
    if (typeof decision.matterId !== "string" || !candidateMatterIds.includes(decision.matterId)) return null;
    return {
      kind: "focus_matter",
      matterId: decision.matterId,
      reason,
      reviewAfterSeconds,
    };
  }
  if (kind === "defer_all") {
    if (!hasOnlyKeys(decision, ["kind", "reason", "reviewAfterSeconds"])) return null;
    return { kind: "defer_all", reason, reviewAfterSeconds };
  }
  return null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(record).every((key) => allowedSet.has(key));
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}
