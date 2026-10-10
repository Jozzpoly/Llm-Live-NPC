import { deriveSpcIdentifier } from "./identity-contract";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import type { ResidentRuntime } from "./resident-runtime";

export interface ResidentTemporalStandingObservation {
  status: "promoted";
  matterId: string;
  reasonId: string;
  declaredWorldTick: number;
}

/**
 * Opt-in research seam, NOT a periodic NPC heartbeat.
 * One already-owned standing matter may have ONE explicitly declared revisit
 * instant after its exact factual speech. World tick makes that earlier choice
 * newly relevant, not a new goal, duty or automatic body command.
 */
export class ResidentTemporalStandingRelevance {
  private readonly issued = new Map<string, string>();

  constructor(
    private readonly resident: Pick<
      ResidentRuntime, "profile" | "promoteSemanticPressure" | "invalidateSemanticPressure"
    >,
  ) {}

  observe(life: ResidentLifeCognitionView, worldTick: number): ResidentTemporalStandingObservation[] {
    if (!Number.isSafeInteger(worldTick) || worldTick < 0) {
      throw new Error("temporal standing requires a factual nonnegative World tick");
    }
    const emitted: ResidentTemporalStandingObservation[] = [];
    for (const matter of life.matters) {
      const intent = matter.semanticIntent;
      if (matter.status !== "active" || matter.activeRun !== null
        || intent?.kind !== "standing_social_commitment"
        || intent.revisitAtWorldTick === undefined
        || intent.revisitAtWorldTick > worldTick
        || this.issued.has(matter.id)
        || matter.originEvidence?.kind !== "resident_originated_social_commitment") continue;

      const reasonId = deriveSpcIdentifier(
        "reason-standing-revisit", `${this.resident.profile.id}:${matter.id}`,
      );
      this.resident.promoteSemanticPressure({
        id: reasonId,
        tick: worldTick,
        kind: "uncertainty",
        salience: 0.65,
        summary: `The explicitly declared revisit moment arrived for my existing standing matter ${matter.id}; whether to do anything is unresolved.`,
        evidenceIds: [matter.id, matter.originEvidence.id],
      });
      this.issued.set(matter.id, reasonId);
      emitted.push({
        status: "promoted", matterId: matter.id,
        reasonId, declaredWorldTick: intent.revisitAtWorldTick,
      });
    }

    // A resolved or released personal matter cannot keep a stale unattended
    // prompt pending, nor be restarted by more ticks without new lived history.
    for (const [matterId, reasonId] of [...this.issued]) {
      const current = life.matters.find(m => m.id === matterId);
      if (current?.status === "active"
        && current.semanticIntent?.kind === "standing_social_commitment") continue;
      this.resident.invalidateSemanticPressure(
        reasonId, worldTick,
        `temporal revisit ended because standing matter ${matterId} is no longer open`,
      );
      this.issued.delete(matterId);
    }
    return emitted;
  }
}
