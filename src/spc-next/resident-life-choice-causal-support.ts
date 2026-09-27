import type {
  ResidentLifeCognitionView,
  ResidentLifeEvidenceView,
  ResidentLifeMatterView,
} from "./resident-life-cognition-view";

export type ResidentLifeChoiceSupportRelation =
  | "open_social_responsibility"
  | "matter_origin"
  | "current_semantic_context"
  | "blocked_outcome"
  | "last_outcome"
  | "prior_same_material_outcome"
  | "prior_same_actor_outcome";

export interface ResidentLifeChoiceSupportFact {
  evidenceId: string;
  /** Exact terminal matter provenance when support is pinned to one current matter. */
  sourceMatterId?: string;
  evidenceTick: number;
  evidenceKind: string;
  relation: ResidentLifeChoiceSupportRelation;
  summary: string;
}

export interface ResidentLifeChoiceCandidateSupport {
  matterId: string;
  facts: readonly ResidentLifeChoiceSupportFact[];
}

/**
 * Read-only causal-support projection for multi-matter choice.
 *
 * This is not a priority function. It never decides which matter should win.
 * It exposes only already-existing resident-owned causal facts so a later judgement
 * cannot claim that its rationale came from history that did not exist.
 *
 * The first personhood-specific distinction recognized here is an open social
 * responsibility whose matter origin is exact accepted_social_commitment evidence.
 *
 * R6 additionally earns narrow typed post-terminal relations:
 * - exact same-material factual outcome;
 * - exact same-actor communication factual outcome.
 *
 * These are candidate genealogy, not priority or relationship scores. Old matters
 * remain terminal and gain no run/body/execution authority.
 */
export function deriveResidentLifeChoiceCandidateSupports(
  life: ResidentLifeCognitionView,
  candidateMatterIds: readonly string[],
): ResidentLifeChoiceCandidateSupport[] {
  const candidates = new Set(candidateMatterIds);
  return life.matters
    .filter((matter) => candidates.has(matter.id))
    .map((matter) => ({
      matterId: matter.id,
      facts: supportFacts(matter, life),
    }))
    .sort((a, b) => a.matterId.localeCompare(b.matterId));
}

export function allowedChoiceSupportEvidenceIds(
  supports: readonly ResidentLifeChoiceCandidateSupport[],
  matterId: string,
): string[] {
  const candidate = supports.find((entry) => entry.matterId === matterId);
  if (!candidate) return [];

  // Most evidence remains candidate-local: choosing B cannot cite A's ordinary
  // origin/current context. The earned R6 exception is typed comparative terminal
  // history. A factual prior same-material or same-actor outcome attached to candidate
  // A may causally explain choosing A *or avoiding A in favour of another current
  // candidate*, while candidateSupports still preserves where that history belongs.
  const allowed = new Set(candidate.facts.map((fact) => fact.evidenceId));
  for (const support of supports) {
    for (const fact of support.facts) {
      if (fact.relation === "prior_same_material_outcome"
        || fact.relation === "prior_same_actor_outcome") {
        allowed.add(fact.evidenceId);
      }
    }
  }
  return [...allowed].sort((a, b) => a.localeCompare(b));
}

function supportFacts(
  matter: ResidentLifeMatterView,
  life: ResidentLifeCognitionView,
): ResidentLifeChoiceSupportFact[] {
  const facts: ResidentLifeChoiceSupportFact[] = [];
  const seenEvidenceIds = new Set<string>();

  if (matter.originEvidence) {
    addFact(
      facts,
      seenEvidenceIds,
      matter.originEvidence,
      (matter.status === "active" || matter.status === "suspended")
        && matter.originEvidence.kind === "accepted_social_commitment"
        ? "open_social_responsibility"
        : "matter_origin",
    );
  }

  if (matter.semanticEvidence) {
    addFact(facts, seenEvidenceIds, matter.semanticEvidence, "current_semantic_context");
  }

  if (matter.lastOutcomeEvidence) {
    addFact(
      facts,
      seenEvidenceIds,
      matter.lastOutcomeEvidence,
      matter.lastOutcomeEvidence.summary.startsWith("blocked:")
        ? "blocked_outcome"
        : "last_outcome",
    );
  }

  addPinnedHistoricalSupportFacts(facts, seenEvidenceIds, matter);
  addPriorSameMaterialOutcomeFacts(facts, seenEvidenceIds, matter, life);

  return facts.sort((a, b) => (
    a.evidenceTick - b.evidenceTick
    || a.evidenceId.localeCompare(b.evidenceId)
    || a.relation.localeCompare(b.relation)
  ));
}

function addPinnedHistoricalSupportFacts(
  facts: ResidentLifeChoiceSupportFact[],
  seenEvidenceIds: Set<string>,
  candidate: ResidentLifeMatterView,
): void {
  for (const support of candidate.historicalSupport ?? []) {
    if (support.evidence.kind !== "task_outcome") continue;

    if (support.relation === "prior_same_material_outcome"
      && candidate.semanticIntent?.kind === "acquire_material_object") {
      addFact(
        facts,
        seenEvidenceIds,
        support.evidence,
        "prior_same_material_outcome",
        support.sourceMatterId,
      );
      continue;
    }

    if (support.relation === "prior_same_actor_outcome"
      && candidate.semanticIntent?.kind === "communicate_actor") {
      addFact(
        facts,
        seenEvidenceIds,
        support.evidence,
        "prior_same_actor_outcome",
        support.sourceMatterId,
      );
    }
  }
}

function addPriorSameMaterialOutcomeFacts(
  facts: ResidentLifeChoiceSupportFact[],
  seenEvidenceIds: Set<string>,
  candidate: ResidentLifeMatterView,
  life: ResidentLifeCognitionView,
): void {
  if (candidate.semanticIntent?.kind !== "acquire_material_object") return;
  const objectId = candidate.semanticIntent.objectId;

  for (const prior of life.matters) {
    if (prior.id === candidate.id) continue;
    if (prior.status !== "resolved" && prior.status !== "cancelled") continue;
    if (prior.activeRun !== null) continue;
    if (prior.semanticIntent?.kind !== "acquire_material_object") continue;
    if (prior.semanticIntent.objectId !== objectId) continue;
    if (!prior.lastOutcomeEvidence || prior.lastOutcomeEvidence.kind !== "task_outcome") continue;

    addFact(
      facts,
      seenEvidenceIds,
      prior.lastOutcomeEvidence,
      "prior_same_material_outcome",
    );
  }
}

function addFact(
  facts: ResidentLifeChoiceSupportFact[],
  seenEvidenceIds: Set<string>,
  evidence: ResidentLifeEvidenceView,
  relation: ResidentLifeChoiceSupportRelation,
  sourceMatterId?: string,
): void {
  if (seenEvidenceIds.has(evidence.id)) return;
  seenEvidenceIds.add(evidence.id);
  facts.push({
    evidenceId: evidence.id,
    ...(sourceMatterId ? { sourceMatterId } : {}),
    evidenceTick: evidence.tick,
    evidenceKind: evidence.kind,
    relation,
    summary: evidence.summary,
  });
}
