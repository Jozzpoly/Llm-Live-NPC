export type ResidentMatterStatus = "active" | "suspended" | "resolved" | "cancelled";
export type ResidentRunOutcomeStatus = "succeeded" | "failed" | "blocked";
export type ResidentSemanticProposalRevocationReason =
  | "semantic_dependency_changed"
  | "matter_terminal"
  | "sibling_committed"
  | "abandoned";

export interface ResidentKernelEvidence {
  id: string;
  tick: number;
  kind: string;
  summary: string;
}

export interface ResidentMatter {
  id: string;
  status: ResidentMatterStatus;
  originEvidenceId: string;
  semanticEvidenceId: string;
  semanticRevision: number;
  semanticCourse: string;
  suspendedByMatterId: string | null;
  activeRunId: string | null;
  lastOutcomeEvidenceId: string | null;
}

export interface ResidentSemanticProposalTicket {
  attemptId: string;
  matterId: string;
  semanticRevision: number;
  semanticEvidenceId: string;
}

export interface ResidentSemanticProposalRevocation {
  ticket: ResidentSemanticProposalTicket;
  reason: ResidentSemanticProposalRevocationReason;
  matterStatus: ResidentMatterStatus | null;
  currentSemanticRevision: number | null;
}

export interface ResidentTaskRunBinding {
  runId: string;
  taskId: string;
  matterId: string;
  semanticRevision: number;
}

export interface ResidentRunOutcome {
  runId: string;
  tick: number;
  status: ResidentRunOutcomeStatus;
  summary: string;
}

export type SemanticCommitResult =
  | { status: "applied"; matter: ResidentMatter }
  | { status: "rejected"; reason: "matter_missing" | "matter_terminal" | "semantic_authority_stale" };

export type SemanticAbandonResult =
  | { status: "abandoned"; ticket: ResidentSemanticProposalTicket }
  | { status: "rejected"; reason: "proposal_not_pending" };

export type RunOutcomeReconciliationResult =
  | {
      status: "recorded";
      binding: ResidentTaskRunBinding;
      evidence: ResidentKernelEvidence;
      matter: ResidentMatter;
    }
  | { status: "rejected"; reason: "run_missing" };

export interface ResidentContinuityKernelOptions {
  recentEvidenceLimit?: number;
  revocationLimit?: number;
}

const DEFAULT_RECENT_EVIDENCE_LIMIT = 64;
const DEFAULT_REVOCATION_LIMIT = 64;

/**
 * Small resident-owned semantic/execution authority kernel for SPC Next recovery.
 *
 * It deliberately does not own World truth, perception, planning, executor progress,
 * provider transport or focus policy. Its job is narrower: preserve continuing
 * resident matters and answer whether a semantic proposal or exact task run still
 * has authority to affect the resident / World.
 */
export class ResidentContinuityKernel {
  private readonly recentEvidence = new Map<string, ResidentKernelEvidence>();
  private readonly matters = new Map<string, ResidentMatter>();
  private readonly pinnedOriginEvidence = new Map<string, ResidentKernelEvidence>();
  private readonly pinnedSemanticEvidence = new Map<string, ResidentKernelEvidence>();
  private readonly pinnedOutcomeEvidence = new Map<string, ResidentKernelEvidence>();
  private readonly runBindings = new Map<string, ResidentTaskRunBinding>();
  private readonly pendingProposals = new Map<string, ResidentSemanticProposalTicket>();
  private readonly recentRevocations: ResidentSemanticProposalRevocation[] = [];
  private proposalSequence = 0;
  private readonly recentEvidenceLimit: number;
  private readonly revocationLimit: number;

  constructor(options: ResidentContinuityKernelOptions = {}) {
    this.recentEvidenceLimit = options.recentEvidenceLimit ?? DEFAULT_RECENT_EVIDENCE_LIMIT;
    this.revocationLimit = options.revocationLimit ?? DEFAULT_REVOCATION_LIMIT;
    if (!Number.isInteger(this.recentEvidenceLimit) || this.recentEvidenceLimit < 1) {
      throw new Error("recentEvidenceLimit must be a positive integer");
    }
    if (!Number.isInteger(this.revocationLimit) || this.revocationLimit < 1) {
      throw new Error("revocationLimit must be a positive integer");
    }
  }

