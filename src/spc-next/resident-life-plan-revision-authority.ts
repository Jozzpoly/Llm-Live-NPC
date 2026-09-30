import { deriveSpcIdentifier } from "./identity-contract";
import type {
  ResidentContinuityKernel,
  ResidentKernelEvidence,
  ResidentMatter,
} from "./resident-continuity-kernel";
import type { ResidentLifePlanRevisionGrant } from "./resident-life-choice-owner";

export interface ResidentLifePlanRevisionGrantSource {
  claimPlanRevision(settlement: object): ResidentLifePlanRevisionGrant | null;
}

export type ResidentLifePlanRevisionResult =
  | {
      status: "applied";
      evidence: ResidentKernelEvidence;
      matter: ResidentMatter;
      retiredRunId: string | null;
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
 * resident semantic settlement and yield an identity-bound one-shot grant consumed
 * here. This authority then rechecks the exact current matter/run revision, records
 * a resident-owned semantic plan-change fact and terminalizes the matter as cancelled.
 * If a live run still exists, that exact binding is retired; a factually reconciled
 * run-free matter can be revised only while its frozen semantic revision still matches.
 *
 * It does not choose another plan and does not mutate World. Any remaining execution
 * demand is handled later by ordinary policy-free arbitration.
 */
export class ResidentLifePlanRevisionAuthority {
  constructor(
    private readonly residentId: string,
    private readonly owner: ResidentLifePlanRevisionGrantSource,
    private readonly kernel: ResidentContinuityKernel,
  ) {
    if (!residentId.trim()) throw new Error("resident plan revision residentId must be non-empty");
  }

  apply(
    settlement: object,
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
    if (grant.runId !== null && !this.kernel.canRunMutateWorld(grant.runId)) {
      return { status: "rejected", reason: "run_authority_changed" };
    }

    const evidence = this.kernel.recordEvidence({
      id: deriveSpcIdentifier(
        "evidence-plan-revision",
        [
          this.residentId,
          grant.matterId,
          grant.runId ?? "run-free",
          String(grant.semanticRevision),
        ].join("|"),
        String(tick),
      ),
      tick,
      kind: "resident_relinquished_matter",
      summary:
        `${grant.reason} · relinquished ${grant.matterId} · causal support `
        + grant.supportEvidenceIds.join(", "),
    });

    // Semantic revision first makes any still-live run stale before terminalization.
    // A run-free blocked matter has already reconciled its factual run; cancellation
    // here records resident-owned plan revision rather than mechanical completion.
    this.kernel.advanceSemanticContext(grant.matterId, evidence.id);
    const cancelled = this.kernel.cancelMatter(grant.matterId);
    if (grant.runId !== null) this.kernel.retireRun(grant.runId);

    return {
      status: "applied",
      evidence: structuredClone(evidence),
      matter: this.kernel.matter(cancelled.id)!,
      retiredRunId: grant.runId,
    };
  }
}
