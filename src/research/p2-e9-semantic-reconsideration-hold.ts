import {
  DeterministicExecutor,
  type ExecutorCommand,
  type ExecutorRunCause,
  type ExecutorState,
  type ExecutorTask
} from "../execution/deterministic-executor";
import type { WorldActionResult, WorldSnapshot } from "../world/types";
import type {
  P2E0ProposalTicket,
  P2E0ResidentCausalKernel
} from "./p2-e0-resident-causal-kernel";

export interface P2E9SemanticHold {
  matterId: string;
  runId: number;
  taskSemanticRevision: number;
  reconsiderationSemanticRevision: number;
  semanticEvidenceId: string;
  proposalId: number;
}

export type P2E9HoldArmResult =
  | { status: "held"; hold: P2E9SemanticHold }
  | {
      status: "rejected";
      reason:
        | "proposal_not_pending"
        | "matter_missing"
        | "matter_not_active"
        | "semantic_dependency_changed"
        | "no_active_task"
        | "task_binding_missing"
        | "executor_not_running"
        | "executor_run_mismatch"
        | "task_not_semantically_superseded";
    };

function sameTicket(a: P2E0ProposalTicket, b: P2E0ProposalTicket): boolean {
  return (
    a.proposalId === b.proposalId &&
    a.matterId === b.matterId &&
    a.semanticRevision === b.semanticRevision &&
    a.semanticEvidenceId === b.semanticEvidenceId
  );
}

function cloneHold(hold: P2E9SemanticHold): P2E9SemanticHold {
  return { ...hold };
}

/**
 * P2-E9 research apparatus only.
 *
 * Establishes exact causal ownership for a prospective execution hold. A hold
 * can only be armed for the currently running executor run already bound to the
 * same active matter, after that matter has gained newer explicitly attributed
 * semantic context and an exact proposal ticket for reconsideration exists.
 *
 * The first RED deliberately does not yet make the execution adapter suppress
 * commands. That leaves the current failure mode observable end-to-end: even
 * though a semantically superseded run is causally identified as held, the old
 * mechanical action can still cross into World while reconsideration is open.
 */
export class P2E9SemanticReconsiderationHoldBoundary {
  private readonly holdsByRunId = new Map<number, P2E9SemanticHold>();

  arm(
    resident: P2E0ResidentCausalKernel,
    executor: DeterministicExecutor,
    ticket: P2E0ProposalTicket
  ): P2E9HoldArmResult {
    const pending = resident
      .pendingSemanticProposals()
      .find((candidate) => candidate.proposalId === ticket.proposalId);
    if (!pending || !sameTicket(pending, ticket)) {
      return { status: "rejected", reason: "proposal_not_pending" };
    }

    const matter = resident.matter(ticket.matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (matter.status !== "active") {
      return { status: "rejected", reason: "matter_not_active" };
    }
    if (
      matter.semanticRevision !== ticket.semanticRevision ||
      matter.latestSemanticEvidenceId !== ticket.semanticEvidenceId
    ) {
      return { status: "rejected", reason: "semantic_dependency_changed" };
    }
    if (matter.activeTaskRunId === null) {
      return { status: "rejected", reason: "no_active_task" };
    }

    const binding = resident.taskBinding(matter.activeTaskRunId);
    if (!binding || binding.matterId !== matter.id) {
      return { status: "rejected", reason: "task_binding_missing" };
    }

    const executorState = executor.state();
    if (executorState.status !== "running" || !executorState.run) {
      return { status: "rejected", reason: "executor_not_running" };
    }
    if (executorState.run.runId !== binding.runId) {
      return { status: "rejected", reason: "executor_run_mismatch" };
    }
    if (binding.semanticRevision >= matter.semanticRevision) {
      return { status: "rejected", reason: "task_not_semantically_superseded" };
    }

    const hold: P2E9SemanticHold = {
      matterId: matter.id,
      runId: binding.runId,
      taskSemanticRevision: binding.semanticRevision,
      reconsiderationSemanticRevision: ticket.semanticRevision,
      semanticEvidenceId: ticket.semanticEvidenceId,
      proposalId: ticket.proposalId
    };
    this.holdsByRunId.set(hold.runId, hold);
    return { status: "held", hold: cloneHold(hold) };
  }

  holdForRun(runId: number): P2E9SemanticHold | null {
    const hold = this.holdsByRunId.get(runId);
    return hold ? cloneHold(hold) : null;
  }
}

/**
 * Adapter used only by the P2-E9 research probe so the canonical
 * ExecutionDriver can remain untouched. The initial RED is intentionally a
 * transparent delegate even for an armed hold; the follow-up implementation
 * must suppress only the exact held run's command derivation while continuing
 * to delegate state/start/action-result semantics to the real executor.
 */
export class P2E9HoldAwareExecutor extends DeterministicExecutor {
  constructor(
    private readonly inner: DeterministicExecutor,
    private readonly holds: P2E9SemanticReconsiderationHoldBoundary
  ) {
    super();
  }

  override start(task: ExecutorTask, cause: ExecutorRunCause = { kind: "unattributed" }): boolean {
    return this.inner.start(task, cause);
  }

  override state(): ExecutorState {
    return this.inner.state();
  }

  override next(snapshot: WorldSnapshot): ExecutorCommand {
    void this.holds;
    return this.inner.next(snapshot);
  }

  override acceptActionResult(result: WorldActionResult): void {
    this.inner.acceptActionResult(result);
  }
}