  recordEvidence(evidence: ResidentKernelEvidence): ResidentKernelEvidence {
    validateEvidence(evidence);
    const stored = structuredClone(evidence);
    this.recentEvidence.delete(stored.id);
    this.recentEvidence.set(stored.id, stored);
    this.trimRecentEvidence();
    return structuredClone(stored);
  }

  openMatter(input: {
    id: string;
    originEvidenceId: string;
    semanticCourse: string;
  }): ResidentMatter {
    assertNonEmpty(input.id, "matter id");
    assertNonEmpty(input.semanticCourse, "semantic course");
    if (this.matters.has(input.id)) throw new Error(`matter already exists: ${input.id}`);
    const evidence = this.requireEvidence(input.originEvidenceId);
    const matter: ResidentMatter = {
      id: input.id,
      status: "active",
      originEvidenceId: evidence.id,
      semanticEvidenceId: evidence.id,
      semanticRevision: 1,
      semanticCourse: input.semanticCourse,
      suspendedByMatterId: null,
      activeRunId: null,
      lastOutcomeEvidenceId: null,
    };
    this.matters.set(matter.id, matter);
    this.pinnedOriginEvidence.set(matter.id, structuredClone(evidence));
    this.pinnedSemanticEvidence.set(matter.id, structuredClone(evidence));
    return structuredClone(matter);
  }

  matter(id: string): ResidentMatter | null {
    const matter = this.matters.get(id);
    return matter ? structuredClone(matter) : null;
  }

  originEvidence(matterId: string): ResidentKernelEvidence | null {
    const evidence = this.pinnedOriginEvidence.get(matterId);
    return evidence ? structuredClone(evidence) : null;
  }

  semanticEvidence(matterId: string): ResidentKernelEvidence | null {
    const evidence = this.pinnedSemanticEvidence.get(matterId);
    return evidence ? structuredClone(evidence) : null;
  }

  lastOutcomeEvidence(matterId: string): ResidentKernelEvidence | null {
    const evidence = this.pinnedOutcomeEvidence.get(matterId);
    return evidence ? structuredClone(evidence) : null;
  }

  recentEvidenceSnapshot(): ResidentKernelEvidence[] {
    return [...this.recentEvidence.values()].map((evidence) => structuredClone(evidence));
  }

  pendingSemanticProposals(): ResidentSemanticProposalTicket[] {
    return [...this.pendingProposals.values()].map((ticket) => structuredClone(ticket));
  }

  recentSemanticProposalRevocations(): ResidentSemanticProposalRevocation[] {
    return this.recentRevocations.map((entry) => structuredClone(entry));
  }

  advanceSemanticContext(matterId: string, evidenceId: string): ResidentMatter {
    const matter = this.requireNonTerminalMatter(matterId);
    const evidence = this.requireEvidence(evidenceId);
    matter.semanticRevision += 1;
    matter.semanticEvidenceId = evidence.id;
    this.pinnedSemanticEvidence.set(matter.id, structuredClone(evidence));
    this.revokePendingForMatter(matter.id, "semantic_dependency_changed");
    return structuredClone(matter);
  }

  beginSemanticProposal(matterId: string): ResidentSemanticProposalTicket {
    const matter = this.requireNonTerminalMatter(matterId);
    const ticket: ResidentSemanticProposalTicket = {
      attemptId: `proposal:${matterId}:${this.proposalSequence++}`,
      matterId,
      semanticRevision: matter.semanticRevision,
      semanticEvidenceId: matter.semanticEvidenceId,
    };
    this.pendingProposals.set(ticket.attemptId, ticket);
    return structuredClone(ticket);
  }

