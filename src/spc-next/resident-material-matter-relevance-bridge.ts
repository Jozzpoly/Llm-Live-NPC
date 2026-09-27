import { deriveSpcIdentifier } from "./identity-contract";
import type { ResidentMaterialKnowledge, ResidentKnownMaterialObject } from "./resident-material-knowledge";
import type { ResidentContinuityKernel, ResidentKernelEvidence } from "./resident-continuity-kernel";
import type { ResidentLifeCognitionView, ResidentLifeMatterView } from "./resident-life-cognition-view";
import type { ResidentRuntime } from "./resident-runtime";

export type ResidentMaterialMatterRelevanceObservation =
  | {
      status: "reactivatable";
      matterId: string;
      objectId: string;
      evidence: ResidentKernelEvidence;
      settledAbsencePressure: boolean;
    }
  | {
      status: "fresh_opportunity";
      priorMatterId: string;
      objectId: string;
      evidence: ResidentKernelEvidence;
      priorOutcomeEvidence: ResidentKernelEvidence;
      reasonId: string;
      settledAbsencePressure: boolean;
    }
  | {
      status: "not_relevant";
      objectId: string;
    }
  | {
      status: "ambiguous";
      objectId: string;
      matterIds: readonly string[];
    };

/**
 * Stable identity for the unresolved checked-absence discrepancy of one recognized
 * material object. A newer private reacquisition can settle this exact causal reason
 * without relying on provider output or timer heuristics.
 */
export function materialAbsencePressureReasonId(residentId: string, objectId: string): string {
  return deriveSpcIdentifier("reason_material_absence", `${residentId}|${objectId}`);
}

export function materialReacquiredOpportunityReasonId(residentId: string, objectId: string): string {
  return deriveSpcIdentifier("reason_material_reacquired_opportunity", `${residentId}|${objectId}`);
}

export function materialReacquiredEvidenceId(
  residentId: string,
  matterId: string,
  objectId: string,
  tick: number,
): string {
  return deriveSpcIdentifier(
    "material_reacquired",
    `${residentId}|${matterId}|${objectId}`,
    String(tick),
  );
}

/**
 * Narrow resident-relative relevance seam for recognized material reacquisition.
 *
 * It does not search, rank matters, bind execution, or inspect hidden World truth.
 * The caller supplies two resident-private observations around a normal local sample.
 * Only a genuine invisible -> visible transition can enter this bridge.
 *
 * Reacquisition has two deliberately separate meanings:
 *
 * - if exactly one already-open blocked matter owns the same structured material
 *   identity, the old R4 reactivation path remains unchanged;
 * - if no open matter matches but exactly one terminal, run-free, factually blocked
 *   material episode for that identity is still present in bounded resident life,
 *   reacquisition creates only a fresh semantic opportunity pressure. It does NOT
 *   reopen the old episode or manufacture a new matter.
 *
 * If several relevant matters match either path, the bridge refuses to choose.
 */
export class ResidentMaterialMatterRelevanceBridge {
  constructor(
    private readonly resident: Pick<
      ResidentRuntime,
      "profile" | "invalidateSemanticPressure" | "promoteSemanticPressure"
    >,
    private readonly kernel: ResidentContinuityKernel,
  ) {}

