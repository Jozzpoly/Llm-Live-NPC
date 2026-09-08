export type P2E0EvidenceKind = "observed" | "heard" | "task_outcome" | "elapsed";

export type P2E0EvidenceSource =
  | { kind: "actor"; actorId: string; occurrenceId?: string }
  | { kind: "world"; occurrenceId?: string }
  | { kind: "task"; runId: number }
  | { kind: "clock" };

export interface P2E0EvidenceRecord {
  id: string;
  seq: number;
  kind: P2E0EvidenceKind;
  source: P2E0EvidenceSource;
  summary: string;
  matterId: string | null;
}

export type P2E0MatterStatus = "active" | "suspended" | "resolved" | "cancelled";

export interface P2E0MatterState {
  id: string;
  originEvidenceId: string;
  semanticCourse: string;
  semanticRevision: number;
  latestSemanticEvidenceId: string;
  status: P2E0MatterStatus;
  suspendedByMatterId: string | null;
  activeTaskRunId: number | null;
  lastTaskOutcomeEvidenceId: string | null;
}

export interface P2E0ProposalTicket {
  proposalId: number;
  matterId: string;
  semanticRevision: number;
  semanticEvidenceId: string;
}

export type P2E0ProposalCommitResult =
  | { status: "applied"; matter: P2E0MatterState }
  | {
      status: "stale";
      reason: "proposal_not_pending" | "matter_missing" | "matter_terminal" | "semantic_revision_changed";
    };

export interface P2E0TaskBinding {
  matterId: string;
  taskId: string;
  runId: number;
  semanticRevision: number;
}

export interface P2E0TaskOutcomeInput {
  runId: number;
  status: "succeeded" | "failed";
  code: string;
  message: string;
}

export interface P2E0EvidenceInput {
  kind: Exclude<P2E0EvidenceKind, "task_outcome">;
  source: Exclude<P2E0EvidenceSource, { kind: "task" }>;
  summary: string;
  matterId?: string | null;
}

function cloneSource(source: P2E0EvidenceSource): P2E0EvidenceSource {
  switch (source.kind) {
    case "actor":
      return source.occurrenceId === undefined
        ? { kind: "actor", actorId: source.actorId }
        : { kind: "actor", actorId: source.actorId, occurrenceId: source.occurrenceId };
    case "world":
      return source.occurrenceId === undefined
        ? { kind: "world" }
        : { kind: "world", occurrenceId: source.occurrenceId };
    case "task":
      return { kind: "task", runId: source.runId };
    case "clock":
      return { kind: "clock" };
  }
}

function cloneEvidence(record: P2E0EvidenceRecord): P2E0EvidenceRecord {
  return {
    ...record,
    source: cloneSource(record.source)
  };
}

function cloneMatter(matter: P2E0MatterState): P2E0MatterState {
  return { ...matter };
}

function cloneTicket(ticket: P2E0ProposalTicket): P2E0ProposalTicket {
  return { ...ticket };
}

function cloneBinding(binding: P2E0TaskBinding): P2E0TaskBinding {
  return { ...binding };
}

function isTerminal(status: P2E0MatterStatus): boolean {
  return status === "resolved" || status === "cancelled";
}

/**
 * P2-E0 research specimen only.
 *
 * This class deliberately does not implement a general mind, planner, belief
 * database, memory system, World integration or LLM client. It isolates the
 * causal contracts selected by Pass 2 so they can be falsified before product
 * architecture grows around them.
 *
 * Crucially, three clocks are separate:
 * - evidence sequence: factual/experienced occurrences can keep arriving;
 * - semanticRevision: only explicitly relevant semantic context advances it;
 * - task/run state: mechanical execution may change without rewriting meaning.
 *
 * A slow semantic proposal depends on the semantic revision of one matter, not
 * on a global resident/World version. This makes unrelated physical change safe
 * while still allowing later semantic input for the same matter to stale it.
 */
export class P2E0ResidentCausalKernel {
  private readonly matters = new Map<string, P2E0MatterState>();
  private readonly pendingProposals = new Map<number, P2E0ProposalTicket>();
  private readonly taskBindings = new Map<number, P2E0TaskBinding>();
  private readonly evidence: P2E0EvidenceRecord[] = [];
  private nextEvidenceSeq = 1;
  private nextProposalId = 1;

  constructor(private readonly recentEvidenceLimit = 32) {
    if (!Number.isInteger(recentEvidenceLimit) || recentEvidenceLimit <= 0) {
      throw new Error(`P2-E0 recent evidence limit must be a positive integer: ${recentEvidenceLimit}`);
    }
  }

