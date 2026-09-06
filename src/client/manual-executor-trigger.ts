import {
  DeterministicExecutor,
  type ExecutorState,
  type ExecutorTask
} from "../execution/deterministic-executor";

export interface ManualExecutorStartResult {
  started: boolean;
  state: ExecutorState;
}

/**
 * Manual/debug orchestration must not perform lifecycle side effects until the
 * executor has causally accepted the new task. A stale UI snapshot may still
 * permit a click while another path has already started the executor; in that
 * case start() returns false and onStarted is deliberately not invoked.
 */
export function startManualExecutorTask(
  executor: DeterministicExecutor,
  task: ExecutorTask,
  onStarted: () => void
): ManualExecutorStartResult {
  const started = executor.start(task);
  if (started) onStarted();
  return { started, state: executor.state() };
}
