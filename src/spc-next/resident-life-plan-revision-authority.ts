import { deriveSpcIdentifier } from "./identity-contract";
import type {
  ResidentContinuityKernel,
  ResidentKernelEvidence,
  ResidentMatter,
} from "./resident-continuity-kernel";
import type {
  ResidentLifeChoiceOwner,
  ResidentLifeChoiceSettlement,
} from "./resident-life-choice-owner";

export type ResidentLifePlanRevisionResult =
  | {
      status: "applied";
      evidence: ResidentKernelEvidence;
      matter: ResidentMatter;
      retiredRunId: string;
    }
  | {
      status: "rejected";
      reason:
        | "revision_not_authorized"
        | "invalid_tick"
        | "resident_mismatch"
        | "matter_changed"
        | "run_authority_changed";
    };

/**
 * Local lifecycle authority for one resident-owned plan relinquishment.
 *
 * A provider response cannot call this directly: it must first survive one exact
 * ResidentLifeChoiceOwner settlement and yield the identity-bound one-shot grant
 * consumed here. This authority then rechecks the exact current matter/run revision,
 * records a resident-owned semantic plan-change fact, terminalizes the matter as
 * cancelled and retires the old run binding.
 *
 * It does not choose another plan and does not mutate World. Any remaining execution
 * demand is handled later by ordinary policy-free arbitration.
 */
export class ResidentLifePlanRevisionAuthority {
  constructor(
    private readonly residentId: string,
    private readonly owner: ResidentLifeChoiceOwner,
    private readonly kernel: ResidentContinuityKernel,
  ) {
    if (!residentId.trim()) throw new Error("resident plan revision residentId must be non-empty");
  }

  apply(
    settlement: ResidentLifeChoiceSettlement,
    tick: number,
  ): ResidentLifePlanRevisionResult {
    const grant = this.owner.claimPlanRevision(settlement);
    if (!grant) return { status: "rejected", reason: "revision_not_authorized" };
    if (!Number.isSafeInteger(tick) || tick < grant.settlementTick) {
      return { status: "rejected", reason: "invalid_tick" };
    }
    if (grant.residentId !== this.residentId) {
      return { status: "rejected", reason: "resident_mismatch" };
    }

    const matter = this.kernel.matter(grant.matterId);
    if (!matter
      || matter.status !== "active"
      || matter.semanticRevision !== grant.semanticRevision
      || matter.activeRunId !== grant.runId) {
      return { status: "rejected", reason: "matter_changed" };
    }
    if (!this.kernel.canRunMutateWorld(grant.runId)) {
      return { status: "rejected", reason: "run_authority_changed" };
    }

    const evidence = this.kernel.recordEvidence({
      id: deriveSpcIdentifier(
        "evidence-plan-revision",
        this.residentId,
        grant.matterId,
        grant.runId,
        String(grant.semanticRevision),
        String(tick),
      ),
      tick,
      kind: "resident_relinquished_matter",
      summary:
        `${grant.reason} · relinquished ${grant.matterId} · causal support `
        + grant.supportEvidenceIds.join(", "),
    });

    // Semantic revision first makes the old run stale before terminalization. The
    // explicit cancellation then records that this resident plan was relinquished,
    // not mechanically completed or factually failed.
    this.kernel.advanceSemanticContext(grant.matterId, evidence.id);
    const cancelled = this.kernel.cancelMatter(grant.matterId);
    this.kernel.retireRun(grant.runId);

    return {
      status: "applied",
      evidence: structuredClone(evidence),
      matter: this.kernel.matter(cancelled.id)!,
      retiredRunId: grant.runId,
    };
  }
}
