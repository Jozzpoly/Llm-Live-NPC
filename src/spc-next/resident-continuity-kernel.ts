import { assertSpcIdentifier, deriveSpcIdentifier } from "./identity-contract";
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
  /** Exact causal run provenance when this evidence records a factual run outcome. */
  sourceRunId?: string;
}

/**
 * Resident-owned structured meaning that may outlive any one provider response or
 * concrete execution method. Keep this deliberately narrower than provider-facing
 * cognition proposals: continuity owns durable semantic commitment, not transport,
 * prompting or executor details.
 */
export interface ResidentTravelRegionMatterIntent {
  kind: "travel_region";
  goal: string;
  targetRegionId: string;
}

export interface ResidentCommunicateActorMatterIntent {
  kind: "communicate_actor";
  goal: string;
  targetActorId: string;
  text: string;
}

export type ResidentMatterIntent =
  | ResidentTravelRegionMatterIntent
  | ResidentCommunicateActorMatterIntent;

export interface ResidentMatter {
  id: string;
  status: ResidentMatterStatus;
  originEvidenceId: string;
  semanticEvidenceId: string;
  semanticRevision: number;
  semanticCourse: string;
  semanticIntent: ResidentMatterIntent | null;
  suspendedByMatterId: string | null;
  activeRunId: string | null;
  lastOutcomeEvidenceId: string | null;
  /** Semantic revision of the exact run that produced the last factual outcome. */
  lastOutcomeSemanticRevision: number | null;
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

export interface ResidentContinuityKernelCommittedSnapshot {
  version: 1;
  recentEvidenceLimit: number;
  revocationLimit: number;
  recentEvidence: readonly ResidentKernelEvidence[];
  matters: readonly ResidentMatter[];
  pinnedOriginEvidence: readonly { matterId: string; evidence: ResidentKernelEvidence }[];
  pinnedSemanticEvidence: readonly { matterId: string; evidence: ResidentKernelEvidence }[];
  pinnedOutcomeEvidence: readonly { matterId: string; evidence: ResidentKernelEvidence }[];
  runBindings: readonly ResidentTaskRunBinding[];
  usedRunIds: readonly string[];
  proposalSequence: number;
}

export interface ResidentContinuityKernelOptions {
  recentEvidenceLimit?: number;
  revocationLimit?: number;
  committedSnapshot?: ResidentContinuityKernelCommittedSnapshot;
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
 *
 * Exact run ids are lifetime identities inside one kernel. Once successfully bound,
 * an id is never reusable even after reconciliation or retirement; provenance and
 * deferred execution references may therefore treat the id as one causal run rather
 * than a recyclable label.
 */
export class ResidentContinuityKernel {
  private readonly recentEvidence = new Map<string, ResidentKernelEvidence>();
  private readonly matters = new Map<string, ResidentMatter>();
  private readonly pinnedOriginEvidence = new Map<string, ResidentKernelEvidence>();
  private readonly pinnedSemanticEvidence = new Map<string, ResidentKernelEvidence>();
  private readonly pinnedOutcomeEvidence = new Map<string, ResidentKernelEvidence>();
  private readonly runBindings = new Map<string, ResidentTaskRunBinding>();
  private readonly usedRunIds = new Set<string>();
  private readonly pendingProposals = new Map<string, ResidentSemanticProposalTicket>();
  private readonly recentRevocations: ResidentSemanticProposalRevocation[] = [];
  private proposalSequence = 0;
  private readonly recentEvidenceLimit: number;
  private readonly revocationLimit: number;

