import type { WorldActionRequest, WorldActionResult, WorldInput } from "../world/types";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";

export interface ExecutionFrameInput {
  playerControl: WorldInput;
  playerActions?: readonly WorldActionRequest[];
  seconds?: number;
}

export interface ExecutionFrameResult {
  playerActionResults: WorldActionResult[];
  executorActionResult: WorldActionResult | null;
}

/**
 * One canonical execution frame shared by the browser runtime and headless tests.
 * Ordering is intentional: executor reads the pre-step snapshot, movement resolves
 * for player + controlled actors, queued player atomic actions run, then the
 * executor's explicit atomic action runs and its result is fed back to it.
 */
export class ExecutionDriver {
  constructor(
    private readonly world: World,
    private readonly executor: DeterministicExecutor
  ) {}

  step(input: ExecutionFrameInput): ExecutionFrameResult {
    const executorCommand = this.executor.next(this.world.snapshot());

    this.world.stepWithActorControls(
      input.playerControl,
      executorCommand.control ? [executorCommand.control] : [],
      input.seconds
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
