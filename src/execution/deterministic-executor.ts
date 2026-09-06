import type {
  ActorControlInput,
  EntityId,
  WorldActionRequest,
  WorldActionResult,
  WorldSnapshot
} from "../world/types";

const APPROACH_DISTANCE = 48;
const DEFAULT_STEP_BUDGET = 180;

export type ExecutorStatus = "idle" | "running" | "succeeded" | "failed";

export interface ExecutorTask {
  kind: "approach-and-interact";
  actorId: EntityId;
  targetId: EntityId;
}

export interface ExecutorCommand {
  control?: ActorControlInput;
  action?: WorldActionRequest;
}

export interface ExecutorState {
  status: ExecutorStatus;
  task: ExecutorTask | null;
  failureCode: string | null;
  stepsUsed: number;
  stepBudget: number;
}

export class DeterministicExecutor {
  private taskValue: ExecutorTask | null = null;
  private statusValue: ExecutorStatus = "idle";
  private failureCodeValue: string | null = null;
  private stepsUsedValue = 0;

  constructor(private readonly stepBudgetValue = DEFAULT_STEP_BUDGET) {
    if (!Number.isInteger(stepBudgetValue) || stepBudgetValue <= 0) {
      throw new Error(`Executor step budget must be a positive integer: ${stepBudgetValue}`);
    }
  }

  /**
   * Starts a new durative task only when no task is currently running.
   * Returning false is a causal refusal: callers must not silently replace an
   * in-flight task, because doing so would destroy execution provenance.
   */
  start(task: ExecutorTask): boolean {
    if (this.statusValue === "running") return false;
    this.taskValue = { ...task };
    this.statusValue = "running";
    this.failureCodeValue = null;
    this.stepsUsedValue = 0;
    return true;
  }

  state(): ExecutorState {
    return {
      status: this.statusValue,
      task: this.taskValue ? { ...this.taskValue } : null,
      failureCode: this.failureCodeValue,
      stepsUsed: this.stepsUsedValue,
      stepBudget: this.stepBudgetValue
    };
  }

  next(snapshot: WorldSnapshot): ExecutorCommand {
    if (this.statusValue !== "running" || !this.taskValue) return {};
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

    if (distance > APPROACH_DISTANCE) {
      return {
        control: {
          actorId: actor.id,
          moveX: dx / distance,
          moveY: dy / distance
        }
      };
    }

    return {
      action: {
        action: "interact",
        actorId: actor.id,
        targetId: target.id
      }
    };
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
