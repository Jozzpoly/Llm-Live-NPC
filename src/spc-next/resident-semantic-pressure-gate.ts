import type {
  CognitionReason,
  ResidentPercept,
} from "./contracts";

export type ResidentSemanticPressureDisposition =
  | "observation_only"
  | "unresolved";

export type ResidentSemanticPressureCode =
  | "addressed_speech"
  | "ambient_speech"
  | "known_social_speech"
  | "world_change"
  | "actor_visibility"
  | "routine_perception"
  | "region_transition";

export interface ResidentSemanticPressureDecision {
  tick: number;
  residentId: string;
  evidenceId: string | null;
  occurrenceId: string | null;
  disposition: ResidentSemanticPressureDisposition;
  code: ResidentSemanticPressureCode;
  summary: string;
  cognitionReason: CognitionReason | null;
}

/**
 * First R2 boundary between truthful private perception and unresolved semantic
 * pressure.
 *
 * This gate is intentionally conservative and local. It does not claim to solve
 * semantic meaning. Its job is to stop raw observations from owning scheduler
 * authority by default.
 *
 * Important:
 * - observation_only does NOT mean "resident did not perceive it";
 * - observation_only does NOT erase private percept/history state;
 * - addressed speech remains unresolved because local acknowledgement cannot
 *   honestly settle its semantic content;
 * - explicit interaction/system changes remain unresolved for now and will be
 *   reattacked by later causal-explanation stages.
 */
export class ResidentSemanticPressureGate {
  private readonly recent: ResidentSemanticPressureDecision[] = [];

  constructor(
    readonly residentId: string,
    private readonly decisionLimit: number,
  ) {
    if (!residentId.trim()) throw new Error("semantic pressure residentId must be non-empty");
    if (!Number.isSafeInteger(decisionLimit) || decisionLimit < 1) {
      throw new Error("semantic pressure decisionLimit must be a positive safe integer");
    }
  }

  considerPercept(percept: ResidentPercept): ResidentSemanticPressureDecision {
    let decision: ResidentSemanticPressureDecision;

    if (percept.phenomenon === "speech" && percept.modality === "hearing" && percept.text) {
      if (percept.addressed) {
        decision = {
          tick: percept.tick,
          residentId: this.residentId,
          evidenceId: percept.id,
          occurrenceId: percept.occurrenceId,
          disposition: "unresolved",
          code: "addressed_speech",
          summary: "Addressed speech remains unresolved semantic pressure.",
          cognitionReason: {
            id: `reason:${this.residentId}:speech:${percept.occurrenceId}`,
            tick: percept.tick,
            kind: "heard_speech",
            salience: 1,
            summary: `Speech addressed to me: ${percept.text}`,
            evidenceIds: [percept.id],
          },
        };
      } else if (percept.actorId) {
        decision = {
          tick: percept.tick,
          residentId: this.residentId,
          evidenceId: percept.id,
          occurrenceId: percept.occurrenceId,
          disposition: "observation_only",
          code: "known_social_speech",
          summary: "Unaddressed speech from a privately recognized actor remains private social evidence until resident-relative relevance is established.",
          cognitionReason: null,
        };
      } else {
        decision = {
          tick: percept.tick,
          residentId: this.residentId,
          evidenceId: percept.id,
          occurrenceId: percept.occurrenceId,
          disposition: "observation_only",
          code: "ambient_speech",
          summary: "Unaddressed speech from an unrecognized source remains private evidence without immediate unresolved pressure.",
          cognitionReason: null,
        };
      }
      return this.record(decision);
    }

    if (percept.phenomenon === "interaction" || percept.phenomenon === "system") {
      decision = {
        tick: percept.tick,
        residentId: this.residentId,
        evidenceId: percept.id,
        occurrenceId: percept.occurrenceId,
        disposition: "unresolved",
        code: "world_change",
        summary: "Observed explicit world change remains unresolved pending causal explanation.",
        cognitionReason: {
          id: `reason:${this.residentId}:world:${percept.occurrenceId}`,
          tick: percept.tick,
          kind: "direct_world_change",
          salience: 0.45,
          summary: `Observed world change: ${percept.summary}`,
          evidenceIds: [percept.id],
        },
      };
      return this.record(decision);
    }

    if (percept.phenomenon === "actor_sight_enter" || percept.phenomenon === "actor_sight_exit") {
      return this.record({
        tick: percept.tick,
        residentId: this.residentId,
        evidenceId: percept.id,
        occurrenceId: percept.occurrenceId,
        disposition: "observation_only",
        code: "actor_visibility",
        summary: "Actor visibility change updates private observation without immediate semantic pressure.",
        cognitionReason: null,
      });
    }

    return this.record({
      tick: percept.tick,
      residentId: this.residentId,
      evidenceId: percept.id,
      occurrenceId: percept.occurrenceId,
      disposition: "observation_only",
      code: "routine_perception",
      summary: "Routine perception remains private evidence without immediate semantic pressure.",
      cognitionReason: null,
    });
  }

  considerRegionTransition(
    tick: number,
    previousRegionId: string | null,
    nextRegionId: string | null,
  ): ResidentSemanticPressureDecision {
    return this.record({
      tick,
      residentId: this.residentId,
      evidenceId: null,
      occurrenceId: null,
      disposition: "observation_only",
      code: "region_transition",
      summary: `Region transition ${previousRegionId ?? "none"} -> ${nextRegionId ?? "none"} remains local state until a discrepancy exists.`,
      cognitionReason: null,
    });
  }

  recentDecisions(): ResidentSemanticPressureDecision[] {
    return structuredClone(this.recent);
  }

  private record(decision: ResidentSemanticPressureDecision): ResidentSemanticPressureDecision {
    this.recent.push(structuredClone(decision));
    while (this.recent.length > this.decisionLimit) this.recent.shift();
    return structuredClone(decision);
  }
}