  observeReacquisition(
    previous: ResidentKnownMaterialObject | null,
    current: ResidentKnownMaterialObject | null,
    life: ResidentLifeCognitionView,
  ): ResidentMaterialMatterRelevanceObservation {
    const objectId = current?.objectId ?? previous?.objectId ?? "";
    if (!objectId || !current || !current.currentlyVisible || previous?.currentlyVisible !== false) {
      return { status: "not_relevant", objectId };
    }

    const openMatches = matchingBlockedMaterialMatters(life, objectId);
    if (openMatches.length > 1) {
      return {
        status: "ambiguous",
        objectId,
        matterIds: openMatches.map((matter) => matter.id),
      };
    }
    if (openMatches.length === 1) {
      const matter = openMatches[0]!;
      const evidence = this.kernel.recordEvidence({
        id: materialReacquiredEvidenceId(
          this.resident.profile.id,
          matter.id,
          objectId,
          current.observedAtTick,
        ),
        tick: current.observedAtTick,
        kind: "material_reacquired",
        summary:
          `Recognized material object ${objectId} became privately visible again at (${current.lastKnownPosition.x}, ${current.lastKnownPosition.y}).`,
      });

      this.kernel.advanceSemanticContext(matter.id, evidence.id);
      const settledAbsencePressure = this.resident.invalidateSemanticPressure(
        materialAbsencePressureReasonId(this.resident.profile.id, objectId),
        evidence.tick,
        `checked absence ended because ${objectId} became privately visible again`,
      );

      return {
        status: "reactivatable",
        matterId: matter.id,
        objectId,
        evidence,
        settledAbsencePressure,
      };
    }

    const terminalMatches = matchingTerminalBlockedMaterialMatters(life, objectId);
    if (terminalMatches.length === 0) {
      return { status: "not_relevant", objectId };
    }
    if (terminalMatches.length > 1) {
      return {
        status: "ambiguous",
        objectId,
        matterIds: terminalMatches.map((matter) => matter.id),
      };
    }

    const prior = terminalMatches[0]!;
    const priorOutcomeEvidence = prior.lastOutcomeEvidence!;
    const evidence = this.kernel.recordEvidence({
      id: materialReacquiredEvidenceId(
        this.resident.profile.id,
        prior.id,
        objectId,
        current.observedAtTick,
      ),
      tick: current.observedAtTick,
      kind: "material_reacquired",
      summary:
        `Recognized material object ${objectId} became privately visible again at (${current.lastKnownPosition.x}, ${current.lastKnownPosition.y}) after an earlier terminal material episode.`,
    });
    const settledAbsencePressure = this.resident.invalidateSemanticPressure(
      materialAbsencePressureReasonId(this.resident.profile.id, objectId),
      evidence.tick,
      `checked absence ended because ${objectId} became privately visible again`,
    );
    const reasonId = materialReacquiredOpportunityReasonId(
      this.resident.profile.id,
      objectId,
    );
    this.resident.promoteSemanticPressure({
      id: reasonId,
      tick: evidence.tick,
      kind: "direct_world_change",
      salience: 0.75,
      summary:
        `Familiar material object ${objectId} is privately visible again after an earlier terminal factual attempt.`,
      evidenceIds: [evidence.id, priorOutcomeEvidence.id],
    });

    return {
      status: "fresh_opportunity",
      priorMatterId: prior.id,
      objectId,
      evidence,
      priorOutcomeEvidence: structuredClone(priorOutcomeEvidence),
      reasonId,
      settledAbsencePressure,
    };
  }
}

function matchingBlockedMaterialMatters(
  life: ResidentLifeCognitionView,
  objectId: string,
): ResidentLifeMatterView[] {
  return life.matters
    .filter((matter) => (
      matter.status === "active"
      && matter.activeRun === null
      && matter.semanticIntent?.kind === "acquire_material_object"
      && matter.semanticIntent.objectId === objectId
      && matter.lastOutcomeEvidence?.kind === "task_outcome"
      && matter.lastOutcomeEvidence.summary.startsWith("blocked:")
    ))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Small helper for hosts that continuously maintain recognized material knowledge.
 * It returns the before/after private observations without exposing World truth.
 */
export function sampleRecognizedMaterialObservation(
  knowledge: ResidentMaterialKnowledge,
  objectId: string,
): {
  previous: ResidentKnownMaterialObject | null;
  current: ResidentKnownMaterialObject | null;
} {
  const previous = knowledge.observation(objectId);
  knowledge.sample();
  const current = knowledge.observation(objectId);
  return { previous, current };
}


function matchingTerminalBlockedMaterialMatters(
  life: ResidentLifeCognitionView,
  objectId: string,
): ResidentLifeMatterView[] {
  return life.matters
    .filter((matter) => (
      (matter.status === "resolved" || matter.status === "cancelled")
      && matter.activeRun === null
      && matter.semanticIntent?.kind === "acquire_material_object"
      && matter.semanticIntent.objectId === objectId
      && matter.lastOutcomeEvidence?.kind === "task_outcome"
      && matter.lastOutcomeEvidence.summary.startsWith("blocked:")
    ))
    .sort((left, right) => left.id.localeCompare(right.id));
}
