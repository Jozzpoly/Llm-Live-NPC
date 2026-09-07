import type { WorldActionRequest, WorldActionResult, WorldInput, WorldSnapshot } from "../world/types";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";

const ACTION_ATTEMPT_HISTORY_LIMIT = 12;

export interface ExecutionFrameInput {
  playerControl: WorldInput;
  playerActions?: readonly WorldActionRequest[];
}

export interface ExecutionFrameResult {
  playerActionResults: WorldActionResult[];
  executorActionResult: WorldActionResult | null;
}

export type ActionAttemptSource = "player" | "executor";

export interface ActionAttemptRecord extends WorldActionResult {
  source: ActionAttemptSource;
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
 * multi-attempt frame into World.lastActionResult().
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

    const executorCommand = this.executor.next(preStepSnapshot);

    this.world.stepWithActorControls(
      input.playerControl,
      executorCommand.control ? [executorCommand.control] : []
    );

    const playerActionResults = (input.playerActions ?? []).map((action) =>
      this.world.attemptAction(action)
    );

    let executorActionResult: WorldActionResult | null = null;
    if (executorCommand.action) {
      executorActionResult = this.world.attemptAction(executorCommand.action);
      this.executor.acceptActionResult(executorActionResult);
    }

    const frame = { playerActionResults, executorActionResult };
    this.recordActionAttempts(frame);
    return frame;
  }

  recentActionAttempts(): ActionAttemptRecord[] {
    return this.actionAttemptHistory.map((attempt) => ({ ...attempt }));
  }

  private recordActionAttempts(frame: ExecutionFrameResult): void {
    for (const result of frame.playerActionResults) {
      this.actionAttemptHistory.push({ ...result, source: "player" });
    }
    if (frame.executorActionResult) {
      this.actionAttemptHistory.push({ ...frame.executorActionResult, source: "executor" });
    }
    if (this.actionAttemptHistory.length > ACTION_ATTEMPT_HISTORY_LIMIT) {
      this.actionAttemptHistory.splice(
        0,
        this.actionAttemptHistory.length - ACTION_ATTEMPT_HISTORY_LIMIT
      );
    }
  }
}