  commitSemanticProposal(
    ticket: ResidentSemanticProposalTicket,
    decision: { semanticCourse: string },
  ): SemanticCommitResult {
    assertNonEmpty(decision.semanticCourse, "semantic course");
    const pending = this.pendingProposals.get(ticket.attemptId);
    if (!pending || !sameProposalTicket(pending, ticket)) {
      const priorRevocation = this.findRecentRevocation(ticket);
      if (priorRevocation?.reason === "matter_terminal") {
        return { status: "rejected", reason: "matter_terminal" };
      }
      return { status: "rejected", reason: "semantic_authority_stale" };
    }

    const matter = this.matters.get(ticket.matterId);
    if (!matter) {
      this.pendingProposals.delete(ticket.attemptId);
      return { status: "rejected", reason: "matter_missing" };
    }
    if (isTerminal(matter.status)) {
      this.revokeProposal(pending, "matter_terminal");
      return { status: "rejected", reason: "matter_terminal" };
    }
    if (
      matter.semanticRevision !== ticket.semanticRevision
      || matter.semanticEvidenceId !== ticket.semanticEvidenceId
    ) {
      this.revokeProposal(pending, "semantic_dependency_changed");
      return { status: "rejected", reason: "semantic_authority_stale" };
    }

    // The winning attempt consumes its own pending authority. A successful
    // semantic settlement creates a new authority revision, which also makes
    // sibling provider attempts and older grounded runs stale.
    this.pendingProposals.delete(ticket.attemptId);
    matter.semanticRevision += 1;
    matter.semanticCourse = decision.semanticCourse;
    this.revokePendingForMatter(matter.id, "sibling_committed");
    return { status: "applied", matter: structuredClone(matter) };
  }

  abandonSemanticProposal(ticket: ResidentSemanticProposalTicket): SemanticAbandonResult {
    const pending = this.pendingProposals.get(ticket.attemptId);
    if (!pending || !sameProposalTicket(pending, ticket)) {
      return { status: "rejected", reason: "proposal_not_pending" };
    }
    this.revokeProposal(pending, "abandoned");
    return { status: "abandoned", ticket: structuredClone(ticket) };
  }

  suspendMatter(matterId: string, interruptingMatterId: string): ResidentMatter {
    if (matterId === interruptingMatterId) throw new Error("matter cannot suspend itself");
    const matter = this.requireNonTerminalMatter(matterId);
    const interrupt = this.requireNonTerminalMatter(interruptingMatterId);
    if (matter.status === "suspended") {
      if (matter.suspendedByMatterId !== interrupt.id) {
        throw new Error(`matter already suspended by ${matter.suspendedByMatterId}`);
      }
      return structuredClone(matter);
    }
    if (this.wouldCreateSuspensionCycle(matter.id, interrupt.id)) {
      throw new Error("matter suspension cycle");
    }
    matter.status = "suspended";
    matter.suspendedByMatterId = interrupt.id;
    return structuredClone(matter);
  }

  canResumeMatter(matterId: string): boolean {
    const matter = this.matters.get(matterId);
    if (!matter || matter.status !== "suspended" || !matter.suspendedByMatterId) return false;
    const interrupt = this.matters.get(matter.suspendedByMatterId);
    return Boolean(interrupt && isTerminal(interrupt.status));
  }

  resumeMatter(matterId: string): boolean {
    if (!this.canResumeMatter(matterId)) return false;
    const matter = this.matters.get(matterId)!;
    matter.status = "active";
    matter.suspendedByMatterId = null;
    return true;
  }

  resolveMatter(matterId: string): ResidentMatter {
    return this.terminalizeMatter(matterId, "resolved");
  }

  cancelMatter(matterId: string): ResidentMatter {
    return this.terminalizeMatter(matterId, "cancelled");
  }

