import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";

describe("deterministic executor explicit retirement", () => {
  it("retires only the exact running identity without manufacturing terminal outcome state and keeps run IDs monotonic", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" },
        { kind: "cognition", sessionId: 7, cycleId: 3 }
      )
    ).toBe(true);
    const firstRun = executor.state().run;
    if (!firstRun) throw new Error("retirement test requires first run provenance");

    executor.next(world.snapshot());
    const beforeWrongIdentity = executor.state();
    expect(executor.retireCurrentRun(firstRun.runId + 1)).toBeNull();
    expect(executor.state()).toEqual(beforeWrongIdentity);

    const retired = executor.retireCurrentRun(firstRun.runId);
    expect(retired).toMatchObject({
      run: { runId: firstRun.runId, cause: { kind: "cognition", sessionId: 7, cycleId: 3 } },
      task: { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" },
      stepsUsed: 1
    });
    expect(executor.state()).toMatchObject({
      status: "idle",
      task: null,
      failureCode: null,
      stepsUsed: 1,
      run: { runId: firstRun.runId }
    });
    expect(executor.next(world.snapshot())).toEqual({});
    expect(executor.retireCurrentRun(firstRun.runId)).toBeNull();

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" },
        { kind: "manual" }
      )
    ).toBe(true);
    expect(executor.state()).toMatchObject({
      status: "running",
      stepsUsed: 0,
      run: { runId: firstRun.runId + 1, cause: { kind: "manual" } },
      task: { targetId: "item.mug" }
    });
  });
});
