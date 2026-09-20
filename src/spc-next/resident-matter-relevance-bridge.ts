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

/**
 * R3 first resident-relative relevance seam.
 *
 * This bridge does not invent personality, rank matters or execute anything. It asks
 * one deliberately narrow causal question:
 *
 *   does this new private actor observation change the situation of an already-open
 *   resident matter that was factually blocked on that exact actor?
 *
 * The meaningful difference comes from resident-owned matter history. Raw sight stays
 * R2 observation-only; only the existing obligation + blocked outcome can promote it.
 */
export class ResidentMatterRelevanceBridge {
  private readonly activeReasonByMatterId = new Map<string, string>();

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

    const matter = matchingBlockedActorMatter(life, percept.actorId);
    if (!matter) return { status: "not_relevant", evidenceId: percept.id };

    const reasonId = deriveSpcIdentifier(
      "reason-matter-relevance",
      `${this.resident.profile.id}:${matter.id}`,
    );
    this.activeReasonByMatterId.set(matter.id, reasonId);
    this.resident.promoteSemanticPressure({
      id: reasonId,
      tick: percept.tick,
      kind: "uncertainty",
      salience: 0.8,
      summary:
        `New private contact with ${percept.actorId} is relevant to open matter ${matter.id} after its blocked outcome.`,
      evidenceIds: [
        percept.id,
        matter.id,
        ...(matter.lastOutcomeEvidence ? [matter.lastOutcomeEvidence.id] : []),
      ],
    });

    return {
      status: "promoted",
      matterId: matter.id,
      reasonId,
      evidenceId: percept.id,
    };
  }

  /**
   * Reconcile previously promoted matter-relative significance against current life.
   *
   * If the matter is terminal, has resumed execution, lost the actor relation or no
   * longer carries the blocked outcome that justified review, the pressure is settled
   * locally. ResidentRuntime tombstones prevent any older in-flight batch from
   * resurrecting that causal version.
   */
  reconcile(
    life: ResidentLifeCognitionView,
    tick: number,
  ): ResidentMatterRelevanceReconciliation {
    const invalidatedReasonIds: string[] = [];

    for (const [matterId, reasonId] of [...this.activeReasonByMatterId.entries()]) {
      const matter = life.matters.find((candidate) => candidate.id === matterId) ?? null;
      if (matter && isBlockedActorMatter(matter)) continue;

      if (this.resident.invalidateSemanticPressure(
        reasonId,
        tick,
        `matter-relative relevance ended because ${matterId} is no longer an open blocked actor obligation`,
      )) {
        invalidatedReasonIds.push(reasonId);
      }
      this.activeReasonByMatterId.delete(matterId);
    }

    return { invalidatedReasonIds };
  }

  activeMatterIds(): string[] {
    return [...this.activeReasonByMatterId.keys()].sort((a, b) => a.localeCompare(b));
  }
}

function matchingBlockedActorMatter(
  life: ResidentLifeCognitionView,
  actorId: string,
): ResidentLifeMatterView | null {
  const matches = life.matters
    .filter((matter) => (
      isBlockedActorMatter(matter)
      && matter.semanticIntent?.kind === "communicate_actor"
      && matter.semanticIntent.targetActorId === actorId
    ))
    .sort((a, b) => a.id.localeCompare(b.id));

  // If several different open obligations target the same actor, do not silently
  // choose which one gives the observation meaning. That ambiguity belongs to a later
  // personhood/choice layer rather than this narrow relevance seam.
  return matches.length === 1 ? matches[0]! : null;
}

function isBlockedActorMatter(matter: ResidentLifeMatterView): boolean {
  return matter.status === "active"
    && matter.activeRun === null
    && matter.semanticIntent?.kind === "communicate_actor"
    && matter.lastOutcomeEvidence?.kind === "task_outcome"
    && matter.lastOutcomeEvidence.summary.startsWith("blocked:");
}
