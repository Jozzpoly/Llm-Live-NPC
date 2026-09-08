import type {
  P2E0EvidenceKind,
  P2E0EvidenceSource,
  P2E0MatterState,
  P2E0ProposalCommitResult,
  P2E0ProposalTicket,
  P2E0ResidentCausalKernel
} from "./p2-e0-resident-causal-kernel";
import type { P2E4SemanticProposalContext } from "./p2-e4-semantic-proposal-context";

export type P2E5ModelEvidenceSource =
  | { kind: "actor"; actorId: string }
  | { kind: "world" }
  | { kind: "task" }
  | { kind: "clock" };

export interface P2E5ModelSemanticInput {
  currentSemanticCourse: string;
  semanticEvidence: {
    kind: P2E0EvidenceKind;
    source: P2E5ModelEvidenceSource;
    summary: string;
  };
}

export interface P2E5LocalProviderRun {
  /** Serialize only `modelInput` across a semantic-provider boundary. */
  modelInput: P2E5ModelSemanticInput;
  /** Causal authority remains resident-side and must never come from provider output. */
  localAuthority: P2E0ProposalTicket;
}

export type P2E5PrepareResult =
  | { status: "ready"; run: P2E5LocalProviderRun }
  | { status: "rejected"; reason: "apparatus_not_implemented" };

export type P2E5ProviderOutputRejection =
  | "not_object"
  | "unexpected_fields"
  | "invalid_semantic_course";

export type P2E5SettlementResult =
  | P2E0ProposalCommitResult
  | { status: "provider_output_rejected"; reason: P2E5ProviderOutputRejection };

function modelEvidenceSource(source: P2E0EvidenceSource): P2E5ModelEvidenceSource {
  switch (source.kind) {
    case "actor":
      return { kind: "actor", actorId: source.actorId };
    case "world":
      return { kind: "world" };
    case "task":
      return { kind: "task" };
    case "clock":
      return { kind: "clock" };
  }
}

/**
 * P2-E5 research apparatus only.
 *
 * The intended membrane keeps proposal/matter/evidence identity and execution
 * authority on the resident side. A model should see semantic content and
 * sourced meaning, not the identifiers needed to modify resident continuity.
 * A returning model value must become a bounded semantic proposal before the
 * original resident-owned proposal ticket is used for reconciliation.
 */
export class P2E5SemanticProviderAuthorityMembrane {
  prepare(context: P2E4SemanticProposalContext): P2E5PrepareResult {
    // RED apparatus: the authority split has not yet been earned.
    void context;
    return { status: "rejected", reason: "apparatus_not_implemented" };
  }

  settle(
    resident: P2E0ResidentCausalKernel,
    run: P2E5LocalProviderRun,
    rawProviderOutput: unknown
  ): P2E5SettlementResult {
    // RED apparatus: settlement is deliberately unavailable until the request
    // authority split is demonstrated first.
    void resident;
    void run;
    void rawProviderOutput;
    return { status: "provider_output_rejected", reason: "not_object" };
  }
}

// Keep these imports intentionally exercised by the apparatus type surface so
// later implementation does not silently broaden the resident/provider schema.
void modelEvidenceSource;
void (null as P2E0MatterState | null);
