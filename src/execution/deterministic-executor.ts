import type {
  ActorControlInput,
  EntityId,
  InteractionValidation,
  WorldActionRequest,
  WorldActionResult,
  WorldSnapshot
} from "../world/types";

const DEFAULT_STEP_BUDGET = 180;
const MAX_CAUSATION_ID_LENGTH = 128;

export type ExecutorStatus = "idle" | "running" | "succeeded" | "failed";

export interface ExecutorTask {
  kind: "approach-and-interact";
  actorId: EntityId;
  targetId: EntityId;
}

export type ExecutorRunCause =
  | { kind: "manual" }
  | { kind: "cognition"; correlationId: string }
  | { kind: "unattributed" };

export interface ExecutorRunProvenance {
  runId: number;
  cause: ExecutorRunCause;
}

export interface ExecutorCommand {
  control?: ActorControlInput;
  action?: WorldActionRequest;
  run?: ExecutorRunProvenance;
}

export interface ExecutorState {
  status: ExecutorStatus;
  task: ExecutorTask | null;
  failureCode: string | null;
  stepsUsed: number;
  stepBudget: number;
  run: ExecutorRunProvenance | null;
}

export type InteractionValidator = (actorId: EntityId, targetId: EntityId) => InteractionValidation;

function cloneCause(cause: ExecutorRunCause): ExecutorRunCause {
  return cause.kind === "cognition" ? { kind: "cognition", correlationId: cause.correlationId } : { kind: cause.kind };
}

function cloneRun(run: ExecutorRunProvenance | null): ExecutorRunProvenance | null {
  return run ? { runId: run.runId, cause: cloneCause(run.cause) } : null;
}

function validateCause(cause: ExecutorRunCause): void {
  if (cause.kind !== "cognition") return;
  if (
    typeof cause.correlationId !== "string" ||
    cause.correlationId.length === 0 ||
    cause.correlationId.length > MAX_CAUSATION_ID_LENGTH
  ) {
    throw new Error(`Executor cognition correlation must be 1-${MAX_CAUSATION_ID_LENGTH} characters.`);
  }
}

export class DeterministicExecutor {
  private taskValue: ExecutorTask | null = null;
  private statusValue: ExecutorStatus = "idle";
  private failureCodeValue: string | null = null;
  private stepsUsedValue = 0;
  private nextRunId = 1;
  private runValue: ExecutorRunProvenance | null = null;

  constructor(private readonly stepBudgetValue = DEFAULT_STEP_BUDGET) {
    if (!Number.isInteger(stepBudgetValue) || stepBudgetValue <= 0) {
      throw new Error(`Executor step budget must be a positive integer: ${stepBudgetValue}`);
    }
  }

  /**
   * Starts a new durative task only when no task is currently running.
   * Returning false is a causal refusal: callers must not silently replace an
   * in-flight task, because doing so would destroy execution provenance.
   *
   * `unattributed` exists only as a migration/default for isolated callers. The
   * real browser manual and cognition paths supply an explicit cause.
   */
  start(task: ExecutorTask, cause: ExecutorRunCause = { kind: "unattributed" }): boolean {
    if (this.statusValue === "running") return false;
    validateCause(cause);
    this.taskValue = { ...task };
    this.statusValue = "running";
    this.failureCodeValue = null;
    this.stepsUsedValue = 0;
    this.runValue = { runId: this.nextRunId++, cause: cloneCause(cause) };
    return true;
  }

  state(): ExecutorState {
    return {
      status: this.statusValue,
      task: this.taskValue ? { ...this.taskValue } : null,
      failureCode: this.failureCodeValue,
      stepsUsed: this.stepsUsedValue,
      stepBudget: this.stepBudgetValue,
      run: cloneRun(this.runValue)
    };
  }

  next(snapshot: WorldSnapshot, validateInteraction: InteractionValidator): ExecutorCommand {
    if (this.statusValue !== "running" || !this.taskValue || !this.runValue) return {};
    if (this.stepsUsedValue >= this.stepBudgetValue) {
      this.fail("step_budget_exhausted");
      return {};
    }
    this.stepsUsedValue += 1;

    const actor = snapshot.entities.find((entity) => entity.id === this.taskValue?.actorId);
    if (!actor || (actor.kind !== "player" && actor.kind !== "npc")) {
      this.fail("actor_not_found");
      return {};
    }
    if (actor.kind !== "npc") {
      this.fail("unsupported_actor_kind");
      return {};
    }

    const target = snapshot.entities.find((entity) => entity.id === this.taskValue?.targetId);
    if (!target) {
      this.fail("target_not_found");
      return {};
    }

    if (target.kind === "item" && target.heldBy === actor.id && actor.heldItemId === target.id) {
      this.statusValue = "succeeded";
      return {};
    }

    const dx = target.position.x - actor.position.x;
    const dy = target.position.y - actor.position.y;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance)) {
      this.fail("invalid_target_geometry");
      return {};
    }

    const validation = validateInteraction(actor.id, target.id);
    const run = cloneRun(this.runValue);
    if (!run) throw new Error("Running executor lost its run provenance.");

    if (validation.status === "accepted") {
      return {
        action: {
          action: "interact",
          actorId: actor.id,
          targetId: target.id
        },
        run
      };
    }

    if (validation.code === "target_out_of_range") {
      return {
        control: {
          actorId: actor.id,
          moveX: dx / distance,
          moveY: dy / distance
        },
        run
      };
    }

    if (validation.code === "target_occluded") {
      return {
        action: {
          action: "interact",
          actorId: actor.id,
          targetId: target.id
        },
        run
      };
    }

    this.fail(validation.code);
    return {};
  }

  acceptActionResult(result: WorldActionResult): void {
    if (this.statusValue !== "running" || !this.taskValue) return;
    if (result.actorId !== this.taskValue.actorId || result.targetId !== this.taskValue.targetId) return;

    if (result.status === "succeeded") {
      this.statusValue = "succeeded";
      return;
    }

    if (result.code === "target_out_of_range") return;
    this.fail(result.code);
  }

  private fail(code: string): void {
    this.statusValue = "failed";
    this.failureCodeValue = code;
  }
}