  bindRun(input: { matterId: string; taskId: string; runId: string }): ResidentTaskRunBinding {
    assertNonEmpty(input.taskId, "task id");
    assertNonEmpty(input.runId, "run id");
    const matter = this.requireNonTerminalMatter(input.matterId);
    if (matter.status !== "active") throw new Error("cannot bind a run to a suspended matter");
    if (matter.activeRunId !== null) throw new Error(`matter already owns run: ${matter.activeRunId}`);
    if (this.runBindings.has(input.runId)) throw new Error(`run already bound: ${input.runId}`);

    const binding: ResidentTaskRunBinding = {
      runId: input.runId,
      taskId: input.taskId,
      matterId: matter.id,
      semanticRevision: matter.semanticRevision,
    };
    this.runBindings.set(binding.runId, binding);
    matter.activeRunId = binding.runId;
    return structuredClone(binding);
  }

  runBinding(runId: string): ResidentTaskRunBinding | null {
    const binding = this.runBindings.get(runId);
    return binding ? structuredClone(binding) : null;
  }

  /**
   * Exact authority gate to be consulted before an execution run may create a
   * new World fact. Bookkeeping/retirement may happen later; authority loss is immediate.
   */
  canRunMutateWorld(runId: string): boolean {
    const binding = this.runBindings.get(runId);
    if (!binding) return false;
    const matter = this.matters.get(binding.matterId);
    if (!matter) return false;
    return matter.status === "active"
      && matter.activeRunId === binding.runId
      && matter.semanticRevision === binding.semanticRevision;
  }

  /**
   * Reconcile an already factual mechanical/World outcome back into resident evidence.
   * This does not resolve semantic meaning. The caller owns proof that the outcome
   * really occurred; this method only joins it to the exact resident run authority.
   */
  reconcileRunOutcome(outcome: ResidentRunOutcome): RunOutcomeReconciliationResult {
    validateRunOutcome(outcome);
    const binding = this.runBindings.get(outcome.runId);
    if (!binding) return { status: "rejected", reason: "run_missing" };
    const matter = this.matters.get(binding.matterId);
    if (!matter || matter.activeRunId !== binding.runId) {
      return { status: "rejected", reason: "run_missing" };
    }

    const resultEvidence = this.recordEvidence({
      id: `task-outcome:${binding.runId}:${outcome.tick}`,
      tick: outcome.tick,
      kind: "task_outcome",
      summary: `${outcome.status}: ${outcome.summary}`,
    });

    matter.lastOutcomeEvidenceId = resultEvidence.id;
    if (!isTerminal(matter.status)) {
      this.pinnedOutcomeEvidence.set(matter.id, structuredClone(resultEvidence));
    }
    matter.activeRunId = null;
    this.runBindings.delete(binding.runId);

    return {
      status: "recorded",
      binding: structuredClone(binding),
      evidence: resultEvidence,
      matter: structuredClone(matter),
    };
  }

  retireRun(runId: string): ResidentTaskRunBinding | null {
    const binding = this.runBindings.get(runId);
    if (!binding) return null;
    this.runBindings.delete(runId);
    const matter = this.matters.get(binding.matterId);
    if (matter?.activeRunId === runId) matter.activeRunId = null;
    return structuredClone(binding);
  }

  private terminalizeMatter(matterId: string, status: Extract<ResidentMatterStatus, "resolved" | "cancelled">): ResidentMatter {
    const matter = this.matters.get(matterId);
    if (!matter) throw new Error(`unknown matter: ${matterId}`);
    if (isTerminal(matter.status)) return structuredClone(matter);
    matter.status = status;
    matter.suspendedByMatterId = null;
    this.revokePendingForMatter(matter.id, "matter_terminal");
    // Keep activeRunId until explicit mechanical retirement/reconciliation.
    // canRunMutateWorld() already denies authority immediately because the matter is terminal.
    this.releaseLiveEvidencePins(matter.id);
    return structuredClone(matter);
  }

  private requireNonTerminalMatter(matterId: string): ResidentMatter {
    const matter = this.matters.get(matterId);
    if (!matter) throw new Error(`unknown matter: ${matterId}`);
    if (isTerminal(matter.status)) throw new Error(`matter is terminal: ${matterId}`);
    return matter;
  }

