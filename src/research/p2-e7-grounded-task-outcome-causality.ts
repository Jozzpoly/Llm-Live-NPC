import type {
  DeterministicExecutor,
  ExecutorRunProvenance
} from "../execution/deterministic-executor";
import type { ExecutionFrameResult } from "../execution/execution-driver";
import type { WorldActionResult } from "../world/types";
import type {
  P2E0EvidenceRecord,
  P2E0ResidentCausalKernel
} from "./p2-e0-resident-causal-kernel";

export type P2E7OutcomeReconciliationResult =
  | { status: "recorded"; evidence: P2E0EvidenceRecord }
  | { status: "pending" }
  | {
      status: "rejected";
      reason: "executor_run_missing" | "executor_task_missing" | "task_binding_missing";
    };

function sameRun(a: ExecutorRunProvenance, b: ExecutorRunProvenance): boolean {
  if (a.runId !== b.runId || a.cause.kind !== b.cause.kind) return false;
  if (a.cause.kind !== "cognition" || b.cause.kind !== "cognition") return true;
  return a.cause.sessionId === b.cause.sessionId && a.cause.cycleId === b.cause.cycleId;
}

function matchingTerminalWorldResult(
  frame: ExecutionFrameResult,
  run: ExecutorRunProvenance,
  task: { actorId: string; targetId: string },
  terminalStatus: "succeeded" | "failed",
  failureCode: string | null
): WorldActionResult | null {
  const frameRun = frame.executorActionRun;
  const result = frame.executorActionResult;
  if (!frameRun || !result || !sameRun(frameRun, run)) return null;
  if (result.actorId !== task.actorId || result.targetId !== task.targetId) return null;

  if (terminalStatus === "succeeded") {
    return result.status === "succeeded" ? result : null;
  }

  return result.status === "rejected" && result.code === failureCode ? result : null;
}

/**
 * P2-E7 research apparatus only.
 *
 * Closes the opposite side of P2-E6: a resident task binding may become factual
 * resident experience only from the exact terminal deterministic-executor run.
 * When the terminal transition crossed a real World atomic-action boundary in
 * the supplied execution frame, that matching World result supplies the factual
 * code/message. Otherwise the deterministic executor's own terminal state is
 * the authority (for example, already-held-target success or step-budget
 * exhaustion).
 *
 * The executor and ExecutionFrameResult are trusted local runtime inputs here;
 * this is a causal/provenance boundary, not a hostile in-process object-
 * authentication or security membrane. Callers cannot provide a free-standing
 * success/failure payload to this seam. A terminal run must still own a live
 * resident binding, and recording the outcome consumes that binding through
 * P2-E0. Mechanical completion remains evidence only: this boundary deliberately
 * does not resolve the semantic matter or advance its semantic revision.
 */
export class P2E7GroundedTaskOutcomeBoundary {
  reconcile(
    resident: P2E0ResidentCausalKernel,
    executor: DeterministicExecutor,
    frame: ExecutionFrameResult
  ): P2E7OutcomeReconciliationResult {
    const executorState = executor.state();
    if (executorState.status === "running") return { status: "pending" };
    if (executorState.status === "idle" || !executorState.run) {
      return { status: "rejected", reason: "executor_run_missing" };
    }
    if (!executorState.task) {
      return { status: "rejected", reason: "executor_task_missing" };
    }

    const binding = resident.taskBinding(executorState.run.runId);
    if (!binding) return { status: "rejected", reason: "task_binding_missing" };

    const terminalStatus = executorState.status;
    const worldResult = matchingTerminalWorldResult(
      frame,
      executorState.run,
      executorState.task,
      terminalStatus,
      executorState.failureCode
    );

    const status = terminalStatus;
    const code = worldResult?.code ?? (
      status === "succeeded"
        ? "executor_succeeded"
        : executorState.failureCode ?? "executor_failed"
    );
    const message = worldResult?.message ?? (
      status === "succeeded"
        ? `Deterministic executor run ${executorState.run.runId} succeeded.`
        : `Deterministic executor run ${executorState.run.runId} failed: ${code}.`
    );

    const evidence = resident.recordTaskOutcome({
      runId: binding.runId,
      status,
      code,
      message
    });
    return { status: "recorded", evidence };
  }
}
