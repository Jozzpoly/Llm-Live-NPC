import { describe, expect, it } from "vitest";
import type { ExecutionFrameResult } from "../execution/execution-driver";
import { ActionAttemptHistory, executionFrameAttempts } from "./action-attempt-history";

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
      executorActionResult: result(3, "npc.001", "target_unavailable", "rejected", "item.lantern")
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
      executorActionResult: null
    });
    history.record({ playerActionResults: [], executorActionResult: null });
    history.record({ playerActionResults: [], executorActionResult: null });

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
      executorActionResult: result(3, "npc.001", "target_unavailable", "rejected", "item.lantern")
    });
    history.record({
      playerActionResults: [result(4, "player.jozz", "dropped_item", "succeeded", "item.mug")],
      executorActionResult: null
    });

    expect(history.recent().map((attempt) => attempt.seq)).toEqual([2, 3, 4]);
  });

  it("returns isolated read records", () => {
    const history = new ActionAttemptHistory();
    history.record({
      playerActionResults: [result(1, "player.jozz", "dropped_item", "succeeded", "item.mug")],
      executorActionResult: null
    });

    const external = history.recent();
    external[0]!.message = "mutated outside history";
    expect(history.recent()[0]!.message).toBe("dropped_item");
  });
});
