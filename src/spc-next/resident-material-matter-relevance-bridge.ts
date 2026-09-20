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

/**
 * Narrow resident-relative relevance seam for recognized material reacquisition.
 *
 * It does not search, rank matters, bind execution, or inspect hidden World truth.
 * The caller supplies two resident-private observations around a normal local sample.
 * Only a genuine invisible -> visible transition can enter this bridge.
 *
 * Reacquisition becomes matter-relevant only when exactly one already-open blocked
 * matter carries a durable `acquire_material_object` intent for that exact identity.
 * If several matters match, the bridge refuses to choose.
 */
export class ResidentMaterialMatterRelevanceBridge {
  constructor(
    private readonly resident: Pick<
      ResidentRuntime,
      "profile" | "invalidateSemanticPressure"
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

    const matches = matchingBlockedMaterialMatters(life, objectId);
    if (matches.length === 0) {
      return { status: "not_relevant", objectId };
    }
    if (matches.length > 1) {
      return {
        status: "ambiguous",
        objectId,
        matterIds: matches.map((matter) => matter.id),
      };
    }

    const matter = matches[0]!;
    const evidence = this.kernel.recordEvidence({
      id: deriveSpcIdentifier(
        "material_reacquired",
        `${this.resident.profile.id}|${matter.id}|${objectId}`,
        String(current.observedAtTick),
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
