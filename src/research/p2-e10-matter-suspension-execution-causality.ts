import {
  DeterministicExecutor,
  type ExecutorCommand,
  type ExecutorRunCause,
  type ExecutorState,
  type ExecutorTask
} from "../execution/deterministic-executor";
import type { WorldActionResult, WorldSnapshot } from "../world/types";
import type { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";

/**
 * P2-E10 research apparatus only.
 *
 * P2-E0 suspension is a resident-level interruption relation. This adapter
 * attacks the missing execution consequence without changing the recovered
 * deterministic executor or canonical ExecutionDriver: when the currently
 * running exact executor run is causally bound to a matter whose current
 * status is `suspended`, command derivation is suppressed without calling the
 * inner executor at all.
 *
 * Therefore World/player processing may continue while the suspended run keeps
 * the same task, run provenance and step budget. Re-activating the owning
 * matter through P2-E0 resume semantics makes the same run eligible to continue
 * on the next frame. Terminal matter/task disposal is deliberately not selected
 * here; that remains a separate lifecycle question.
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

  override state(): ExecutorState {
    return this.inner.state();
  }

  override next(snapshot: WorldSnapshot): ExecutorCommand {
    const state = this.inner.state();
    if (state.status === "running" && state.run) {
      const binding = this.resident.taskBinding(state.run.runId);
      if (binding) {
        const matter = this.resident.matter(binding.matterId);
        if (matter?.status === "suspended" && matter.activeTaskRunId === state.run.runId) {
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
