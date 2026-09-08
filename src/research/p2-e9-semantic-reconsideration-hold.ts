import {
  DeterministicExecutor,
  type ExecutorCommand,
  type ExecutorRetirement,
  type ExecutorRunCause,
  type ExecutorState,
  type ExecutorTask
} from "../execution/deterministic-executor";
import type { WorldActionResult, WorldSnapshot } from "../world/types";
import type {
  P2E0MatterState,
  P2E0ProposalCommitResult,
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
        | "task_not_semantically_superseded"
        | "run_already_held";
    };

export type P2E9HoldReleaseResult =
  | { status: "released"; hold: P2E9SemanticHold }
  | {
      status: "rejected";
      reason:
        | "hold_not_active"
        | "hold_identity_changed"
        | "semantic_reconsideration_unresolved"
        | "semantic_decision_not_current"
        | "matter_not_active"
        | "task_binding_changed"
        | "executor_run_changed";
    };

function sameTicket(a: P2E0ProposalTicket, b: P2E0ProposalTicket): boolean {
  return (
    a.proposalId === b.proposalId &&
    a.matterId === b.matterId &&
    a.semanticRevision === b.semanticRevision &&
    a.semanticEvidenceId === b.semanticEvidenceId
  );
}

function sameHold(a: P2E9SemanticHold, b: P2E9SemanticHold): boolean {
  return (
    a.matterId === b.matterId &&
    a.runId === b.runId &&
    a.taskSemanticRevision === b.taskSemanticRevision &&
    a.reconsiderationSemanticRevision === b.reconsiderationSemanticRevision &&
    a.semanticEvidenceId === b.semanticEvidenceId &&
    a.proposalId === b.proposalId
  );
}

function sameSemanticDecisionState(a: P2E0MatterState, b: P2E0MatterState): boolean {
  return (
    a.id === b.id &&
    a.semanticCourse === b.semanticCourse &&
    a.semanticRevision === b.semanticRevision &&
    a.latestSemanticEvidenceId === b.latestSemanticEvidenceId
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
 * Holding is deliberately narrower than cancellation or semantic resolution:
 * the executor remains running with the same run provenance and resident task
 * binding. Only command derivation for that exact run is suppressed, allowing
 * the canonical ExecutionDriver to keep advancing player/World processing.
 *
 * Release is also causal rather than temporal. The exact held run may resume
 * only after the caller presents an applied semantic decision whose semantic
 * state is still current for the same matter. Activity/focus fields such as
 * `status` and `suspendedByMatterId` are deliberately not semantic-decision
 * dependencies: a valid decision may land while the matter is suspended and
 * remain current after a legal resume. Release still independently requires the
 * matter to be active now and the exact original task binding/executor run to be
 * intact. The boundary does not infer from semantic text whether resumption is
 * desirable: presenting that current decision plus calling release is the
 * caller's explicit choice to resume this exact run.
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
    if (this.holdsByRunId.has(binding.runId)) {
      return { status: "rejected", reason: "run_already_held" };
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

  /**
   * Removes hold authority for a run that has already been mechanically
   * retired. This is not semantic release: there is no resumed task and no
   * semantic decision is granted authority. It is lifecycle cleanup owned by
   * the hold sidecar itself.
   */
  discardForRetiredRun(runId: number): P2E9SemanticHold | null {
    const hold = this.holdsByRunId.get(runId);
    if (!hold) return null;
    this.holdsByRunId.delete(runId);
    return cloneHold(hold);
  }

  release(
    resident: P2E0ResidentCausalKernel,
    executor: DeterministicExecutor,
    hold: P2E9SemanticHold,
    decision: P2E0ProposalCommitResult
  ): P2E9HoldReleaseResult {
    const active = this.holdsByRunId.get(hold.runId);
    if (!active) return { status: "rejected", reason: "hold_not_active" };
    if (!sameHold(active, hold)) {
      return { status: "rejected", reason: "hold_identity_changed" };
    }
    if (decision.status !== "applied") {
      return { status: "rejected", reason: "semantic_reconsideration_unresolved" };
    }

    const currentMatter = resident.matter(active.matterId);
    if (
      !currentMatter ||
      decision.matter.id !== active.matterId ||
      !sameSemanticDecisionState(decision.matter, currentMatter) ||
      currentMatter.semanticRevision <= active.reconsiderationSemanticRevision
    ) {
      return { status: "rejected", reason: "semantic_decision_not_current" };
    }
    if (currentMatter.status !== "active") {
      return { status: "rejected", reason: "matter_not_active" };
    }

    const binding = resident.taskBinding(active.runId);
    if (
      currentMatter.activeTaskRunId !== active.runId ||
      !binding ||
      binding.matterId !== active.matterId ||
      binding.semanticRevision !== active.taskSemanticRevision
    ) {
      return { status: "rejected", reason: "task_binding_changed" };
    }

    const executorState = executor.state();
    if (
      executorState.status !== "running" ||
      !executorState.run ||
      executorState.run.runId !== active.runId
    ) {
      return { status: "rejected", reason: "executor_run_changed" };
    }

    this.holdsByRunId.delete(active.runId);
    return { status: "released", hold: cloneHold(active) };
  }
}

/**
 * Adapter used only by the P2-E9 research probe so the canonical
 * ExecutionDriver and DeterministicExecutor remain untouched. It delegates all
 * real executor state transitions, but when the current exact run is held it
 * returns an empty command without calling `inner.next()`. The hold therefore
 * does not consume executor step budget or manufacture an executor outcome.
 *
 * Mechanical retirement is also delegated to the inner executor. Only after
 * exact retirement succeeds does this adapter discard any hold attached to that
 * retired run, preventing P2-E9 sidecar authority from outliving execution.
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

  override retireCurrentRun(expectedRunId: number): ExecutorRetirement | null {
    const retired = this.inner.retireCurrentRun(expectedRunId);
    if (!retired) return null;
    this.holds.discardForRetiredRun(retired.run.runId);
    return retired;
  }

  override state(): ExecutorState {
    return this.inner.state();
  }

  override next(snapshot: WorldSnapshot): ExecutorCommand {
    const state = this.inner.state();
    if (
      state.status === "running" &&
      state.run &&
      this.holds.holdForRun(state.run.runId)
    ) {
      return {};
    }
    return this.inner.next(snapshot);
  }

  override acceptActionResult(result: WorldActionResult): void {
    this.inner.acceptActionResult(result);
  }
}
