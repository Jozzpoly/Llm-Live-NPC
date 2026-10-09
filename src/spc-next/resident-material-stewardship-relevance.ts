import { distanceSquared, type Vec2 } from "./contracts";
import { deriveSpcIdentifier } from "./identity-contract";
import type { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

export type StewardshipObservation =
  | { status: "unchanged" | "unseen"; reasonId: null }
  | { status: "needs_judgement"; reasonId: string; evidenceId: string }
  | { status: "restored"; reasonId: string; settled: boolean };

/**
 * RESEARCH ONLY — a compact starting personal stake, NOT a new NPC personality
 * or an automatic object-return task.
 *
 * A resident was already responsible for keeping one recognized workstation
 * object in its familiar place. The starting relation is explicitly AUTHORED
 * circumstance, not the resident's autonomous decision and not object ownership.
 * The reference position is acquired through the resident's own PRIVATE sight,
 * never a World-global peek.
 *
 * Later private sight of a displaced object creates ONE semantic question,
 * not a matter, a task or bodily control. Real higher cognition may decline,
 * defer or investigate when a suitable executor is available.
 *
 * This is deliberately kept outside the default five-resident composition while
 * its behavioral value is falsified. Do not promote to the product on CI PASS.
 */
export class ResidentMaterialStewardshipRelevance {
  private referencePosition: Vec2 | null = null;
  private provenanceEvidenceId: string | null = null;
  private lastSampleTick = -1;
  private activeReasonId: string | null = null;

  constructor(
    private readonly life: ResidentCausalLifeSubstrate,
    readonly objectId: string,
    private readonly tolerance = 12,
  ) {
    if (!objectId.trim()) throw new Error("stewardship object identity required");
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("invalid stewardship tolerance");
    if (!life.materialKnowledge) throw new Error("stewardship requires private recognized material knowledge");
  }

  /**
   * Author the *existence of a practical relation* before an event occurs.
   * Require verified private sight first; never author a fake earlier action.
   */
  primeFromPrivateSight(): void {
    if (this.referencePosition !== null) throw new Error("stewardship already primed");
    const observation = this.life.materialKnowledge!.observation(this.objectId);
    if (!observation?.currentlyVisible) throw new Error("stewardship baseline must be privately visible");
    this.referencePosition = { ...observation.lastKnownPosition };
    this.lastSampleTick = observation.observedAtTick;
    const id = deriveSpcIdentifier("evidence_stewardship_origin", `${this.life.resident.profile.id}|${this.objectId}`);
    this.life.kernel.recordEvidence({
      id,
      tick: observation.observedAtTick,
      kind: "authored_stewardship_origin",
      summary: `Authored initial personal responsibility: I help keep recognized ${this.objectId} in its familiar workshop place. It does not prove I chose a task or witnessed a past move.`,
    });
    this.provenanceEvidenceId = id;
  }

  /**
   * CALL ONLY AFTER the normal authoritative World tick and resident-private
   * materialKnowledge.sample(). This function reads no World object state.
   */
  observePrivateAfterWorldTick(): StewardshipObservation {
    if (!this.referencePosition || !this.provenanceEvidenceId) {
      throw new Error("stewardship must be primed before World observation");
    }
    const observed = this.life.materialKnowledge!.observation(this.objectId);
    if (!observed?.currentlyVisible) return { status: "unseen", reasonId: null };
    if (observed.observedAtTick <= this.lastSampleTick) {
      return { status: "unchanged", reasonId: null };
    }
    this.lastSampleTick = observed.observedAtTick;

    const differs = distanceSquared(observed.lastKnownPosition, this.referencePosition)
      > this.tolerance * this.tolerance;
    if (!differs) {
      if (this.activeReasonId === null) return { status: "unchanged", reasonId: null };
      const reasonId = this.activeReasonId;
      this.activeReasonId = null;
      const settled = this.life.resident.invalidateSemanticPressure(
        reasonId, observed.observedAtTick, "recognized workstation object privately observed back at familiar place",
      );
      return { status: "restored", reasonId, settled };
    }

    if (this.activeReasonId !== null) return { status: "unchanged", reasonId: null };

    const residentId = this.life.resident.profile.id;
    const evidenceId = deriveSpcIdentifier(
      "evidence_stewardship_displacement", `${residentId}|${this.objectId}`, String(observed.observedAtTick),
    );
    this.life.kernel.recordEvidence({
      id: evidenceId,
      tick: observed.observedAtTick,
      kind: "private_material_displacement",
      summary: `Privately observed familiar ${this.objectId} at (${observed.lastKnownPosition.x}, ${observed.lastKnownPosition.y}) rather than the remembered workstation reference (${this.referencePosition.x}, ${this.referencePosition.y}). Cause and actor unknown.`,
    });
    const reasonId = deriveSpcIdentifier(
      "reason_stewardship_displacement", `${residentId}|${this.objectId}`, String(observed.observedAtTick),
    );
    this.life.resident.promoteSemanticPressure({
      id: reasonId,
      tick: observed.observedAtTick,
      kind: "uncertainty",
      salience: 0.72,
      summary: `I had an existing responsibility for ${this.objectId}. I actually see it away from its remembered workstation place. Is this important enough to act on, investigate, discuss, or ignore? I do not know who moved it or why.`,
      evidenceIds: [this.provenanceEvidenceId, evidenceId],
    });
    this.activeReasonId = reasonId;
    return { status: "needs_judgement", reasonId, evidenceId };
  }
}
