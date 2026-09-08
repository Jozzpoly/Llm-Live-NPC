import type {
  ExecutorRunCause,
  ExecutorRunProvenance,
  ExecutorTask,
  DeterministicExecutor
} from "../execution/deterministic-executor";
import type { WorldSnapshot } from "../world/types";
import type {
  P2E0TaskBinding,
  P2E0ResidentCausalKernel
} from "./p2-e0-resident-causal-kernel";

export interface P2E6LocalGroundingInput {
  semanticCourse: string;
  actorId: string;
  snapshot: WorldSnapshot;
}

export interface P2E6LocalGroundingResult {
  taskId: string;
  task: ExecutorTask;
}

export type P2E6LocalTaskGrounder = (
  input: P2E6LocalGroundingInput
) => P2E6LocalGroundingResult | null;

export interface P2E6GroundedTaskCandidate {
  taskId: string;
  task: ExecutorTask;
  groundedAtWorldTick: number;
}

export type P2E6PrepareResult =
  | { status: "ready"; candidate: P2E6GroundedTaskCandidate }
  | {
      status: "rejected";
      reason:
        | "apparatus_not_implemented"
        | "matter_missing"
        | "matter_not_active"
        | "matter_has_active_task"
        | "grounding_failed"
        | "grounded_task_invalid";
    };

export type P2E6StartResult =
  | {
      status: "started";
      binding: P2E0TaskBinding;
      executorRun: ExecutorRunProvenance;
    }
  | {
      status: "rejected";
      reason:
        | "unknown_candidate"
        | "matter_missing"
        | "matter_not_active"
        | "semantic_revision_changed"
        | "matter_has_active_task"
        | "actor_not_npc"
        | "target_missing"
        | "target_not_item"
        | "executor_busy";
    };

/**
 * P2-E6 research apparatus only.
 *
 * Attacks the intent→task boundary selected by Pass 2. A semantic course may
 * be grounded into an executable local competence only from current World
 * state, and the resulting candidate must retain the exact matter semantic
 * revision that authorized that grounding. A later semantic revision must not
 * be able to "launder" an older grounded task by binding it as if it belonged
 * to the newer meaning.
 *
 * World tick is diagnostic only. The intended boundary must revalidate the
 * targeted current World facts before start rather than using a global
 * `worldTick changed => stale` rule, because routine physical movement should
 * not invalidate a still-correct semantic target.
 */
export class P2E6GroundedTaskStartBoundary {
  prepare(
    resident: P2E0ResidentCausalKernel,
    snapshot: WorldSnapshot,
    matterId: string,
    actorId: string,
    grounder: P2E6LocalTaskGrounder
  ): P2E6PrepareResult {
    void resident;
    void snapshot;
    void matterId;
    void actorId;
    void grounder;
    return { status: "rejected", reason: "apparatus_not_implemented" };
  }

  start(
    resident: P2E0ResidentCausalKernel,
    currentSnapshot: WorldSnapshot,
    executor: DeterministicExecutor,
    candidate: P2E6GroundedTaskCandidate,
    cause: ExecutorRunCause = { kind: "unattributed" }
  ): P2E6StartResult {
    void resident;
    void currentSnapshot;
    void executor;
    void candidate;
    void cause;
    return { status: "rejected", reason: "unknown_candidate" };
  }
}
