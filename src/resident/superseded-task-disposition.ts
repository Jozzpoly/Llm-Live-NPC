import type {
  DeterministicExecutor,
  ExecutorRunCause
} from "../execution/deterministic-executor";
import type {
  P2E0MatterState,
  P2E0ProposalCommitResult,
  P2E0ResidentCausalKernel
} from "../research/p2-e0-resident-causal-kernel";

export interface SupersededTaskDispositionRecord {
  matterId: string;
  taskId: string;
  runId: number;
  taskSemanticRevision: number;
  currentSemanticRevision: number;
  disposition: "retired";
  reason: "semantic_revision_superseded";
  executorCause: ExecutorRunCause;
  stepsUsed: number;
}

export type SupersededTaskDispositionResult =
  | { status: "disposed"; record: SupersededTaskDispositionRecord }
  | {
      status: "rejected";
      reason:
        | "matter_missing"
        | "matter_not_active"
        | "matter_has_no_active_task"
        | "task_binding_missing"
        | "semantic_reconsideration_unresolved"
        | "semantic_decision_not_current"
        | "task_not_superseded"
        | "executor_run_mismatch"
        | "executor_not_running";
    };

function cloneCause(cause: ExecutorRunCause): ExecutorRunCause {
  switch (cause.kind) {
    case "manual":
      return { kind: "manual" };
    case "cognition":
      return cause.sessionId === undefined
        ? { kind: "cognition" }
        : { kind: "cognition", sessionId: cause.sessionId, cycleId: cause.cycleId };
    case "unattributed":
      return { kind: "unattributed" };
  }
}

function sameSemanticDecisionState(a: P2E0MatterState, b: P2E0MatterState): boolean {
  return (
    a.id === b.id &&
    a.semanticCourse === b.semanticCourse &&
    a.semanticRevision === b.semanticRevision &&
    a.latestSemanticEvidenceId === b.latestSemanticEvidenceId
  );
}

/**
 * Product-adjacent lifecycle boundary earned by First Presence composition.
 *
 * A still-active semantic matter may change meaning while its old mechanical
 * task is already running. This boundary retires exactly that old run only when
 * the resident binding proves it was grounded from an older semantic revision
 * and the caller presents the exact applied semantic decision that is still the
 * current decision state for the same matter.
 *
 * Requiring current applied decision evidence prevents mere evidence attribution
 * from becoming authority to destroy a task before reconsideration has actually
 * decided what the resident now means to do.
 *
 * It deliberately does not mark the task succeeded/failed and does not
 * terminalize the matter. The operation only removes a mechanically obsolete
 * attempt so the same live matter can ground a new task from its current
 * semantic revision.
 */
export class SupersededTaskDispositionBoundary {
  dispose(
    resident: P2E0ResidentCausalKernel,
    executor: DeterministicExecutor,
    matterId: string,
    decision: P2E0ProposalCommitResult
  ): SupersededTaskDispositionResult {
    const matter = resident.matter(matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (matter.status !== "active") {
      return { status: "rejected", reason: "matter_not_active" };
    }
    if (matter.activeTaskRunId === null) {
      return { status: "rejected", reason: "matter_has_no_active_task" };
    }

    const runId = matter.activeTaskRunId;
    const binding = resident.taskBinding(runId);
    if (!binding || binding.matterId !== matter.id) {
      return { status: "rejected", reason: "task_binding_missing" };
    }
    if (decision.status !== "applied") {
      return { status: "rejected", reason: "semantic_reconsideration_unresolved" };
    }
    if (
      decision.matter.id !== matter.id ||
      !sameSemanticDecisionState(decision.matter, matter)
    ) {
      return { status: "rejected", reason: "semantic_decision_not_current" };
    }
    if (binding.semanticRevision >= matter.semanticRevision) {
      return { status: "rejected", reason: "task_not_superseded" };
    }

    const executorState = executor.state();
    if (!executorState.run || executorState.run.runId !== runId) {
      return { status: "rejected", reason: "executor_run_mismatch" };
    }
    if (executorState.status !== "running" || !executorState.task) {
      return { status: "rejected", reason: "executor_not_running" };
    }

    const retired = executor.retireCurrentRun(runId);
    if (!retired) {
      throw new Error(
        "Superseded task executor run changed after synchronous disposition preflight."
      );
    }

    const released = resident.disposeSupersededTaskBinding(matter.id, runId);
    if (!released) {
      throw new Error(
        "Superseded task resident binding changed after synchronous disposition preflight."
      );
    }

    return {
      status: "disposed",
      record: {
        matterId: matter.id,
        taskId: released.taskId,
        runId,
        taskSemanticRevision: released.semanticRevision,
        currentSemanticRevision: matter.semanticRevision,
        disposition: "retired",
        reason: "semantic_revision_superseded",
        executorCause: cloneCause(retired.run.cause),
        stepsUsed: retired.stepsUsed
      }
    };
  }
}
