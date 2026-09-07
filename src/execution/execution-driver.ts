import { recordRuntimeExecutionFrame } from "./action-attempt-history";
import type {
  EntityId,
  WorldActionRequest,
  WorldActionResult,
  WorldInput,
  WorldSnapshot
} from "../world/types";
import { World } from "../world/world";
import {
  DeterministicExecutor,
  type ExecutorRunProvenance
} from "./deterministic-executor";

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
  executorRun?: ExecutorRunProvenance;
}

export interface ExecutionFrameResult {
  playerActionResults: WorldActionResult[];
  executorActionResult: WorldActionResult | null;
  executorActionRun: ExecutorRunProvenance | null;
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

function cloneExecutorRun(run: ExecutorRunProvenance): ExecutorRunProvenance {
  return {
    runId: run.runId,
    cause:
      run.cause.kind === "cognition"
        ? { kind: "cognition", correlationId: run.cause.correlationId }
        : { kind: run.cause.kind }
  };
}

function latestWorldEventSeq(world: World): number {
  return world.recentEvents(1).at(-1)?.seq ?? 0;
}

/**
 * A semantic atomic action is expected to synchronously emit exactly one
 * corresponding World event. Correlate it at the execution boundary while the
 * before/after event window is still causally unambiguous; later consumers must
 * not reconstruct this relation from target/tick coincidence.
 */
function attachSemanticEventCorrelation(
  world: World,
  result: WorldActionResult,
  previousEventSeq: number
): void {
  if (!isSemanticActionResult(result)) return;

  const expectedType = result.code === "picked_up_item" ? "item.picked_up" : "item.dropped";
  const newEvents = world.recentEvents(128).filter((event) => event.seq > previousEventSeq);
  const matches = newEvents.filter(
    (event) =>
      event.type === expectedType &&
      event.actorId === result.actorId &&
      event.entityId === result.targetId
  );

  if (newEvents.length !== 1 || matches.length !== 1) {
    throw new Error(
      `Semantic action/event correlation failed for action #${result.seq}: expected one ${expectedType} event, observed ${newEvents.length} new event(s) and ${matches.length} match(es).`
    );
  }

  result.eventSeq = matches[0]!.seq;
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
      const previousEventSeq = latestWorldEventSeq(this.world);
      const result = this.world.attemptAction(action);
      attachSemanticEventCorrelation(this.world, result, previousEventSeq);
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
    let executorActionRun: ExecutorRunProvenance | null = null;
    if (executorCommand.action) {
      if (!executorCommand.run) {
        throw new Error("Executor atomic action requires run provenance.");
      }
      executorActionRun = cloneExecutorRun(executorCommand.run);
      const previousEventSeq = latestWorldEventSeq(this.world);
      executorActionResult = this.world.attemptAction(executorCommand.action);
      attachSemanticEventCorrelation(this.world, executorActionResult, previousEventSeq);
      if (isSemanticActionResult(executorActionResult)) {
        semanticActionOccurrences.push({
          source: "executor",
          result: { ...executorActionResult },
          snapshot: this.world.snapshot(),
          executorRun: cloneExecutorRun(executorCommand.run)
        });
      }
      this.executor.acceptActionResult(executorActionResult);
    }

    const frame = {
      playerActionResults,
      executorActionResult,
      executorActionRun,
      semanticActionOccurrences
    };
    recordRuntimeExecutionFrame(frame);
    return frame;
  }
}
