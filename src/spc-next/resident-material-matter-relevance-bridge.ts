import { deriveSpcIdentifier } from "./identity-contract";
import type { ResidentMaterialKnowledge, ResidentKnownMaterialObject } from "./resident-material-knowledge";
import type {
  ResidentContinuityKernel,
  ResidentKernelEvidence,
  ResidentMatter,
} from "./resident-continuity-kernel";
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
 *   material episode for that identity is either still present in bounded resident
 *   life OR retained as exact factual terminal-outcome provenance, reacquisition
 *   creates only a fresh semantic opportunity pressure. It does NOT reopen the old
 *   episode, reinsert it into life scope or manufacture a new matter.
 *
 * The archive is never sufficient by itself: a new private invisible -> visible
 * observation is still required. If several relevant historical matters match, the
 * bridge refuses to choose.
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

    // Do not manufacture a second same-object commitment merely because archived
    // history exists. Any current open/suspended material matter already owns the
    // semantic question, even if it is not in the narrow blocked-reactivation state.
    if (hasOpenMaterialMatter(life, objectId)) {
      return { status: "not_relevant", objectId };
    }

    const terminalMatches = matchingTerminalBlockedMaterialMatters(life, objectId);
    if (terminalMatches.length > 1) {
      return {
        status: "ambiguous",
        objectId,
        matterIds: terminalMatches.map((matter) => matter.id),
      };
    }

    let priorMatterId: string;
    let priorOutcomeEvidence: ResidentKernelEvidence;
    if (terminalMatches.length === 1) {
      const prior = terminalMatches[0]!;
      priorMatterId = prior.id;
      priorOutcomeEvidence = structuredClone(prior.lastOutcomeEvidence!);
    } else {
      const archivedMatches = matchingArchivedTerminalBlockedMaterialMatters(
        this.kernel,
        objectId,
      );
      if (archivedMatches.length === 0) {
        return { status: "not_relevant", objectId };
      }
      if (archivedMatches.length > 1) {
        return {
          status: "ambiguous",
          objectId,
          matterIds: archivedMatches.map((match) => match.matter.id),
        };
      }
      const archived = archivedMatches[0]!;
      priorMatterId = archived.matter.id;
      priorOutcomeEvidence = structuredClone(archived.evidence);
    }
    const evidence = this.kernel.recordEvidence({
      id: materialReacquiredEvidenceId(
        this.resident.profile.id,
        priorMatterId,
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
        `Familiar material object ${objectId} is privately visible again after an earlier terminal factual attempt. Earlier factual outcome: ${priorOutcomeEvidence.summary}`,
      evidenceIds: [evidence.id, priorOutcomeEvidence.id],
    });

    return {
      status: "fresh_opportunity",
      priorMatterId,
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



function hasOpenMaterialMatter(
  life: ResidentLifeCognitionView,
  objectId: string,
): boolean {
  return life.matters.some((matter) => (
    (matter.status === "active" || matter.status === "suspended")
    && matter.semanticIntent?.kind === "acquire_material_object"
    && matter.semanticIntent.objectId === objectId
  ));
}

function matchingArchivedTerminalBlockedMaterialMatters(
  kernel: ResidentContinuityKernel,
  objectId: string,
): Array<{ matter: ResidentMatter; evidence: ResidentKernelEvidence }> {
  const matches: Array<{ matter: ResidentMatter; evidence: ResidentKernelEvidence }> = [];
  for (const entry of kernel.terminalOutcomeArchiveSnapshot()) {
    const matter = kernel.matter(entry.matterId);
    if (!matter
      || (matter.status !== "resolved" && matter.status !== "cancelled")
      || matter.activeRunId !== null
      || matter.semanticIntent?.kind !== "acquire_material_object"
      || matter.semanticIntent.objectId !== objectId
      || matter.lastOutcomeEvidenceId !== entry.evidence.id
      || entry.evidence.kind !== "task_outcome"
      || !entry.evidence.summary.startsWith("blocked:")) continue;
    matches.push({
      matter,
      evidence: structuredClone(entry.evidence),
    });
  }
  return matches.sort((left, right) => left.matter.id.localeCompare(right.matter.id));
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
