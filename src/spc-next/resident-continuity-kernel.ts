export type ResidentMatterStatus = "active" | "suspended" | "resolved" | "cancelled";
export type ResidentRunOutcomeStatus = "succeeded" | "failed" | "blocked";

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
}

const DEFAULT_RECENT_EVIDENCE_LIMIT = 64;

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
  private readonly pinnedSemanticEvidence = new Map<string, ResidentKernelEvidence>();
  private readonly runBindings = new Map<string, ResidentTaskRunBinding>();
  private proposalSequence = 0;
  private readonly recentEvidenceLimit: number;

  constructor(options: ResidentContinuityKernelOptions = {}) {
    this.recentEvidenceLimit = options.recentEvidenceLimit ?? DEFAULT_RECENT_EVIDENCE_LIMIT;
    if (!Number.isInteger(this.recentEvidenceLimit) || this.recentEvidenceLimit < 1) {
      throw new Error("recentEvidenceLimit must be a positive integer");
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
    this.pinnedSemanticEvidence.set(matter.id, structuredClone(evidence));
    return structuredClone(matter);
  }

  matter(id: string): ResidentMatter | null {
    const matter = this.matters.get(id);
    return matter ? structuredClone(matter) : null;
  }

  semanticEvidence(matterId: string): ResidentKernelEvidence | null {
    const evidence = this.pinnedSemanticEvidence.get(matterId);
    return evidence ? structuredClone(evidence) : null;
  }

  recentEvidenceSnapshot(): ResidentKernelEvidence[] {
    return [...this.recentEvidence.values()].map((evidence) => structuredClone(evidence));
  }

  advanceSemanticContext(matterId: string, evidenceId: string): ResidentMatter {
    const matter = this.requireNonTerminalMatter(matterId);
    const evidence = this.requireEvidence(evidenceId);
    matter.semanticRevision += 1;
    matter.semanticEvidenceId = evidence.id;
    this.pinnedSemanticEvidence.set(matter.id, structuredClone(evidence));
    return structuredClone(matter);
  }

  beginSemanticProposal(matterId: string): ResidentSemanticProposalTicket {
    const matter = this.requireNonTerminalMatter(matterId);
    return {
      attemptId: `proposal:${matterId}:${this.proposalSequence++}`,
      matterId,
      semanticRevision: matter.semanticRevision,
      semanticEvidenceId: matter.semanticEvidenceId,
    };
  }

  commitSemanticProposal(
    ticket: ResidentSemanticProposalTicket,
    decision: { semanticCourse: string },
  ): SemanticCommitResult {
    assertNonEmpty(decision.semanticCourse, "semantic course");
    const matter = this.matters.get(ticket.matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (isTerminal(matter.status)) return { status: "rejected", reason: "matter_terminal" };
    if (
      matter.semanticRevision !== ticket.semanticRevision
      || matter.semanticEvidenceId !== ticket.semanticEvidenceId
    ) {
      return { status: "rejected", reason: "semantic_authority_stale" };
    }

    // A successful semantic settlement creates a new authority revision. This
    // simultaneously makes sibling provider attempts and older grounded runs stale.
    matter.semanticRevision += 1;
    matter.semanticCourse = decision.semanticCourse;
    return { status: "applied", matter: structuredClone(matter) };
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
    // Keep activeRunId until explicit mechanical retirement/reconciliation.
    // canRunMutateWorld() already denies authority immediately because the matter is terminal.
    this.pinnedSemanticEvidence.delete(matter.id);
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
    for (const pinned of this.pinnedSemanticEvidence.values()) {
      if (pinned.id === evidenceId) return pinned;
    }
    throw new Error(`unknown evidence: ${evidenceId}`);
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
