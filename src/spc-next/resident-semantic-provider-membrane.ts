import {
  ResidentContinuityKernel,
  type ResidentKernelEvidence,
  type ResidentMatter,
  type ResidentSemanticProposalTicket,
} from "./resident-continuity-kernel";

export interface ResidentSemanticProviderRun {
  version: 1;
  providerRunId: string;
  matter: {
    id: string;
    semanticCourse: string;
  };
  semanticEvidence: ResidentKernelEvidence;
}

export type ResidentSemanticProviderSettlement =
  | { status: "applied"; matter: ResidentMatter }
  | { status: "invalid_output"; canRetry: true }
  | { status: "stale"; reason: "matter_missing" | "matter_terminal" | "semantic_authority_stale" }
  | { status: "local_run_rejected"; reason: "unknown_local_run" };

export type ResidentSemanticProviderAbandonment =
  | { status: "abandoned"; providerRunId: string }
  | { status: "stale"; providerRunId: string }
  | { status: "local_run_rejected"; reason: "unknown_local_run" };

interface PrivateProviderAuthority {
  ticket: ResidentSemanticProposalTicket;
}

/**
 * Local authority membrane between resident cognition state and an external
 * semantic provider. The serializable run contains semantic content and a
 * correlation id only; resident mutation authority remains in this private map.
 *
 * HTTP/model retry policy does not live here. A caller may retry malformed
 * provider output while the exact resident proposal still owns authority, or
 * explicitly abandon the local run on timeout/cancellation.
 */
export class ResidentSemanticProviderMembrane {
  private readonly privateAuthority = new Map<string, PrivateProviderAuthority>();
  private runSequence = 0;

  prepare(kernel: ResidentContinuityKernel, matterId: string): ResidentSemanticProviderRun {
    const matter = kernel.matter(matterId);
    if (!matter) throw new Error(`unknown matter: ${matterId}`);
    const semanticEvidence = kernel.semanticEvidence(matterId);
    if (!semanticEvidence) throw new Error(`matter has no live semantic evidence: ${matterId}`);

    const ticket = kernel.beginSemanticProposal(matterId);
    const providerRunId = `semantic-provider:${this.runSequence++}`;
    this.privateAuthority.set(providerRunId, { ticket });

    return {
      version: 1,
      providerRunId,
      matter: {
        id: matter.id,
        semanticCourse: matter.semanticCourse,
      },
      semanticEvidence: structuredClone(semanticEvidence),
    };
  }

  settle(
    kernel: ResidentContinuityKernel,
    providerRunId: string,
    providerOutput: unknown,
  ): ResidentSemanticProviderSettlement {
    const authority = this.privateAuthority.get(providerRunId);
    if (!authority) return { status: "local_run_rejected", reason: "unknown_local_run" };

    if (!isExactTicketPending(kernel, authority.ticket)) {
      this.privateAuthority.delete(providerRunId);
      const matter = kernel.matter(authority.ticket.matterId);
      if (!matter) return { status: "stale", reason: "matter_missing" };
      if (matter.status === "resolved" || matter.status === "cancelled") {
        return { status: "stale", reason: "matter_terminal" };
      }
      return { status: "stale", reason: "semantic_authority_stale" };
    }

    const parsed = parseProviderOutput(providerOutput);
    if (!parsed) return { status: "invalid_output", canRetry: true };

    const result = kernel.commitSemanticProposal(authority.ticket, parsed);
    this.privateAuthority.delete(providerRunId);
    if (result.status === "applied") return { status: "applied", matter: result.matter };
    return { status: "stale", reason: result.reason };
  }

  abandon(
    kernel: ResidentContinuityKernel,
    providerRunId: string,
  ): ResidentSemanticProviderAbandonment {
    const authority = this.privateAuthority.get(providerRunId);
    if (!authority) return { status: "local_run_rejected", reason: "unknown_local_run" };
    this.privateAuthority.delete(providerRunId);

    const result = kernel.abandonSemanticProposal(authority.ticket);
    if (result.status === "abandoned") return { status: "abandoned", providerRunId };
    return { status: "stale", providerRunId };
  }

  activeLocalRunCount(): number {
    return this.privateAuthority.size;
  }
}

function isExactTicketPending(
  kernel: ResidentContinuityKernel,
  ticket: ResidentSemanticProposalTicket,
): boolean {
  return kernel.pendingSemanticProposals().some((candidate) => (
    candidate.attemptId === ticket.attemptId
    && candidate.matterId === ticket.matterId
    && candidate.semanticRevision === ticket.semanticRevision
    && candidate.semanticEvidenceId === ticket.semanticEvidenceId
  ));
}

function parseProviderOutput(value: unknown): { semanticCourse: string } | null {
  if (!value || typeof value !== "object") return null;
  const semanticCourse = (value as { semanticCourse?: unknown }).semanticCourse;
  if (typeof semanticCourse !== "string" || semanticCourse.trim().length === 0) return null;
  return { semanticCourse: semanticCourse.trim() };
}