  constructor(options: ResidentContinuityKernelOptions = {}) {
    const snapshot = options.committedSnapshot;
    if (snapshot && snapshot.version !== 1) {
      throw new Error("unsupported resident continuity committed snapshot version");
    }
    if (snapshot
      && options.recentEvidenceLimit !== undefined
      && options.recentEvidenceLimit !== snapshot.recentEvidenceLimit) {
      throw new Error("recentEvidenceLimit conflicts with committed snapshot");
    }
    if (snapshot
      && options.revocationLimit !== undefined
      && options.revocationLimit !== snapshot.revocationLimit) {
      throw new Error("revocationLimit conflicts with committed snapshot");
    }

    this.recentEvidenceLimit = options.recentEvidenceLimit
      ?? snapshot?.recentEvidenceLimit
      ?? DEFAULT_RECENT_EVIDENCE_LIMIT;
    this.revocationLimit = options.revocationLimit
      ?? snapshot?.revocationLimit
      ?? DEFAULT_REVOCATION_LIMIT;
    if (!Number.isInteger(this.recentEvidenceLimit) || this.recentEvidenceLimit < 1) {
      throw new Error("recentEvidenceLimit must be a positive integer");
    }
    if (!Number.isInteger(this.revocationLimit) || this.revocationLimit < 1) {
      throw new Error("revocationLimit must be a positive integer");
    }

    if (snapshot) this.restoreCommittedSnapshot(snapshot);
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
    /** Legacy text-only callers may omit this while they migrate. */
    semanticIntent?: ResidentMatterIntent | null;
  }): ResidentMatter {
    assertSpcIdentifier(input.id, "matter id");
    assertNonEmpty(input.semanticCourse, "semantic course");
    if (input.semanticIntent) validateMatterIntent(input.semanticIntent);
    if (this.matters.has(input.id)) throw new Error(`matter already exists: ${input.id}`);
    const evidence = this.requireEvidence(input.originEvidenceId);
    const matter: ResidentMatter = {
      id: input.id,
      status: "active",
      originEvidenceId: evidence.id,
      semanticEvidenceId: evidence.id,
      semanticRevision: 1,
      semanticCourse: input.semanticCourse,
      semanticIntent: input.semanticIntent ? structuredClone(input.semanticIntent) : null,
      suspendedByMatterId: null,
      activeRunId: null,
      lastOutcomeEvidenceId: null,
      lastOutcomeSemanticRevision: null,
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

  /**
   * Snapshot only committed resident continuity. In-flight semantic/provider tickets
   * are deliberately excluded: reconstruction must not revive volatile admission
   * authority. Exact run bindings are committed execution identity and may be restored
   * separately from volatile executor objects.
   */
  snapshotCommittedState(): ResidentContinuityKernelCommittedSnapshot {
    return {
      version: 1,
      recentEvidenceLimit: this.recentEvidenceLimit,
      revocationLimit: this.revocationLimit,
      recentEvidence: [...this.recentEvidence.values()].map((entry) => structuredClone(entry)),
      matters: [...this.matters.values()].map((matter) => structuredClone(matter)),
      pinnedOriginEvidence: snapshotEvidencePins(this.pinnedOriginEvidence),
      pinnedSemanticEvidence: snapshotEvidencePins(this.pinnedSemanticEvidence),
      pinnedOutcomeEvidence: snapshotEvidencePins(this.pinnedOutcomeEvidence),
      runBindings: [...this.runBindings.values()]
        .map((binding) => structuredClone(binding))
        .sort((left, right) => left.runId.localeCompare(right.runId)),
      usedRunIds: [...this.usedRunIds].sort((left, right) => left.localeCompare(right)),
      proposalSequence: this.proposalSequence,
    };
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
    decision: {
      semanticCourse: string;
      /** Omitted only for legacy text-only callers; structured matters should replace this atomically. */
      semanticIntent?: ResidentMatterIntent | null;
    },
  ): SemanticCommitResult {
    assertNonEmpty(decision.semanticCourse, "semantic course");
    if (decision.semanticIntent) validateMatterIntent(decision.semanticIntent);
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
    if (decision.semanticIntent !== undefined) {
      matter.semanticIntent = decision.semanticIntent ? structuredClone(decision.semanticIntent) : null;
    }
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
    assertSpcIdentifier(input.taskId, "task id");
    assertSpcIdentifier(input.runId, "run id");
    const matter = this.requireNonTerminalMatter(input.matterId);
    if (matter.status !== "active") throw new Error("cannot bind a run to a suspended matter");
    if (matter.activeRunId !== null) throw new Error(`matter already owns run: ${matter.activeRunId}`);
    if (this.runBindings.has(input.runId)) throw new Error(`run already bound: ${input.runId}`);
    if (this.usedRunIds.has(input.runId)) throw new Error(`run identity already used: ${input.runId}`);

    const binding: ResidentTaskRunBinding = {
      runId: input.runId,
      taskId: input.taskId,
      matterId: matter.id,
      semanticRevision: matter.semanticRevision,
    };
    this.usedRunIds.add(binding.runId);
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
      id: deriveSpcIdentifier("task-outcome", binding.runId, String(outcome.tick)),
      tick: outcome.tick,
      kind: "task_outcome",
      summary: `${outcome.status}: ${outcome.summary}`,
      sourceRunId: binding.runId,
    });

    matter.lastOutcomeEvidenceId = resultEvidence.id;
    matter.lastOutcomeSemanticRevision = binding.semanticRevision;
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

  private restoreCommittedSnapshot(snapshot: ResidentContinuityKernelCommittedSnapshot): void {
    validateCommittedSnapshot(snapshot, this.recentEvidenceLimit, this.revocationLimit);

    for (const evidence of snapshot.recentEvidence) {
      this.recentEvidence.set(evidence.id, structuredClone(evidence));
    }
    for (const matter of snapshot.matters) {
      this.matters.set(matter.id, structuredClone(matter));
    }
    restoreEvidencePins(this.pinnedOriginEvidence, snapshot.pinnedOriginEvidence, this.matters);
    restoreEvidencePins(this.pinnedSemanticEvidence, snapshot.pinnedSemanticEvidence, this.matters);
    restoreEvidencePins(this.pinnedOutcomeEvidence, snapshot.pinnedOutcomeEvidence, this.matters);
    for (const runId of snapshot.usedRunIds) this.usedRunIds.add(runId);
    for (const binding of snapshot.runBindings) {
      this.runBindings.set(binding.runId, structuredClone(binding));
    }
    this.proposalSequence = snapshot.proposalSequence;
  }
}

function snapshotEvidencePins(
  pins: ReadonlyMap<string, ResidentKernelEvidence>,
): { matterId: string; evidence: ResidentKernelEvidence }[] {
  return [...pins.entries()]
    .map(([matterId, evidence]) => ({ matterId, evidence: structuredClone(evidence) }))
    .sort((left, right) => left.matterId.localeCompare(right.matterId));
}

function restoreEvidencePins(
  target: Map<string, ResidentKernelEvidence>,
  pins: readonly { matterId: string; evidence: ResidentKernelEvidence }[],
  matters: ReadonlyMap<string, ResidentMatter>,
): void {
  const seen = new Set<string>();
  for (const pin of pins) {
    assertSpcIdentifier(pin.matterId, "snapshot evidence pin matter id");
    if (!matters.has(pin.matterId)) {
      throw new Error(`snapshot evidence pin references unknown matter: ${pin.matterId}`);
    }
    if (seen.has(pin.matterId)) {
      throw new Error(`duplicate snapshot evidence pin: ${pin.matterId}`);
    }
    seen.add(pin.matterId);
    validateEvidence(pin.evidence);
    target.set(pin.matterId, structuredClone(pin.evidence));
  }
}

function validateCommittedSnapshot(
  snapshot: ResidentContinuityKernelCommittedSnapshot,
  recentEvidenceLimit: number,
  revocationLimit: number,
): void {
  if (snapshot.version !== 1) {
    throw new Error("unsupported resident continuity committed snapshot version");
  }
  if (snapshot.recentEvidenceLimit !== recentEvidenceLimit
    || snapshot.revocationLimit !== revocationLimit) {
    throw new Error("resident continuity committed snapshot limits mismatch");
  }
  if (!Number.isSafeInteger(snapshot.proposalSequence) || snapshot.proposalSequence < 0) {
    throw new Error("snapshot proposalSequence must be a non-negative safe integer");
  }
  if (snapshot.recentEvidence.length > recentEvidenceLimit) {
    throw new Error("snapshot recent evidence exceeds configured bound");
  }

  const evidenceIds = new Set<string>();
  for (const evidence of snapshot.recentEvidence) {
    validateEvidence(evidence);
    if (evidenceIds.has(evidence.id)) {
      throw new Error(`duplicate snapshot evidence id: ${evidence.id}`);
    }
    evidenceIds.add(evidence.id);
  }

  const matterIds = new Set<string>();
  for (const matter of snapshot.matters) {
    validateSnapshotMatter(matter);
    if (matterIds.has(matter.id)) {
      throw new Error(`duplicate snapshot matter id: ${matter.id}`);
    }
    matterIds.add(matter.id);
  }

  const usedRunIds = new Set<string>();
  for (const runId of snapshot.usedRunIds) {
    assertSpcIdentifier(runId, "snapshot used run id");
    if (usedRunIds.has(runId)) {
      throw new Error(`duplicate snapshot used run id: ${runId}`);
    }
    usedRunIds.add(runId);
  }

  const bindingRunIds = new Set<string>();
  const boundMatterIds = new Set<string>();
  const bindingByMatterId = new Map<string, ResidentTaskRunBinding>();
  for (const binding of snapshot.runBindings) {
    validateSnapshotRunBinding(binding);
    if (bindingRunIds.has(binding.runId)) {
      throw new Error(`duplicate snapshot run binding: ${binding.runId}`);
    }
    if (boundMatterIds.has(binding.matterId)) {
      throw new Error(`snapshot matter has multiple active run bindings: ${binding.matterId}`);
    }
    if (!usedRunIds.has(binding.runId)) {
      throw new Error(`snapshot run binding is not lifetime-used: ${binding.runId}`);
    }
    const matter = snapshot.matters.find((candidate) => candidate.id === binding.matterId);
    if (!matter) {
      throw new Error(`snapshot run binding references unknown matter: ${binding.matterId}`);
    }
    if (matter.activeRunId !== binding.runId) {
      throw new Error(`snapshot run binding disagrees with matter activeRunId: ${binding.runId}`);
    }
    if (matter.semanticRevision !== binding.semanticRevision) {
      throw new Error(`snapshot run binding semantic revision is stale: ${binding.runId}`);
    }
    bindingRunIds.add(binding.runId);
    boundMatterIds.add(binding.matterId);
    bindingByMatterId.set(binding.matterId, binding);
  }

  for (const matter of snapshot.matters) {
    if (matter.activeRunId === null) continue;
    const binding = bindingByMatterId.get(matter.id);
    if (!binding || binding.runId !== matter.activeRunId) {
      throw new Error(`snapshot active matter lacks exact run binding: ${matter.id}`);
    }
  }
}

function validateSnapshotRunBinding(binding: ResidentTaskRunBinding): void {
  assertSpcIdentifier(binding.runId, "snapshot run binding run id");
  assertSpcIdentifier(binding.taskId, "snapshot run binding task id");
  assertSpcIdentifier(binding.matterId, "snapshot run binding matter id");
  if (!Number.isSafeInteger(binding.semanticRevision) || binding.semanticRevision < 1) {
    throw new Error("snapshot run binding semanticRevision must be a positive safe integer");
  }
}

function validateSnapshotMatter(matter: ResidentMatter): void {
  assertSpcIdentifier(matter.id, "snapshot matter id");
  assertSpcIdentifier(matter.originEvidenceId, "snapshot matter origin evidence id");
  assertSpcIdentifier(matter.semanticEvidenceId, "snapshot matter semantic evidence id");
  assertNonEmpty(matter.semanticCourse, "snapshot matter semantic course");
  if (!Number.isSafeInteger(matter.semanticRevision) || matter.semanticRevision < 1) {
    throw new Error("snapshot matter semanticRevision must be a positive safe integer");
  }
  if (!["active", "suspended", "resolved", "cancelled"].includes(matter.status)) {
    throw new Error(`invalid snapshot matter status: ${matter.status}`);
  }
  if (matter.semanticIntent) validateMatterIntent(matter.semanticIntent);
  if (matter.suspendedByMatterId !== null) {
    assertSpcIdentifier(matter.suspendedByMatterId, "snapshot suspendedByMatterId");
  }
  if (matter.activeRunId !== null) {
    assertSpcIdentifier(matter.activeRunId, "snapshot activeRunId");
  }
  if (matter.lastOutcomeEvidenceId !== null) {
    assertSpcIdentifier(matter.lastOutcomeEvidenceId, "snapshot last outcome evidence id");
  }
  if (matter.lastOutcomeSemanticRevision !== null
    && (!Number.isSafeInteger(matter.lastOutcomeSemanticRevision)
      || matter.lastOutcomeSemanticRevision < 1
      || matter.lastOutcomeSemanticRevision > matter.semanticRevision)) {
    throw new Error("invalid snapshot lastOutcomeSemanticRevision");
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

function validateMatterIntent(intent: ResidentMatterIntent): void {
  assertNonEmpty(intent.goal, "matter intent goal");
  switch (intent.kind) {
    case "travel_region":
      assertNonEmpty(intent.targetRegionId, "matter intent target region id");
      return;
    case "communicate_actor":
      assertNonEmpty(intent.targetActorId, "matter intent target actor id");
      assertNonEmpty(intent.text, "matter intent message text");
      return;
  }
}

function validateEvidence(evidence: ResidentKernelEvidence): void {
  assertSpcIdentifier(evidence.id, "evidence id");
  if (evidence.sourceRunId !== undefined) {
    assertSpcIdentifier(evidence.sourceRunId, "evidence sourceRunId");
  }
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