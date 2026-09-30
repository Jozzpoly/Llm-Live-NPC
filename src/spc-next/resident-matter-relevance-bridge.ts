import { deriveSpcIdentifier } from "./identity-contract";
import type { ResidentPercept } from "./contracts";
import type {
  ResidentLifeCognitionView,
  ResidentLifeMatterView,
} from "./resident-life-cognition-view";
import type { ResidentRuntime } from "./resident-runtime";

export type ResidentMatterRelevanceObservation =
  | {
      status: "promoted";
      matterId: string;
      reasonId: string;
      evidenceId: string;
    }
  | {
      status: "not_relevant";
      evidenceId: string;
    };

export interface ResidentMatterRelevanceReconciliation {
  invalidatedReasonIds: readonly string[];
}

type ActorMatterRelevanceKind =
  | "blocked_actor_matter"
  | "standing_social_commitment";

interface ActorMatterRelevanceMatch {
  matter: ResidentLifeMatterView;
  actorId: string;
  kind: ActorMatterRelevanceKind;
}

interface ActiveMatterRelevance {
  reasonId: string;
  actorId: string;
  kind: ActorMatterRelevanceKind;
}

/**
 * Resident-relative relevance seam grounded only in already-existing private
 * continuity.
 *
 * Raw actor sight remains observation-only. A sight-enter becomes semantic pressure
 * only when one exact open resident matter makes contact with that actor consequential:
 *
 * - an existing communicate_actor matter whose factual run was blocked on contact; or
 * - a standing social commitment previously created from this resident's own factual
 *   speech act.
 *
 * This bridge never invents a responsibility, ranks competing matters or executes
 * anything. If several open matters could independently make the same actor relevant,
 * it refuses to choose which one owns the significance.
 */
export class ResidentMatterRelevanceBridge {
  private readonly activeReasonByMatterId = new Map<string, ActiveMatterRelevance>();

  constructor(
    private readonly resident: Pick<
      ResidentRuntime,
      "profile" | "promoteSemanticPressure" | "invalidateSemanticPressure"
    >,
  ) {}

  observe(
    percept: ResidentPercept,
    life: ResidentLifeCognitionView,
  ): ResidentMatterRelevanceObservation {
    if (percept.phenomenon !== "actor_sight_enter" || percept.actorId === null) {
      return { status: "not_relevant", evidenceId: percept.id };
    }

    const match = matchingActorMatter(life, percept.actorId);
    if (!match) return { status: "not_relevant", evidenceId: percept.id };

    const reasonId = deriveSpcIdentifier(
      "reason-matter-relevance",
      `${this.resident.profile.id}:${match.matter.id}`,
    );
    this.activeReasonByMatterId.set(match.matter.id, {
      reasonId,
      actorId: match.actorId,
      kind: match.kind,
    });
    this.resident.promoteSemanticPressure({
      id: reasonId,
      tick: percept.tick,
      kind: "uncertainty",
      salience: 0.8,
      summary: relevanceSummary(match),
      evidenceIds: relevanceEvidenceIds(percept, match),
    });

    return {
      status: "promoted",
      matterId: match.matter.id,
      reasonId,
      evidenceId: percept.id,
    };
  }

  /**
   * Reconcile previously promoted matter-relative significance against current life.
   *
   * Terminalization, release, semantic relation change or disappearance of the exact
   * actor relation settles the pressure locally. ResidentRuntime tombstones prevent an
   * older in-flight batch from resurrecting that causal version.
   */
  reconcile(
    life: ResidentLifeCognitionView,
    tick: number,
  ): ResidentMatterRelevanceReconciliation {
    const invalidatedReasonIds: string[] = [];

    for (const [matterId, active] of [...this.activeReasonByMatterId.entries()]) {
      const matter = life.matters.find((candidate) => candidate.id === matterId) ?? null;
      if (matter && matterStillSupportsActorRelevance(matter, active)) continue;

      if (this.resident.invalidateSemanticPressure(
        active.reasonId,
        tick,
        `matter-relative relevance ended because ${matterId} no longer carries its exact open actor relation`,
      )) {
        invalidatedReasonIds.push(active.reasonId);
      }
      this.activeReasonByMatterId.delete(matterId);
    }

    return { invalidatedReasonIds };
  }

  activeMatterIds(): string[] {
    return [...this.activeReasonByMatterId.keys()].sort((a, b) => a.localeCompare(b));
  }
}

function matchingActorMatter(
  life: ResidentLifeCognitionView,
  actorId: string,
): ActorMatterRelevanceMatch | null {
  const matches = life.matters
    .flatMap((matter): ActorMatterRelevanceMatch[] => {
      if (isBlockedActorMatterFor(matter, actorId)) {
        return [{ matter, actorId, kind: "blocked_actor_matter" }];
      }
      if (isStandingSocialCommitmentFor(matter, actorId)) {
        return [{ matter, actorId, kind: "standing_social_commitment" }];
      }
      return [];
    })
    .sort((left, right) => left.matter.id.localeCompare(right.matter.id));

  // Several distinct resident-owned reasons to care about the same actor are a real
  // ambiguity. This narrow bridge must not silently pick one and fabricate priority.
  return matches.length === 1 ? matches[0]! : null;
}

function matterStillSupportsActorRelevance(
  matter: ResidentLifeMatterView,
  active: ActiveMatterRelevance,
): boolean {
  return active.kind === "blocked_actor_matter"
    ? isBlockedActorMatterFor(matter, active.actorId)
    : isStandingSocialCommitmentFor(matter, active.actorId);
}

function isBlockedActorMatterFor(
  matter: ResidentLifeMatterView,
  actorId: string,
): boolean {
  return isBlockedActorMatter(matter)
    && matter.semanticIntent?.kind === "communicate_actor"
    && matter.semanticIntent.targetActorId === actorId;
}

function isStandingSocialCommitmentFor(
  matter: ResidentLifeMatterView,
  actorId: string,
): boolean {
  return matter.status === "active"
    && matter.activeRun === null
    && matter.semanticIntent?.kind === "standing_social_commitment"
    && matter.semanticIntent.counterpartyActorId === actorId;
}

function relevanceSummary(match: ActorMatterRelevanceMatch): string {
  return match.kind === "standing_social_commitment"
    ? `New private contact with ${match.actorId} is relevant to open standing social commitment ${match.matter.id}.`
    : `New private contact with ${match.actorId} is relevant to open matter ${match.matter.id} after its blocked outcome.`;
}

function relevanceEvidenceIds(
  percept: ResidentPercept,
  match: ActorMatterRelevanceMatch,
): string[] {
  if (match.kind === "standing_social_commitment") {
    return [
      percept.id,
      match.matter.id,
      ...(match.matter.originEvidence ? [match.matter.originEvidence.id] : []),
    ];
  }
  return [
    percept.id,
    match.matter.id,
    ...(match.matter.lastOutcomeEvidence ? [match.matter.lastOutcomeEvidence.id] : []),
  ];
}

function isBlockedActorMatter(matter: ResidentLifeMatterView): boolean {
  return matter.status === "active"
    && matter.activeRun === null
    && matter.semanticIntent?.kind === "communicate_actor"
    && matter.lastOutcomeEvidence?.kind === "task_outcome"
    && matter.lastOutcomeEvidence.summary.startsWith("blocked:");
}
