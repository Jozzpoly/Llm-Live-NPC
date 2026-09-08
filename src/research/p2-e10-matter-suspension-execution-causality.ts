import {
  DeterministicExecutor,
  type ExecutorCommand,
  type ExecutorRetirement,
  type ExecutorRunCause,
  type ExecutorState,
  type ExecutorTask
} from "../execution/deterministic-executor";
import type { WorldActionResult, WorldSnapshot } from "../world/types";
import type { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";

/**
 * P2-E10 research apparatus only.
 *
 * P2-E0 activity state is resident-owned execution eligibility. This adapter
 * attacks that execution consequence without changing the recovered
 * deterministic executor or canonical ExecutionDriver: when the currently
 * running exact executor run is causally bound to a matter that is no longer
 * `active`, command derivation is suppressed without calling the inner executor
 * at all.
 *
 * Suspension therefore preserves the same task, run provenance and step budget
 * until a legal resume makes the matter active again. Terminal matter state is
 * different: it can never resume, so the run remains mechanically quiescent
 * until P2-E11 explicitly retires that exact run and releases its resident
 * binding. Terminalization itself is not treated as a World task outcome.
 */
export class P2E10MatterSuspensionAwareExecutor extends DeterministicExecutor {
  constructor(
    private readonly inner: DeterministicExecutor,
    private readonly resident: P2E0ResidentCausalKernel
  ) {
    super();
  }

  override start(task: ExecutorTask, cause: ExecutorRunCause = { kind: "unattributed" }): boolean {
    return this.inner.start(task, cause);
  }

  override retireCurrentRun(expectedRunId: number): ExecutorRetirement | null {
    return this.inner.retireCurrentRun(expectedRunId);
  }

  override state(): ExecutorState {
    return this.inner.state();
  }

  override next(snapshot: WorldSnapshot): ExecutorCommand {
    const state = this.inner.state();
    if (state.status === "running" && state.run) {
      const binding = this.resident.taskBinding(state.run.runId);
      if (binding) {
        const matter = this.resident.matter(binding.matterId);
        if (
          matter &&
          matter.status !== "active" &&
          matter.activeTaskRunId === state.run.runId
        ) {
          return {};
        }
      }
    }
    return this.inner.next(snapshot);
  }

  override acceptActionResult(result: WorldActionResult): void {
    this.inner.acceptActionResult(result);
  }
}
