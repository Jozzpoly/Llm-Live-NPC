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
      disposition: "continue" | "relinquish";
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
        | "run_authority_changed"
        | "continuation_requires_run_free_matter";
    };

/**
 * Local lifecycle authority for one resident-owned plan review disposition.
 *
 * A provider response cannot call this directly: it must first survive one exact
 * resident semantic settlement and yield an identity-bound one-shot grant consumed
 * here. This authority then rechecks the exact current matter/run revision and records
 * a resident-owned semantic plan-change fact.
 *
 * Relinquish terminalizes the exact matter as cancelled and retires any still-live
 * run. Continue is deliberately narrower: it is legal only for a run-free matter
 * whose factual run has already reconciled, and advances semantic context without
 * creating a replacement plan or run. Ordinary execution authority may separately
 * reactivate that reviewed matter afterward.
 *
 * It does not choose another plan and does not mutate World.
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
    if (grant.disposition === "continue" && grant.runId !== null) {
      return { status: "rejected", reason: "continuation_requires_run_free_matter" };
    }

    const evidence = this.kernel.recordEvidence({
      id: deriveSpcIdentifier(
        "evidence-plan-revision",
        [
          this.residentId,
          grant.matterId,
          grant.runId ?? "run-free",
          grant.disposition,
          String(grant.semanticRevision),
        ].join("|"),
        String(tick),
      ),
      tick,
      kind: grant.disposition === "continue"
        ? "resident_continued_matter"
        : "resident_relinquished_matter",
      summary:
        `${grant.reason} · ${grant.disposition === "continue" ? "continued" : "relinquished"} ${grant.matterId} · causal support `
        + grant.supportEvidenceIds.join(", "),
    });

    // Every admitted review advances the semantic revision against exact resident
    // evidence. Relinquishment then terminalizes. Continuation deliberately leaves
    // the reviewed matter active and run-free; a separate execution authority must
    // decide whether a new run can legally acquire the body.
    this.kernel.advanceSemanticContext(grant.matterId, evidence.id);
    if (grant.disposition === "relinquish") {
      const cancelled = this.kernel.cancelMatter(grant.matterId);
      if (grant.runId !== null) this.kernel.retireRun(grant.runId);
      return {
        status: "applied",
        disposition: grant.disposition,
        evidence: structuredClone(evidence),
        matter: this.kernel.matter(cancelled.id)!,
        retiredRunId: grant.runId,
      };
    }

    return {
      status: "applied",
      disposition: grant.disposition,
      evidence: structuredClone(evidence),
      matter: this.kernel.matter(grant.matterId)!,
      retiredRunId: null,
    };
  }
}
