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
  /** Serialize only `modelInput` across a semantic-provider boundary. */
  modelInput: P2E5ModelSemanticInput;
  /** Causal authority remains resident-side and must never come from provider output. */
  localAuthority: P2E0ProposalTicket;
}

export type P2E5PrepareResult = { status: "ready"; run: P2E5LocalProviderRun };

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
 * The 512-character output limit is a probe-local safety bound, not a selected
 * final product schema.
 */
export class P2E5SemanticProviderAuthorityMembrane {
  prepare(context: P2E4SemanticProposalContext): P2E5PrepareResult {
    return {
      status: "ready",
      run: {
        modelInput: {
          currentSemanticCourse: context.matter.semanticCourse,
          semanticEvidence: {
            kind: context.semanticEvidence.kind,
            source: modelEvidenceSource(context.semanticEvidence.source),
            summary: context.semanticEvidence.summary
          }
        },
        localAuthority: { ...context.proposal }
      }
    };
  }

  settle(
    resident: P2E0ResidentCausalKernel,
    run: P2E5LocalProviderRun,
    rawProviderOutput: unknown
  ): P2E5SettlementResult {
    const normalized = normalizeSemanticProposal(rawProviderOutput);
    if ("rejection" in normalized) {
      return { status: "provider_output_rejected", reason: normalized.rejection };
    }

    return resident.commitSemanticProposal(run.localAuthority, normalized);
  }
}
