import type { WorldActionRequest, WorldActionResult, WorldInput, WorldSnapshot } from "../world/types";
import { World } from "../world/world";
import {
  DeterministicExecutor,
  type ExecutorRunCause,
  type ExecutorRunProvenance
} from "./deterministic-executor";

const ACTION_ATTEMPT_HISTORY_LIMIT = 12;

export interface ExecutionFrameInput {
  playerControl: WorldInput;
  playerActions?: readonly WorldActionRequest[];
}

export interface ExecutionFrameResult {
  playerActionResults: WorldActionResult[];
  executorActionResult: WorldActionResult | null;
  executorActionRun: ExecutorRunProvenance | null;
}

export type ActionAttemptSource = "player" | "executor";

export interface ActionAttemptRecord extends WorldActionResult {
  source: ActionAttemptSource;
  executorRun?: ExecutorRunProvenance;
}

function cloneExecutorRun(run: ExecutorRunProvenance): ExecutorRunProvenance {
  let cause: ExecutorRunCause;
  switch (run.cause.kind) {
    case "manual":
      cause = { kind: "manual" };
      break;
    case "cognition":
      cause =
        run.cause.sessionId === undefined
          ? { kind: "cognition" }
          : {
              kind: "cognition",
              sessionId: run.cause.sessionId,
              cycleId: run.cause.cycleId
            };
      break;
    case "unattributed":
      cause = { kind: "unattributed" };
      break;
  }
  return { runId: run.runId, cause };
}

function cloneActionAttempt(attempt: ActionAttemptRecord): ActionAttemptRecord {
  return {
    ...attempt,
    executorRun: attempt.executorRun ? cloneExecutorRun(attempt.executorRun) : undefined
  };
}

function assertFinitePlayerControl(input: WorldInput): void {
  if (!Number.isFinite(input.moveX) || !Number.isFinite(input.moveY)) {
    throw new Error("Player control requires a finite movement vector.");
  }
}

function currentPlayerId(snapshot: WorldSnapshot): string {
  const player = snapshot.entities.find((entity) => entity.kind === "player");
  if (!player) throw new Error("Execution frame requires a canonical player actor.");
  return player.id;
}

function assertPlayerActionActors(actions: readonly WorldActionRequest[], playerId: string): void {
  for (const action of actions) {
    if (action.actorId !== playerId) {
      throw new Error(`Player action channel requires canonical player actor ${playerId}: ${action.actorId}`);
    }
  }
}

/**
 * One canonical fixed-step execution frame shared by the browser runtime and
 * headless tests. Ordering is intentional: validate external player input,
 * executor reads the same pre-step snapshot, movement resolves for player +
 * controlled actors, queued player atomic actions run, then the executor's
 * explicit atomic action runs and its result is fed back to it.
 *
 * Each driver instance also retains a tiny bounded diagnostic history of the
 * atomic attempts that crossed this execution boundary. World/gameplay/cognition
 * never read that history; it exists only so debug surfaces do not collapse a
 * multi-attempt frame into World.lastActionResult(). Executor attempts retain
 * the accepted executor run/cause that owned the action.
 */
export class ExecutionDriver {
  private readonly actionAttemptHistory: ActionAttemptRecord[] = [];

  constructor(
    private readonly world: World,
    private readonly executor: DeterministicExecutor
  ) {}

  step(input: ExecutionFrameInput): ExecutionFrameResult {
    // Reject the whole externally-owned player frame before executor or World
    // state can advance. This channel is not a generic actor-action injection
    // seam; non-player actors act through their own execution path.
    assertFinitePlayerControl(input.playerControl);
    const preStepSnapshot = this.world.snapshot();
    assertPlayerActionActors(input.playerActions ?? [], currentPlayerId(preStepSnapshot));

    // A run can only be replaced by an explicit accepted start(), never by
    // next(). Capturing it before command derivation therefore gives the exact
    // causal owner of any executor atomic action produced by this frame without
    // widening the movement-command API just for diagnostics.
    const executorRunBeforeCommand = this.executor.state().run;
    const executorCommand = this.executor.next(preStepSnapshot);

    this.world.stepWithActorControls(
      input.playerControl,
      executorCommand.control ? [executorCommand.control] : []
    );

    const playerActionResults = (input.playerActions ?? []).map((action) =>
      this.world.attemptAction(action)
    );

    let executorActionResult: WorldActionResult | null = null;
    let executorActionRun: ExecutorRunProvenance | null = null;
    if (executorCommand.action) {
      if (!executorRunBeforeCommand) {
        throw new Error("Executor atomic action requires accepted-run provenance.");
      }
      executorActionRun = cloneExecutorRun(executorRunBeforeCommand);
      executorActionResult = this.world.attemptAction(executorCommand.action);
      this.executor.acceptActionResult(executorActionResult);
    }

    const frame = { playerActionResults, executorActionResult, executorActionRun };
    this.recordActionAttempts(frame);
    return frame;
  }

  recentActionAttempts(): ActionAttemptRecord[] {
    return this.actionAttemptHistory.map(cloneActionAttempt);
  }

  private recordActionAttempts(frame: ExecutionFrameResult): void {
    for (const result of frame.playerActionResults) {
      this.actionAttemptHistory.push({ ...result, source: "player" });
    }
    if (frame.executorActionResult) {
      if (!frame.executorActionRun) {
        throw new Error("Executor action result requires accepted-run provenance.");
      }
      this.actionAttemptHistory.push({
        ...frame.executorActionResult,
        source: "executor",
        executorRun: cloneExecutorRun(frame.executorActionRun)
      });
    }
    if (this.actionAttemptHistory.length > ACTION_ATTEMPT_HISTORY_LIMIT) {
      this.actionAttemptHistory.splice(
        0,
        this.actionAttemptHistory.length - ACTION_ATTEMPT_HISTORY_LIMIT
      );
    }
  }
}
