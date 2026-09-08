import type {
  P2E0EvidenceKind,
  P2E0EvidenceSource,
  P2E0ProposalCommitResult,
  P2E0ProposalTicket,
  P2E0ResidentCausalKernel
} from "./p2-e0-resident-causal-kernel";
import type { P2E4SemanticProposalContext } from "./p2-e4-semantic-proposal-context";

const P2E5_MAX_SEMANTIC_COURSE_LENGTH = 512;

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
  /** This is the only public/serializable surface of one provider run. */
  modelInput: P2E5ModelSemanticInput;
}

export type P2E5PrepareResult = { status: "ready"; run: P2E5LocalProviderRun };

export type P2E5ProviderOutputRejection =
  | "not_object"
  | "unexpected_fields"
  | "invalid_semantic_course";

export type P2E5SettlementResult =
  | P2E0ProposalCommitResult
  | { status: "provider_output_rejected"; reason: P2E5ProviderOutputRejection }
  | { status: "local_run_rejected"; reason: "unknown_local_run" };

export type P2E5AbandonResult =
  | {
      status: "abandoned";
      residentAuthority: "released" | "already_inactive";
    }
  | { status: "local_run_rejected"; reason: "unknown_local_run" };

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

function sameTicket(a: P2E0ProposalTicket, b: P2E0ProposalTicket): boolean {
  return (
    a.proposalId === b.proposalId &&
    a.matterId === b.matterId &&
    a.semanticRevision === b.semanticRevision &&
    a.semanticEvidenceId === b.semanticEvidenceId
  );
}

function preflightResidentAuthority(
  resident: P2E0ResidentCausalKernel,
  ticket: P2E0ProposalTicket
): P2E0ProposalCommitResult | null {
  const pending = resident.pendingSemanticProposals().find((candidate) => sameTicket(candidate, ticket));
  if (!pending) {
    const revocation = resident
      .recentSemanticProposalRevocations()
      .find((candidate) => sameTicket(candidate.proposal, ticket));
    return {
      status: "stale",
      reason: revocation?.reason ?? "proposal_not_pending"
    };
  }

  const matter = resident.matter(ticket.matterId);
  if (!matter) return { status: "stale", reason: "matter_missing" };
  if (matter.status === "resolved" || matter.status === "cancelled") {
    return { status: "stale", reason: "matter_terminal" };
  }
  if (matter.semanticRevision !== ticket.semanticRevision) {
    return { status: "stale", reason: "semantic_revision_changed" };
  }

  return null;
}

function normalizeSemanticProposal(
  value: unknown
): { semanticCourse: string } | { rejection: P2E5ProviderOutputRejection } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { rejection: "not_object" };
  }

  const output = value as Record<string, unknown>;
  const keys = Object.keys(output);
  if (keys.length !== 1 || keys[0] !== "semanticCourse") {
    return { rejection: "unexpected_fields" };
  }

  if (typeof output.semanticCourse !== "string") {
    return { rejection: "invalid_semantic_course" };
  }
  const semanticCourse = output.semanticCourse.trim();
  if (
    semanticCourse.length === 0 ||
    semanticCourse.length > P2E5_MAX_SEMANTIC_COURSE_LENGTH
  ) {
    return { rejection: "invalid_semantic_course" };
  }

  return { semanticCourse };
}

/**
 * P2-E5 research apparatus only.
 *
 * Keeps proposal/matter/evidence identity and execution authority on the
 * resident side. A model sees only semantic content and sourced meaning, not
 * the identifiers needed to modify resident continuity. A returning model
 * value becomes a bounded semantic proposal before the original resident-owned
 * proposal ticket is used for reconciliation.
 *
 * Crucially, causal authority is not a public property of the provider run.
 * It lives in an instance-local WeakMap sidecar keyed by the original run
 * object. Serializing/cloning the public run therefore cannot carry authority
 * out and back into the resident. A valid normalized response consumes that
 * local run exactly once; malformed provider output preserves the local run only
 * while the resident ticket itself remains live, so transport or formatting
 * recovery cannot keep an already-revoked semantic authority alive.
 *
 * The 512-character output limit is a probe-local safety bound, not a selected
 * final product schema.
 */
export class P2E5SemanticProviderAuthorityMembrane {
  private readonly authorityByRun = new WeakMap<P2E5LocalProviderRun, P2E0ProposalTicket>();

  prepare(context: P2E4SemanticProposalContext): P2E5PrepareResult {
    const run: P2E5LocalProviderRun = {
      modelInput: {
        currentSemanticCourse: context.matter.semanticCourse,
        semanticEvidence: {
          kind: context.semanticEvidence.kind,
          source: modelEvidenceSource(context.semanticEvidence.source),
          summary: context.semanticEvidence.summary
        }
      }
    };
    this.authorityByRun.set(run, { ...context.proposal });
    return { status: "ready", run };
  }

  /**
   * P2-E17 attempt-lifecycle seam. It consumes only the exact local run object.
   * The E0 release mutation is deliberately still RED-stubbed at this checkpoint.
   */
  abandon(
    resident: P2E0ResidentCausalKernel,
    run: P2E5LocalProviderRun
  ): P2E5AbandonResult {
    const localAuthority = this.authorityByRun.get(run);
    if (!localAuthority) {
      return { status: "local_run_rejected", reason: "unknown_local_run" };
    }

    this.authorityByRun.delete(run);
    return {
      status: "abandoned",
      residentAuthority: resident.releaseSemanticProposal(localAuthority)
        ? "released"
        : "already_inactive"
    };
  }

  settle(
    resident: P2E0ResidentCausalKernel,
    run: P2E5LocalProviderRun,
    rawProviderOutput: unknown
  ): P2E5SettlementResult {
    const localAuthority = this.authorityByRun.get(run);
    if (!localAuthority) {
      return { status: "local_run_rejected", reason: "unknown_local_run" };
    }

    const stale = preflightResidentAuthority(resident, localAuthority);
    if (stale) {
      this.authorityByRun.delete(run);
      return stale;
    }

    const normalized = normalizeSemanticProposal(rawProviderOutput);
    if ("rejection" in normalized) {
      return { status: "provider_output_rejected", reason: normalized.rejection };
    }

    this.authorityByRun.delete(run);
    return resident.commitSemanticProposal(localAuthority, normalized);
  }
}
