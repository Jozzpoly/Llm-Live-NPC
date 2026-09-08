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

interface P2E6CandidateAuthority {
  matterId: string;
  semanticRevision: number;
  taskId: string;
  task: ExecutorTask;
}

export type P2E6PrepareResult =
  | { status: "ready"; candidate: P2E6GroundedTaskCandidate }
  | {
      status: "rejected";
      reason:
        | "matter_missing"
        | "matter_not_active"
        | "matter_has_active_task"
        | "semantic_revision_changed"
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
        | "executor_busy"
        | "run_id_conflict";
    };

function cloneTask(task: ExecutorTask): ExecutorTask {
  return { ...task };
}

function validGroundedTask(
  result: P2E6LocalGroundingResult,
  actorId: string,
  snapshot: WorldSnapshot
): boolean {
  if (result.taskId.trim().length === 0) return false;
  if (result.task.kind !== "approach-and-interact" || result.task.actorId !== actorId) return false;
  const actor = snapshot.entities.find((entity) => entity.id === actorId);
  if (!actor || actor.kind !== "npc") return false;
  const target = snapshot.entities.find((entity) => entity.id === result.task.targetId);
  return target?.kind === "item";
}

/**
 * P2-E6 research apparatus only.
 *
 * Attacks the intent→task boundary selected by Pass 2. A semantic course may
 * be grounded into an executable local competence only from current World
 * state, and the resulting candidate retains private authority from the exact
 * matter semantic revision that authorized that grounding. A later semantic
 * revision therefore cannot "launder" an older grounded task by binding it as
 * if it belonged to the newer meaning.
 *
 * World tick is diagnostic only. Start revalidates only targeted current World
 * facts rather than applying a global `worldTick changed => stale` rule, because
 * routine physical movement should not invalidate a still-correct semantic
 * target. Once started, the recovered deterministic executor continues reading
 * current World snapshots frame by frame.
 *
 * The recovered executor allocates monotonically increasing run IDs. P2-E6
 * preflights the exact next run ID against resident task bindings before
 * starting the executor, so the synchronous start→bind handoff cannot leave a
 * running executor behind if that resident run identity is already occupied.
 */
export class P2E6GroundedTaskStartBoundary {
  private readonly candidateAuthority = new WeakMap<
    P2E6GroundedTaskCandidate,
    P2E6CandidateAuthority
  >();

  prepare(
    resident: P2E0ResidentCausalKernel,
    snapshot: WorldSnapshot,
    matterId: string,
    actorId: string,
    grounder: P2E6LocalTaskGrounder
  ): P2E6PrepareResult {
    const matter = resident.matter(matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (matter.status !== "active") return { status: "rejected", reason: "matter_not_active" };
    if (matter.activeTaskRunId !== null) {
      return { status: "rejected", reason: "matter_has_active_task" };
    }

    const result = grounder({
      semanticCourse: matter.semanticCourse,
      actorId,
      snapshot: structuredClone(snapshot)
    });
    if (!result) return { status: "rejected", reason: "grounding_failed" };
    if (!validGroundedTask(result, actorId, snapshot)) {
      return { status: "rejected", reason: "grounded_task_invalid" };
    }

    const currentMatter = resident.matter(matterId);
    if (!currentMatter) return { status: "rejected", reason: "matter_missing" };
    if (currentMatter.status !== "active") {
      return { status: "rejected", reason: "matter_not_active" };
    }
    if (currentMatter.activeTaskRunId !== null) {
      return { status: "rejected", reason: "matter_has_active_task" };
    }
    if (currentMatter.semanticRevision !== matter.semanticRevision) {
      return { status: "rejected", reason: "semantic_revision_changed" };
    }

    const candidate: P2E6GroundedTaskCandidate = {
      taskId: result.taskId,
      task: cloneTask(result.task),
      groundedAtWorldTick: snapshot.tick
    };
    this.candidateAuthority.set(candidate, {
      matterId,
      semanticRevision: matter.semanticRevision,
      taskId: result.taskId,
      task: cloneTask(result.task)
    });
    return { status: "ready", candidate };
  }

  start(
    resident: P2E0ResidentCausalKernel,
    currentSnapshot: WorldSnapshot,
    executor: DeterministicExecutor,
    candidate: P2E6GroundedTaskCandidate,
    cause: ExecutorRunCause = { kind: "unattributed" }
  ): P2E6StartResult {
    const authority = this.candidateAuthority.get(candidate);
    if (!authority) return { status: "rejected", reason: "unknown_candidate" };

    const matter = resident.matter(authority.matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (matter.status !== "active") return { status: "rejected", reason: "matter_not_active" };
    if (matter.semanticRevision !== authority.semanticRevision) {
      return { status: "rejected", reason: "semantic_revision_changed" };
    }
    if (matter.activeTaskRunId !== null) {
      return { status: "rejected", reason: "matter_has_active_task" };
    }

    const actor = currentSnapshot.entities.find(
      (entity) => entity.id === authority.task.actorId
    );
    if (!actor || actor.kind !== "npc") return { status: "rejected", reason: "actor_not_npc" };
    const target = currentSnapshot.entities.find(
      (entity) => entity.id === authority.task.targetId
    );
    if (!target) return { status: "rejected", reason: "target_missing" };
    if (target.kind !== "item") return { status: "rejected", reason: "target_not_item" };

    const executorBefore = executor.state();
    if (executorBefore.status === "running") {
      return { status: "rejected", reason: "executor_busy" };
    }
    const expectedRunId = (executorBefore.run?.runId ?? 0) + 1;
    if (resident.taskBinding(expectedRunId)) {
      return { status: "rejected", reason: "run_id_conflict" };
    }

    const started = executor.start(cloneTask(authority.task), cause);
    if (!started) return { status: "rejected", reason: "executor_busy" };
    const executorRun = executor.state().run;
    if (!executorRun) {
      throw new Error("P2-E6 accepted executor start requires run provenance.");
    }
    if (executorRun.runId !== expectedRunId) {
      throw new Error(
        `P2-E6 executor run allocation changed during synchronous start: expected ${expectedRunId}, got ${executorRun.runId}.`
      );
    }

    const binding = resident.bindTask(authority.matterId, {
      taskId: authority.taskId,
      runId: executorRun.runId
    });
    if (binding.semanticRevision !== authority.semanticRevision) {
      throw new Error("P2-E6 task binding lost its grounding semantic revision.");
    }

    this.candidateAuthority.delete(candidate);
    return { status: "started", binding, executorRun };
  }
}
