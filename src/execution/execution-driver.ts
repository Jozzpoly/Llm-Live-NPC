import { recordRuntimeExecutionFrame } from "./action-attempt-history";
import type {
  EntityId,
  WorldActionRequest,
  WorldActionResult,
  WorldInput,
  WorldSnapshot
} from "../world/types";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";

export interface ExecutionFrameInput {
  playerControl: WorldInput;
  playerActions?: readonly WorldActionRequest[];
}

export type ExecutionActionSource = "player" | "executor";

/**
 * Frame-local event-time read model for atomic outcomes that also correspond to
 * semantic World events in the current substrate. It is not retained history:
 * the snapshot exists only so perception can evaluate locality at the exact
 * post-action state before later actions in the same fixed step overwrite it.
 */
export interface ExecutionSemanticActionOccurrence {
  source: ExecutionActionSource;
  result: WorldActionResult;
  snapshot: WorldSnapshot;
}

export interface ExecutionFrameResult {
  playerActionResults: WorldActionResult[];
  executorActionResult: WorldActionResult | null;
  semanticActionOccurrences: ExecutionSemanticActionOccurrence[];
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

function isSemanticActionResult(result: WorldActionResult): boolean {
  return (
    result.status === "succeeded" &&
    (result.code === "picked_up_item" || result.code === "dropped_item")
  );
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

    const playerActionResults: WorldActionResult[] = [];
    const semanticActionOccurrences: ExecutionSemanticActionOccurrence[] = [];
    for (const action of playerActions) {
      const result = this.world.attemptAction(action);
      playerActionResults.push(result);
      if (isSemanticActionResult(result)) {
        semanticActionOccurrences.push({
          source: "player",
          result: { ...result },
          snapshot: this.world.snapshot()
        });
      }
    }

    let executorActionResult: WorldActionResult | null = null;
    if (executorCommand.action) {
      executorActionResult = this.world.attemptAction(executorCommand.action);
      if (isSemanticActionResult(executorActionResult)) {
        semanticActionOccurrences.push({
          source: "executor",
          result: { ...executorActionResult },
          snapshot: this.world.snapshot()
        });
      }
      this.executor.acceptActionResult(executorActionResult);
    }

    const frame = { playerActionResults, executorActionResult, semanticActionOccurrences };
    recordRuntimeExecutionFrame(frame);
    return frame;
  }
}