  private requireEvidence(evidenceId: string): ResidentKernelEvidence {
    const recent = this.recentEvidence.get(evidenceId);
    if (recent) return recent;
    for (const pins of [
      this.pinnedOriginEvidence,
      this.pinnedSemanticEvidence,
      this.pinnedOutcomeEvidence,
    ]) {
      for (const pinned of pins.values()) {
        if (pinned.id === evidenceId) return pinned;
      }
    }
    throw new Error(`unknown evidence: ${evidenceId}`);
  }

  private releaseLiveEvidencePins(matterId: string): void {
    this.pinnedOriginEvidence.delete(matterId);
    this.pinnedSemanticEvidence.delete(matterId);
    this.pinnedOutcomeEvidence.delete(matterId);
  }

  private revokePendingForMatter(matterId: string, reason: ResidentSemanticProposalRevocationReason): void {
    for (const ticket of [...this.pendingProposals.values()]) {
      if (ticket.matterId === matterId) this.revokeProposal(ticket, reason);
    }
  }

  private revokeProposal(ticket: ResidentSemanticProposalTicket, reason: ResidentSemanticProposalRevocationReason): void {
    const pending = this.pendingProposals.get(ticket.attemptId);
    if (!pending || !sameProposalTicket(pending, ticket)) return;
    this.pendingProposals.delete(ticket.attemptId);
    const matter = this.matters.get(ticket.matterId);
    this.recentRevocations.push({
      ticket: structuredClone(ticket),
      reason,
      matterStatus: matter?.status ?? null,
      currentSemanticRevision: matter?.semanticRevision ?? null,
    });
    while (this.recentRevocations.length > this.revocationLimit) this.recentRevocations.shift();
  }

  private findRecentRevocation(ticket: ResidentSemanticProposalTicket): ResidentSemanticProposalRevocation | null {
    for (let index = this.recentRevocations.length - 1; index >= 0; index -= 1) {
      const entry = this.recentRevocations[index]!;
      if (sameProposalTicket(entry.ticket, ticket)) return entry;
    }
    return null;
  }

  private wouldCreateSuspensionCycle(matterId: string, interruptingMatterId: string): boolean {
    let cursor: string | null = interruptingMatterId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === matterId) return true;
      if (visited.has(cursor)) return true;
      visited.add(cursor);
      const next = this.matters.get(cursor);
      cursor = next?.status === "suspended" ? next.suspendedByMatterId : null;
    }
    return false;
  }

  private trimRecentEvidence(): void {
    while (this.recentEvidence.size > this.recentEvidenceLimit) {
      const oldest = this.recentEvidence.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.recentEvidence.delete(oldest);
    }
  }
}

function isTerminal(status: ResidentMatterStatus): status is "resolved" | "cancelled" {
  return status === "resolved" || status === "cancelled";
}

function sameProposalTicket(a: ResidentSemanticProposalTicket, b: ResidentSemanticProposalTicket): boolean {
  return a.attemptId === b.attemptId
    && a.matterId === b.matterId
    && a.semanticRevision === b.semanticRevision
    && a.semanticEvidenceId === b.semanticEvidenceId;
}

function validateEvidence(evidence: ResidentKernelEvidence): void {
  assertNonEmpty(evidence.id, "evidence id");
  assertNonEmpty(evidence.kind, "evidence kind");
  assertNonEmpty(evidence.summary, "evidence summary");
  if (!Number.isSafeInteger(evidence.tick) || evidence.tick < 0) {
    throw new Error("evidence tick must be a non-negative safe integer");
  }
}

function validateRunOutcome(outcome: ResidentRunOutcome): void {
  assertNonEmpty(outcome.runId, "run outcome run id");
  assertNonEmpty(outcome.summary, "run outcome summary");
  if (!Number.isSafeInteger(outcome.tick) || outcome.tick < 0) {
    throw new Error("run outcome tick must be a non-negative safe integer");
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must be non-empty`);
}
