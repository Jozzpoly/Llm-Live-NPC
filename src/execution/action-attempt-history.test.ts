import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import {
  ActionAttemptHistory,
  executionFrameAttempts,
  recentRuntimeActionAttempts
} from "./action-attempt-history";
import { DeterministicExecutor } from "./deterministic-executor";
import { ExecutionDriver, type ExecutionFrameResult } from "./execution-driver";

function result(
  seq: number,
  actorId: string,
  code: "dropped_item" | "picked_up_item" | "target_unavailable",
  status: "succeeded" | "rejected",
  targetId?: string
) {
  return {
    seq,
    tick: 7,
    actorId,
    action: code === "dropped_item" ? ("drop" as const) : ("interact" as const),
    status,
    code,
    ...(targetId ? { targetId } : {}),
    message: code
  };
}

describe("execution-frame action attempt history", () => {
  it("preserves every player attempt and the executor attempt with explicit frame-channel source", () => {
    const frame: ExecutionFrameResult = {
      playerActionResults: [
        result(1, "player.jozz", "dropped_item", "succeeded", "item.mug"),
        result(2, "player.jozz", "picked_up_item", "succeeded", "item.mug")
      ],
      executorActionResult: result(3, "npc.001", "target_unavailable", "rejected", "item.lantern"),
      semanticActionOccurrences: []
    };

    expect(executionFrameAttempts(frame)).toEqual([
      expect.objectContaining({ seq: 1, source: "player", code: "dropped_item" }),
      expect.objectContaining({ seq: 2, source: "player", code: "picked_up_item" }),
      expect.objectContaining({ seq: 3, source: "executor", code: "target_unavailable" })
    ]);
  });

  it("does not erase recent attempts when later fixed-step frames contain no atomic action", () => {
    const history = new ActionAttemptHistory(4);
    history.record({
      playerActionResults: [result(1, "player.jozz", "dropped_item", "succeeded", "item.mug")],
      executorActionResult: null,
      semanticActionOccurrences: []
    });
    history.record({ playerActionResults: [], executorActionResult: null, semanticActionOccurrences: [] });
    history.record({ playerActionResults: [], executorActionResult: null, semanticActionOccurrences: [] });

    expect(history.recent()).toEqual([
      expect.objectContaining({ seq: 1, source: "player", code: "dropped_item" })
    ]);
  });

  it("retains only the newest bounded attempts while preserving their causal execution order", () => {
    const history = new ActionAttemptHistory(3);
    history.record({
      playerActionResults: [
        result(1, "player.jozz", "dropped_item", "succeeded", "item.mug"),
        result(2, "player.jozz", "picked_up_item", "succeeded", "item.mug")
      ],
      executorActionResult: result(3, "npc.001", "target_unavailable", "rejected", "item.lantern"),
      semanticActionOccurrences: []
    });
    history.record({
      playerActionResults: [result(4, "player.jozz", "dropped_item", "succeeded", "item.mug")],
      executorActionResult: null,
      semanticActionOccurrences: []
    });

    expect(history.recent().map((attempt) => attempt.seq)).toEqual([2, 3, 4]);
  });

  it("returns isolated read records", () => {
    const history = new ActionAttemptHistory();
    history.record({
      playerActionResults: [result(1, "player.jozz", "dropped_item", "succeeded", "item.mug")],
      executorActionResult: null,
      semanticActionOccurrences: []
    });

    const external = history.recent();
    external[0]!.message = "mutated outside history";
    expect(history.recent()[0]!.message).toBe("dropped_item");
  });

  it("records a real ExecutionDriver atomic attempt into the runtime diagnostic history", () => {
    const world = new World(createP1Specimen());
    const driver = new ExecutionDriver(world, new DeterministicExecutor());

    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: world.playerId }]
    });
    expect(frame.playerActionResults[0]).toMatchObject({
      status: "rejected",
      code: "not_holding_item"
    });

    expect(recentRuntimeActionAttempts().at(-1)).toMatchObject({
      source: "player",
      actorId: world.playerId,
      action: "drop",
      status: "rejected",
      code: "not_holding_item"
    });
  });
});
