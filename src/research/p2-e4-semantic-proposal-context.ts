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
    status: P2E0MatterStatus;
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

/**
 * P2-E4 research apparatus only.
 *
 * The seam should project one already-selected resident matter into a bounded,
 * self-contained semantic proposal context. It must not pull raw World state,
 * E1 perception, UI state or unrelated resident evidence into the provider
 * boundary. The proposal ticket remains the causal authority for reconciliation.
 */
export class P2E4SemanticProposalContextSeam {
  build(
    resident: P2E0ResidentCausalKernel,
    ticket: P2E0ProposalTicket
  ): P2E4SemanticProposalContextResult {
    // RED apparatus: the context projection has not yet been earned. Returning
    // a deterministic rejection lets the first behavioral attack fail at the
    // missing boundary rather than on TypeScript/import plumbing.
    void resident;
    void ticket;
    return { status: "rejected", reason: "proposal_not_pending" };
  }
}