  recordEvidence(input: P2E0EvidenceInput): P2E0EvidenceRecord {
    const matterId = input.matterId ?? null;
    if (matterId !== null && !this.matters.has(matterId)) {
      throw new Error(`P2-E0 evidence references missing matter: ${matterId}`);
    }

    return this.appendEvidence({
      kind: input.kind,
      source: input.source,
      summary: input.summary,
      matterId
    });
  }

  openMatter(input: {
    id: string;
    originEvidenceId: string;
    semanticCourse: string;
  }): P2E0MatterState {
    if (this.matters.has(input.id)) throw new Error(`Duplicate P2-E0 matter id: ${input.id}`);
    this.requireRecentEvidence(input.originEvidenceId);

    const matter: P2E0MatterState = {
      id: input.id,
      originEvidenceId: input.originEvidenceId,
      semanticCourse: input.semanticCourse,
      semanticRevision: 1,
      latestSemanticEvidenceId: input.originEvidenceId,
      status: "active",
      suspendedByMatterId: null,
      activeTaskRunId: null,
      lastTaskOutcomeEvidenceId: null
    };
    this.matters.set(matter.id, matter);
    return cloneMatter(matter);
  }

  matter(id: string): P2E0MatterState | null {
    const matter = this.matters.get(id);
    return matter ? cloneMatter(matter) : null;
  }

  recentEvidence(): P2E0EvidenceRecord[] {
    return this.evidence.map(cloneEvidence);
  }

  /**
   * Explicitly advances only this matter's semantic dependency clock.
   *
   * Recording evidence alone does not do this: a physical observation may be
   * relevant to later task grounding without invalidating a still-correct
   * semantic interpretation. The caller that owns attention/reconsideration
   * decides when an evidence item materially advances semantic context.
   */
  advanceSemanticContext(matterId: string, evidenceId: string): P2E0MatterState {
    const matter = this.requireMatter(matterId);
    if (isTerminal(matter.status)) {
      throw new Error(`Cannot advance terminal P2-E0 matter: ${matterId}`);
    }
    const evidence = this.requireRecentEvidence(evidenceId);
    if (evidence.matterId !== matterId) {
      throw new Error(`P2-E0 semantic evidence ${evidenceId} is not scoped to matter ${matterId}.`);
    }

    matter.semanticRevision += 1;
    matter.latestSemanticEvidenceId = evidenceId;
    return cloneMatter(matter);
  }

  beginSemanticProposal(matterId: string): P2E0ProposalTicket {
    const matter = this.requireMatter(matterId);
    if (isTerminal(matter.status)) {
      throw new Error(`Cannot start proposal for terminal P2-E0 matter: ${matterId}`);
    }

    const ticket: P2E0ProposalTicket = {
      proposalId: this.nextProposalId++,
      matterId,
      semanticRevision: matter.semanticRevision,
      semanticEvidenceId: matter.latestSemanticEvidenceId
    };
    this.pendingProposals.set(ticket.proposalId, ticket);
    return cloneTicket(ticket);
  }

  pendingSemanticProposals(): P2E0ProposalTicket[] {
    return [...this.pendingProposals.values()]
      .sort((a, b) => a.proposalId - b.proposalId)
      .map(cloneTicket);
  }

  commitSemanticProposal(
    ticket: P2E0ProposalTicket,
    proposal: { semanticCourse: string }
  ): P2E0ProposalCommitResult {
    const pending = this.pendingProposals.get(ticket.proposalId);
    if (
      !pending ||
      pending.matterId !== ticket.matterId ||
      pending.semanticRevision !== ticket.semanticRevision ||
      pending.semanticEvidenceId !== ticket.semanticEvidenceId
    ) {
      return { status: "stale", reason: "proposal_not_pending" };
    }

    this.pendingProposals.delete(ticket.proposalId);
    const matter = this.matters.get(ticket.matterId);
    if (!matter) return { status: "stale", reason: "matter_missing" };
    if (isTerminal(matter.status)) return { status: "stale", reason: "matter_terminal" };
    if (matter.semanticRevision !== ticket.semanticRevision) {
      return { status: "stale", reason: "semantic_revision_changed" };
    }

    matter.semanticCourse = proposal.semanticCourse;
    matter.semanticRevision += 1;
    return { status: "applied", matter: cloneMatter(matter) };
  }

