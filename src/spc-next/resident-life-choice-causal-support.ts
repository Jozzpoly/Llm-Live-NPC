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
  | "last_outcome";

export interface ResidentLifeChoiceSupportFact {
  evidenceId: string;
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
 * R3 read-only causal-support projection for multi-matter choice.
 *
 * This is not a priority function. It never decides which matter should win.
 * It exposes only already-existing resident-owned causal facts so a later judgement
 * cannot claim that its rationale came from history that did not exist.
 *
 * The first personhood-specific distinction deliberately recognized here is an open
 * social responsibility whose matter origin is exact accepted_social_commitment
 * evidence. That state still lives in the continuity kernel; this projector does not
 * duplicate it into a personality database.
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
      facts: supportFacts(matter),
    }))
    .sort((a, b) => a.matterId.localeCompare(b.matterId));
}

export function allowedChoiceSupportEvidenceIds(
  supports: readonly ResidentLifeChoiceCandidateSupport[],
  matterId: string,
): string[] {
  const candidate = supports.find((entry) => entry.matterId === matterId);
  return candidate
    ? [...new Set(candidate.facts.map((fact) => fact.evidenceId))].sort((a, b) => a.localeCompare(b))
    : [];
}

function supportFacts(matter: ResidentLifeMatterView): ResidentLifeChoiceSupportFact[] {
  const facts: ResidentLifeChoiceSupportFact[] = [];
  const seen = new Set<string>();

  if (matter.originEvidence) {
    addFact(
      facts,
      seen,
      matter.originEvidence,
      matter.status === "active" && matter.originEvidence.kind === "accepted_social_commitment"
        ? "open_social_responsibility"
        : "matter_origin",
    );
  }

  if (matter.semanticEvidence) {
    addFact(facts, seen, matter.semanticEvidence, "current_semantic_context");
  }

  if (matter.lastOutcomeEvidence) {
    addFact(
      facts,
      seen,
      matter.lastOutcomeEvidence,
      matter.lastOutcomeEvidence.summary.startsWith("blocked:")
        ? "blocked_outcome"
        : "last_outcome",
    );
  }

  return facts.sort((a, b) => (
    a.evidenceTick - b.evidenceTick
    || a.evidenceId.localeCompare(b.evidenceId)
    || a.relation.localeCompare(b.relation)
  ));
}

function addFact(
  facts: ResidentLifeChoiceSupportFact[],
  seen: Set<string>,
  evidence: ResidentLifeEvidenceView,
  relation: ResidentLifeChoiceSupportRelation,
): void {
  const identity = `${relation}\u0000${evidence.id}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  facts.push({
    evidenceId: evidence.id,
    evidenceTick: evidence.tick,
    evidenceKind: evidence.kind,
    relation,
    summary: evidence.summary,
  });
}
