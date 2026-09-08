import type {
  DeterministicExecutor,
  ExecutorRunCause
} from "../execution/deterministic-executor";
import type {
  P2E0MatterStatus,
  P2E0ResidentCausalKernel
} from "./p2-e0-resident-causal-kernel";

export type P2E11TerminalMatterStatus = Extract<P2E0MatterStatus, "resolved" | "cancelled">;
export type P2E11TaskDispositionReason = "matter_resolved" | "matter_cancelled";

export interface P2E11TaskDispositionRecord {
  seq: number;
  matterId: string;
  matterStatus: P2E11TerminalMatterStatus;
  taskId: string;
  runId: number;
  semanticRevision: number;
  disposition: "retired";
  reason: P2E11TaskDispositionReason;
  executorCause: ExecutorRunCause;
  stepsUsed: number;
}

export type P2E11DispositionResult =
  | { status: "disposed"; record: P2E11TaskDispositionRecord }
  | { status: "noop"; reason: "matter_has_no_active_task" }
  | {
      status: "rejected";
      reason:
        | "matter_missing"
        | "matter_not_terminal"
        | "task_binding_missing"
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

function cloneRecord(record: P2E11TaskDispositionRecord): P2E11TaskDispositionRecord {
  return {
    ...record,
    executorCause: cloneCause(record.executorCause)
  };
}

function isTerminal(status: P2E0MatterStatus): status is P2E11TerminalMatterStatus {
  return status === "resolved" || status === "cancelled";
}

/**
 * P2-E11 research apparatus only.
 *
 * Terminal semantic state and mechanical execution are separate clocks. This
 * boundary explicitly disposes the exact running task causally owned by a
 * terminal matter without pretending that retirement was a World success or
 * failure.
 *
 * Both sides are preflighted before mutation:
 *
 * matter -> activeTaskRunId -> resident binding -> exact running executor run.
 *
 * A run that already reached a factual executor terminal state is deliberately
 * rejected here so its still-live binding remains available to P2-E7 outcome
 * reconciliation. Retirement is only for a genuinely still-running task whose
 * semantic owner has become terminal.
 *
 * Disposition records are kept in a small bounded research ledger rather than
 * being promoted into P2-E0 grounded evidence yet. That ontology/observability
 * choice remains open while the causal lifecycle itself is under attack.
 */
export class P2E11TerminalMatterTaskDispositionBoundary {
  private readonly recordsValue: P2E11TaskDispositionRecord[] = [];
  private nextSeq = 1;

  constructor(private readonly recordLimit = 32) {
    if (!Number.isInteger(recordLimit) || recordLimit <= 0) {
      throw new Error(`P2-E11 disposition record limit must be a positive integer: ${recordLimit}`);
    }
  }

  dispose(
    resident: P2E0ResidentCausalKernel,
    executor: DeterministicExecutor,
    matterId: string
  ): P2E11DispositionResult {
    const matter = resident.matter(matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (!isTerminal(matter.status)) {
      return { status: "rejected", reason: "matter_not_terminal" };
    }
    if (matter.activeTaskRunId === null) {
      return { status: "noop", reason: "matter_has_no_active_task" };
    }

    const runId = matter.activeTaskRunId;
    const binding = resident.taskBinding(runId);
    if (!binding || binding.matterId !== matter.id) {
      return { status: "rejected", reason: "task_binding_missing" };
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
      throw new Error("P2-E11 executor run changed after synchronous disposition preflight.");
    }

    const released = resident.disposeTerminalTaskBinding(matter.id, runId);
    if (!released) {
      throw new Error("P2-E11 resident binding changed after synchronous disposition preflight.");
    }

    const record: P2E11TaskDispositionRecord = {
      seq: this.nextSeq++,
      matterId: matter.id,
      matterStatus: matter.status,
      taskId: released.taskId,
      runId,
      semanticRevision: released.semanticRevision,
      disposition: "retired",
      reason: matter.status === "resolved" ? "matter_resolved" : "matter_cancelled",
      executorCause: cloneCause(retired.run.cause),
      stepsUsed: retired.stepsUsed
    };
    this.recordsValue.push(record);
    if (this.recordsValue.length > this.recordLimit) {
      this.recordsValue.splice(0, this.recordsValue.length - this.recordLimit);
    }

    return { status: "disposed", record: cloneRecord(record) };
  }

  records(): P2E11TaskDispositionRecord[] {
    return this.recordsValue.map(cloneRecord);
  }
}
