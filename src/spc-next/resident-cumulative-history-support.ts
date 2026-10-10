import type {
  ResidentContinuityKernel,
  ResidentMatterHistoricalSupport,
} from "./resident-continuity-kernel";

const MAX_CUMULATIVE_SAME_ACTOR_OUTCOMES = 8;

/**
 * Derive bounded exact factual genealogy for one CURRENT communicate_actor matter.
 *
 * This does not interpret sentiment, trust, preference, relationship state or whether
 * the old interactions were "good" or "bad". It only proves that this resident
 * factually completed/attempted earlier communicate_actor matters with the same exact
 * target actor and retains their terminal task outcomes in its bounded archive.
 */
export function derivePriorSameActorOutcomeSupport(
  kernel: ResidentContinuityKernel,
  targetActorId: string,
): ResidentMatterHistoricalSupport[] {
  if (typeof targetActorId !== "string" || targetActorId.trim().length === 0) {
    throw new Error("same-actor historical support target must be non-empty");
  }

  const matches: Array<{
    tick: number;
    matterId: string;
    evidenceId: string;
  }> = [];

  for (const entry of kernel.terminalOutcomeArchiveSnapshot()) {
    const matter = kernel.matter(entry.matterId);
    if (!matter
      || (matter.status !== "resolved" && matter.status !== "cancelled")
      || matter.activeRunId !== null
      || matter.semanticIntent?.kind !== "communicate_actor"
      || matter.semanticIntent.targetActorId !== targetActorId
      || matter.lastOutcomeEvidenceId !== entry.evidence.id
      || entry.evidence.kind !== "task_outcome") continue;

    matches.push({
      tick: entry.evidence.tick,
      matterId: matter.id,
      evidenceId: entry.evidence.id,
    });
  }

  // Historical support is explicitly bounded. Prefer the most recent exact factual
  // episodes rather than silently making every lifetime interaction prompt-visible.
  const selected = matches
    .sort((left, right) => (
      right.tick - left.tick
      || right.evidenceId.localeCompare(left.evidenceId)
      || right.matterId.localeCompare(left.matterId)
    ))
    .slice(0, MAX_CUMULATIVE_SAME_ACTOR_OUTCOMES)
    .sort((left, right) => (
      left.tick - right.tick
      || left.evidenceId.localeCompare(right.evidenceId)
      || left.matterId.localeCompare(right.matterId)
    ));

  return selected.map((match) => ({
    relation: "prior_same_actor_outcome" as const,
    sourceMatterId: match.matterId,
    evidenceId: match.evidenceId,
  }));
}


/**
 * Derive bounded exact counterparty-caused social genealogy for one CURRENT
 * communicate_actor matter.
 *
 * This recognizes only factual standing-commitment releases already archived by the
 * resident after exact addressed World speech from that same counterparty. It does
 * not infer trust, affinity, preference or a general relationship summary.
 */
export function derivePriorCounterpartySocialOutcomeSupport(
  kernel: ResidentContinuityKernel,
  targetActorId: string,
): ResidentMatterHistoricalSupport[] {
  if (typeof targetActorId !== "string" || targetActorId.trim().length === 0) {
    throw new Error("counterparty social historical support target must be non-empty");
  }

  return kernel.terminalSocialOutcomeArchiveSnapshot()
    .filter((entry) => (
      entry.counterpartyActorId === targetActorId
      && entry.evidence.kind === "resident_released_social_commitment"
    ))
    .sort((left, right) => (
      right.evidence.tick - left.evidence.tick
      || right.evidence.id.localeCompare(left.evidence.id)
      || right.matterId.localeCompare(left.matterId)
    ))
    .slice(0, MAX_CUMULATIVE_SAME_ACTOR_OUTCOMES)
    .sort((left, right) => (
      left.evidence.tick - right.evidence.tick
      || left.evidence.id.localeCompare(right.evidence.id)
      || left.matterId.localeCompare(right.matterId)
    ))
    .map((entry) => ({
      relation: "prior_counterparty_social_outcome" as const,
      sourceMatterId: entry.matterId,
      evidenceId: entry.evidence.id,
    }));
}