  suspendMatter(matterId: string, interruptedByMatterId: string): P2E0MatterState {
    const matter = this.requireMatter(matterId);
    const interrupt = this.requireMatter(interruptedByMatterId);
    if (matter.id === interrupt.id) throw new Error("A P2-E0 matter cannot interrupt itself.");
    if (matter.status !== "active") {
      throw new Error(`Only active P2-E0 matter can be suspended: ${matterId}`);
    }
    if (interrupt.status !== "active") {
      throw new Error(`Only active P2-E0 matter can be an interrupt: ${interruptedByMatterId}`);
    }

    matter.status = "suspended";
    matter.suspendedByMatterId = interruptedByMatterId;
    return cloneMatter(matter);
  }

  canResumeMatter(matterId: string): boolean {
    const matter = this.requireMatter(matterId);
    if (matter.status !== "suspended" || matter.suspendedByMatterId === null) return false;
    const interrupt = this.matters.get(matter.suspendedByMatterId);
    return interrupt !== undefined && isTerminal(interrupt.status);
  }

  resumeMatter(matterId: string): boolean {
    if (!this.canResumeMatter(matterId)) return false;
    const matter = this.requireMatter(matterId);
    matter.status = "active";
    matter.suspendedByMatterId = null;
    return true;
  }

  resolveMatter(matterId: string): P2E0MatterState {
    const matter = this.requireMatter(matterId);
    matter.status = "resolved";
    matter.suspendedByMatterId = null;
    return cloneMatter(matter);
  }

  cancelMatter(matterId: string): P2E0MatterState {
    const matter = this.requireMatter(matterId);
    matter.status = "cancelled";
    matter.suspendedByMatterId = null;
    return cloneMatter(matter);
  }

  bindTask(matterId: string, task: { taskId: string; runId: number }): P2E0TaskBinding {
    const matter = this.requireMatter(matterId);
    if (isTerminal(matter.status)) throw new Error(`Cannot bind task to terminal P2-E0 matter: ${matterId}`);
    if (matter.activeTaskRunId !== null) {
      throw new Error(`P2-E0 matter already has active task run: ${matterId}`);
    }
    if (this.taskBindings.has(task.runId)) {
      throw new Error(`Duplicate P2-E0 task run id: ${task.runId}`);
    }

    const binding: P2E0TaskBinding = {
      matterId,
      taskId: task.taskId,
      runId: task.runId,
      semanticRevision: matter.semanticRevision
    };
    this.taskBindings.set(task.runId, binding);
    matter.activeTaskRunId = task.runId;
    return cloneBinding(binding);
  }

  taskBinding(runId: number): P2E0TaskBinding | null {
    const binding = this.taskBindings.get(runId);
    return binding ? cloneBinding(binding) : null;
  }

  recordTaskOutcome(input: P2E0TaskOutcomeInput): P2E0EvidenceRecord {
    const binding = this.taskBindings.get(input.runId);
    if (!binding) throw new Error(`P2-E0 task outcome has no causal binding: ${input.runId}`);
    const matter = this.requireMatter(binding.matterId);

    const evidence = this.appendEvidence({
      kind: "task_outcome",
      source: { kind: "task", runId: input.runId },
      summary: `${input.status} · ${input.code} · ${input.message}`,
      matterId: binding.matterId
    });

    this.taskBindings.delete(input.runId);
    if (matter.activeTaskRunId === input.runId) matter.activeTaskRunId = null;
    matter.lastTaskOutcomeEvidenceId = evidence.id;

    // Deliberately no matter resolution and no semanticRevision bump here.
    // The factual outcome is evidence. A later policy/cognition step may decide
    // that it satisfies or semantically changes the matter.
    return evidence;
  }

  private appendEvidence(input: {
    kind: P2E0EvidenceKind;
    source: P2E0EvidenceSource;
    summary: string;
    matterId: string | null;
  }): P2E0EvidenceRecord {
    const seq = this.nextEvidenceSeq++;
    const record: P2E0EvidenceRecord = {
      id: `evidence.${seq}`,
      seq,
      kind: input.kind,
      source: cloneSource(input.source),
      summary: input.summary,
      matterId: input.matterId
    };
    this.evidence.push(record);
    if (this.evidence.length > this.recentEvidenceLimit) {
      this.evidence.splice(0, this.evidence.length - this.recentEvidenceLimit);
    }
    return cloneEvidence(record);
  }

  private requireMatter(id: string): P2E0MatterState {
    const matter = this.matters.get(id);
    if (!matter) throw new Error(`P2-E0 matter not found: ${id}`);
    return matter;
  }

  private requireRecentEvidence(id: string): P2E0EvidenceRecord {
    const evidence = this.evidence.find((record) => record.id === id);
    if (!evidence) throw new Error(`P2-E0 recent evidence not found: ${id}`);
    return evidence;
  }
}
