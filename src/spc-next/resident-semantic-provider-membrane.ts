import {
  ResidentContinuityKernel,
  type ResidentKernelEvidence,
  type ResidentMatter,
  type ResidentSemanticProposalTicket,
} from "./resident-continuity-kernel";

export interface ResidentLocalCapabilityOffer {
  id: string;
  summary: string;
}

export interface ResidentSemanticDecision {
  semanticCourse: string;
  localCapabilityId: string | null;
}

export interface ResidentSemanticProviderRun {
  version: 2;
  providerRunId: string;
  matter: {
    id: string;
    semanticCourse: string;
  };
  semanticEvidence: ResidentKernelEvidence;
  localCapabilities: readonly ResidentLocalCapabilityOffer[];
}

export type ResidentSemanticProviderSettlement =
  | { status: "applied"; matter: ResidentMatter; localCapabilityId: string | null }
  | { status: "invalid_output"; canRetry: true }
  | { status: "stale"; reason: "matter_missing" | "matter_terminal" | "semantic_authority_stale" }
  | { status: "local_run_rejected"; reason: "unknown_local_run" };

export type ResidentSemanticProviderAbandonment =
  | { status: "abandoned"; providerRunId: string }
  | { status: "stale"; providerRunId: string }
  | { status: "local_run_rejected"; reason: "unknown_local_run" };

interface PrivateProviderAuthority {
  ticket: ResidentSemanticProposalTicket;
  localCapabilityIds: ReadonlySet<string>;
}

const MAX_LOCAL_CAPABILITIES = 16;
const MAX_CAPABILITY_SUMMARY_CHARACTERS = 1_000;
const LOCAL_CAPABILITY_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

/**
 * Local authority membrane between resident cognition state and an external
 * semantic provider. The serializable run contains semantic content, locally
 * offered capabilities and a correlation id only; resident mutation authority
 * remains in this private map.
 *
 * A local capability is an affordance offered by the resident/local brain, not a
 * provider-created command. The provider may select one exact offered id or null.
 * Selection does not itself bind a task/run or mutate World; the caller must still
 * re-ground the admitted choice against current local preconditions.
 */
export class ResidentSemanticProviderMembrane {
  private readonly privateAuthority = new Map<string, PrivateProviderAuthority>();
  private runSequence = 0;

  prepare(
    kernel: ResidentContinuityKernel,
    matterId: string,
    localCapabilities: readonly ResidentLocalCapabilityOffer[] = [],
  ): ResidentSemanticProviderRun {
    const matter = kernel.matter(matterId);
    if (!matter) throw new Error(`unknown matter: ${matterId}`);
    const semanticEvidence = kernel.semanticEvidence(matterId);
    if (!semanticEvidence) throw new Error(`matter has no live semantic evidence: ${matterId}`);
    const capabilities = validateLocalCapabilities(localCapabilities);

    const ticket = kernel.beginSemanticProposal(matterId);
    const providerRunId = `semantic-provider:${this.runSequence++}`;
    this.privateAuthority.set(providerRunId, {
      ticket,
      localCapabilityIds: new Set(capabilities.map((capability) => capability.id)),
    });

    return {
      version: 2,
      providerRunId,
      matter: {
        id: matter.id,
        semanticCourse: matter.semanticCourse,
      },
      semanticEvidence: structuredClone(semanticEvidence),
      localCapabilities: capabilities,
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

    const parsed = parseProviderOutput(providerOutput, authority.localCapabilityIds);
    if (!parsed) return { status: "invalid_output", canRetry: true };

    const result = kernel.commitSemanticProposal(authority.ticket, {
      semanticCourse: parsed.semanticCourse,
    });
    this.privateAuthority.delete(providerRunId);
    if (result.status === "applied") {
      return {
        status: "applied",
        matter: result.matter,
        localCapabilityId: parsed.localCapabilityId,
      };
    }
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

function validateLocalCapabilities(
  value: readonly ResidentLocalCapabilityOffer[],
): ResidentLocalCapabilityOffer[] {
  if (!Array.isArray(value) || value.length > MAX_LOCAL_CAPABILITIES) {
    throw new Error(`local capabilities must contain at most ${MAX_LOCAL_CAPABILITIES} entries`);
  }
  const ids = new Set<string>();
  return value.map((candidate) => {
    const id = typeof candidate?.id === "string" ? candidate.id.trim() : "";
    const summary = typeof candidate?.summary === "string" ? candidate.summary.trim() : "";
    if (!LOCAL_CAPABILITY_ID.test(id)) throw new Error(`invalid local capability id: ${id}`);
    if (!summary || summary.length > MAX_CAPABILITY_SUMMARY_CHARACTERS) {
      throw new Error(`invalid local capability summary for ${id}`);
    }
    if (ids.has(id)) throw new Error(`duplicate local capability id: ${id}`);
    ids.add(id);
    return Object.freeze({ id, summary });
  });
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

function parseProviderOutput(
  value: unknown,
  allowedCapabilityIds: ReadonlySet<string>,
): ResidentSemanticDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "semanticCourse" && key !== "localCapabilityId")) return null;
  const semanticCourse = typeof record.semanticCourse === "string" ? record.semanticCourse.trim() : "";
  if (!semanticCourse) return null;

  // Internal deterministic callers from the pre-capability recovery campaign may
  // omit the field; that is equivalent to explicitly choosing no local capability.
  const localCapabilityId = Object.hasOwn(record, "localCapabilityId")
    ? record.localCapabilityId
    : null;
  if (localCapabilityId !== null) {
    if (typeof localCapabilityId !== "string" || !allowedCapabilityIds.has(localCapabilityId)) return null;
  }
  return { semanticCourse, localCapabilityId };
}
