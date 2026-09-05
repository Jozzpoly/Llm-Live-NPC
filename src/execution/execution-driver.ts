import type { WorldActionRequest, WorldActionResult, WorldInput } from "../world/types";
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

/**
 * One canonical fixed-step execution frame shared by the browser runtime and
 * headless tests. Ordering is intentional: validate external player control,
 * executor reads the pre-step snapshot, movement resolves for player +
 * controlled actors, queued player atomic actions run, then the executor's
 * explicit atomic action runs and its result is fed back to it.
 */
export class ExecutionDriver {
  constructor(
    private readonly world: World,
    private readonly executor: DeterministicExecutor
  ) {}

  step(input: ExecutionFrameInput): ExecutionFrameResult {
    // World remains authoritative for canonical movement validation. This early
    // guard additionally keeps executor state transactional when external input
    // is invalid: a rejected frame must not consume an executor step first.
    assertFinitePlayerControl(input.playerControl);
    const executorCommand = this.executor.next(this.world.snapshot());

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

    return { playerActionResults, executorActionResult };
  }
}
