import type { EntityId, WorldActionRequest, WorldActionResult, WorldInput } from "../world/types";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";

export interface ExecutionFrameInput {
  playerControl: WorldInput;
  playerActions?: readonly WorldActionRequest[];
}

export interface ExecutionFrameResult {
  playerActionResults: WorldActionResult[];
  executorActionResult: WorldActionResult | null;
}

function assertFinitePlayerControl(input: WorldInput): void {
  if (!Number.isFinite(input.moveX) || !Number.isFinite(input.moveY)) {
    throw new Error("Player control requires a finite movement vector.");
  }
}

function assertPlayerActionActors(actions: readonly WorldActionRequest[], playerId: EntityId): void {
  for (const action of actions) {
    if (action.actorId !== playerId) {
      throw new Error(`Player action channel requires canonical player actor ${playerId}: ${action.actorId}`);
    }
  }
}

/**
 * One canonical fixed-step execution frame shared by the browser runtime and
 * headless tests. Ordering is intentional: validate external player control
 * and queued player-action identity, executor reads the pre-step snapshot,
 * movement resolves for player + controlled actors, queued player atomic
 * actions run, then the executor's explicit atomic action runs and its result
 * is fed back to it.
 */
export class ExecutionDriver {
  constructor(
    private readonly world: World,
    private readonly executor: DeterministicExecutor
  ) {}

  step(input: ExecutionFrameInput): ExecutionFrameResult {
    assertFinitePlayerControl(input.playerControl);
    const playerActions = input.playerActions ?? [];
    assertPlayerActionActors(playerActions, this.world.playerId);

    const executorCommand = this.executor.next(
      this.world.snapshot(),
      (actorId, targetId) => this.world.validateInteraction(actorId, targetId)
    );

    this.world.stepWithActorControls(
      input.playerControl,
      executorCommand.control ? [executorCommand.control] : []
    );

    const playerActionResults = playerActions.map((action) => this.world.attemptAction(action));

    let executorActionResult: WorldActionResult | null = null;
    if (executorCommand.action) {
      executorActionResult = this.world.attemptAction(executorCommand.action);
      this.executor.acceptActionResult(executorActionResult);
    }

    return { playerActionResults, executorActionResult };
  }
}
