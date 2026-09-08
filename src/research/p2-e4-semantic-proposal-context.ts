import type {
  P2E0EvidenceRecord,
  P2E0MatterStatus,
  P2E0ProposalTicket,
  P2E0ResidentCausalKernel
} from "./p2-e0-resident-causal-kernel";

export interface P2E4SemanticProposalContext {
  proposal: P2E0ProposalTicket;
  matter: {
    id: string;
    semanticCourse: string;
    semanticRevision: number;
  };
  semanticEvidence: P2E0EvidenceRecord;
}

export type P2E4SemanticProposalContextResult =
  | { status: "ready"; context: P2E4SemanticProposalContext }
  | {
      status: "rejected";
      reason:
        | "proposal_not_pending"
        | "matter_missing"
        | "matter_terminal"
        | "semantic_dependency_changed"
        | "semantic_evidence_not_retained";
    };

function sameTicket(a: P2E0ProposalTicket, b: P2E0ProposalTicket): boolean {
  return (
    a.proposalId === b.proposalId &&
    a.matterId === b.matterId &&
    a.semanticRevision === b.semanticRevision &&
    a.semanticEvidenceId === b.semanticEvidenceId
  );
}

function terminal(status: P2E0MatterStatus): boolean {
  return status === "resolved" || status === "cancelled";
}

/**
 * P2-E4 research apparatus only.
 *
 * Projects one already-selected resident matter into a bounded, self-contained
 * semantic proposal context. It deliberately does not pull raw World state, E1
 * perception, UI state, unrelated resident evidence or activity/focus status
 * into the provider boundary. Only semantic state whose changes are covered by
 * the proposal ticket is exposed. The P2-E0 ticket remains the causal authority
 * used when a later proposal is reconciled back into resident continuity.
 *
 * P2-E8 permits the exact current semantic dependency to outlive unrelated
 * recent-evidence churn. The seam still prefers the ordinary recent ring, then
 * falls back only to the same matter's exact resident-owned semantic anchor.
 * It does not search an archive or retrieve arbitrary historical evidence.
 *
 * P2-E12 removes proposals from the active-pending set as soon as their scoped
 * authority is known to be dead. A bounded resident revocation record is still
 * consulted here before returning the generic `proposal_not_pending`, so exact
 * recently-revoked tickets retain the older causal rejection semantics while
 * forged or unrelated ticket identities do not inherit that provenance.
 */
export class P2E4SemanticProposalContextSeam {
  build(
    resident: P2E0ResidentCausalKernel,
    ticket: P2E0ProposalTicket
  ): P2E4SemanticProposalContextResult {
    const pending = resident
      .pendingSemanticProposals()
      .find((candidate) => candidate.proposalId === ticket.proposalId);
    if (!pending || !sameTicket(pending, ticket)) {
      const revocation = resident
        .recentSemanticProposalRevocations()
        .find((candidate) => sameTicket(candidate.proposal, ticket));
      if (revocation) {
        return {
          status: "rejected",
          reason:
            revocation.reason === "matter_terminal"
              ? "matter_terminal"
              : "semantic_dependency_changed"
        };
      }
      return { status: "rejected", reason: "proposal_not_pending" };
    }

    const matter = resident.matter(ticket.matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (terminal(matter.status)) return { status: "rejected", reason: "matter_terminal" };
    if (
      matter.semanticRevision !== ticket.semanticRevision ||
      matter.latestSemanticEvidenceId !== ticket.semanticEvidenceId
    ) {
      return { status: "rejected", reason: "semantic_dependency_changed" };
    }

    const semanticEvidence =
      resident.recentEvidence().find((evidence) => evidence.id === ticket.semanticEvidenceId) ??
      resident.semanticEvidenceAnchor(ticket.matterId, ticket.semanticEvidenceId);
    if (!semanticEvidence) {
      return { status: "rejected", reason: "semantic_evidence_not_retained" };
    }

    return {
      status: "ready",
      context: {
        proposal: { ...ticket },
        matter: {
          id: matter.id,
          semanticCourse: matter.semanticCourse,
          semanticRevision: matter.semanticRevision
        },
        semanticEvidence
      }
    };
  }
}
