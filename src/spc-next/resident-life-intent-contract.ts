import {
  parseResidentCognitionProposal,
  type BeliefUpdate,
  type ConcernUpdate,
  type ProposedActivity,
  type ResidentCognitionContext,
} from "./cognition-contract";
import type { ResidentStandingSocialCommitmentDescriptor } from "./resident-continuity-kernel";

export type ResidentLifeCommitmentDecision =
  | {
      kind: "accept";
      reason: string;
      intent: ProposedActivity;
      /**
       * Explicit future social meaning attached to this accepted communication.
       * Absence means ordinary communication; speech text alone never implies it.
       */
      standingSocialCommitment?: ResidentStandingSocialCommitmentDescriptor;
    }
  | { kind: "decline"; reason: string }
  | { kind: "defer"; reason: string }
  | { kind: "clarify"; reason: string; question: string };

export interface ResidentLifeIntentProposal {
  version: 1;
  commitmentDecision: ResidentLifeCommitmentDecision;
  beliefs: readonly BeliefUpdate[];
  concerns: readonly ConcernUpdate[];
  reviewAfterSeconds: number;
}

const TOP_LEVEL_KEYS = [
  "version",
  "commitmentDecision",
  "beliefs",
  "concerns",
  "reviewAfterSeconds",
] as const;
const INTENT_KEYS = [
  "kind",
  "goal",
  "targetActorId",
  "targetRegionId",
  "targetPosition",
  "text",
] as const;

/**
 * Strict semantic contract for higher cognition deciding whether a newly perceived
 * pressure should become a continuing resident commitment.
 *
 * This deliberately does not describe the current body activity. An accepted intent
 * may later become a deferred matter while another exact run keeps body authority.
 * Existing cognition parsing remains the epistemic validator for proposed activities,
 * beliefs and concerns so this contract cannot invent a second known-world policy.
 */
export function parseResidentLifeIntentProposal(
  value: unknown,
  context: ResidentCognitionContext,
): ResidentLifeIntentProposal | null {
  if (!isRecord(value) || !hasExactKeys(value, TOP_LEVEL_KEYS) || value.version !== 1) return null;
  if (!isRecord(value.commitmentDecision)) return null;

  const decision = value.commitmentDecision;
  if (!isBoundedString(decision.kind, 32) || !isBoundedString(decision.reason, 1_200)) return null;

  if (decision.kind === "accept") {
    const hasStandingSocialCommitment = Object.hasOwn(
      decision,
      "standingSocialCommitment",
    );
    const acceptKeys = hasStandingSocialCommitment
      ? ["kind", "reason", "intent", "standingSocialCommitment"] as const
      : ["kind", "reason", "intent"] as const;
    if (!hasExactKeys(decision, acceptKeys) || !isRecord(decision.intent)) return null;
    if (!hasExactKeys(decision.intent, INTENT_KEYS)) return null;

    const validated = parseResidentCognitionProposal({
      version: 1,
      activityDirective: {
        kind: "replace",
        reason: decision.reason,
        activity: decision.intent,
      },
      beliefs: value.beliefs,
      concerns: value.concerns,
      reviewAfterSeconds: value.reviewAfterSeconds,
    }, context);
    if (!validated || validated.activityDirective.kind !== "replace") return null;

    let standingSocialCommitment: ResidentStandingSocialCommitmentDescriptor | undefined;
    if (hasStandingSocialCommitment) {
      const rawStanding = decision.standingSocialCommitment;
      if (!isRecord(rawStanding)
        || !hasExactKeys(rawStanding, ["goal"])
        || !isBoundedString(rawStanding.goal, 1_200)
        || validated.activityDirective.activity.kind !== "communicate"
        || validated.activityDirective.activity.targetActorId === null
        || validated.activityDirective.activity.text === null) {
        return null;
      }
      standingSocialCommitment = {
        goal: rawStanding.goal,
      };
    }

    return {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: validated.activityDirective.reason,
        intent: structuredClone(validated.activityDirective.activity),
        ...(standingSocialCommitment
          ? { standingSocialCommitment: structuredClone(standingSocialCommitment) }
          : {}),
      },
      beliefs: structuredClone(validated.beliefs),
      concerns: structuredClone(validated.concerns),
      reviewAfterSeconds: validated.reviewAfterSeconds,
    };
  }

  if (decision.kind === "decline" || decision.kind === "defer") {
    if (!hasExactKeys(decision, ["kind", "reason"])) return null;
    const validated = validateSemanticUpdatesOnly(value, context, decision.reason);
    if (!validated) return null;
    return {
      version: 1,
      commitmentDecision: { kind: decision.kind, reason: decision.reason },
      beliefs: structuredClone(validated.beliefs),
      concerns: structuredClone(validated.concerns),
      reviewAfterSeconds: validated.reviewAfterSeconds,
    };
  }

  if (decision.kind === "clarify") {
    if (!hasExactKeys(decision, ["kind", "reason", "question"])
      || !isBoundedString(decision.question, 1_200)) return null;
    const validated = validateSemanticUpdatesOnly(value, context, decision.reason);
    if (!validated) return null;
    return {
      version: 1,
      commitmentDecision: {
        kind: "clarify",
        reason: decision.reason,
        question: decision.question,
      },
      beliefs: structuredClone(validated.beliefs),
      concerns: structuredClone(validated.concerns),
      reviewAfterSeconds: validated.reviewAfterSeconds,
    };
  }

  return null;
}

function validateSemanticUpdatesOnly(
  value: Record<string, unknown>,
  context: ResidentCognitionContext,
  reason: string,
) {
  return parseResidentCognitionProposal({
    version: 1,
    activityDirective: { kind: "keep", reason },
    beliefs: value.beliefs,
    concerns: value.concerns,
    reviewAfterSeconds: value.reviewAfterSeconds,
  }, context);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
