import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "./deterministic-executor";

describe("executor task start contract", () => {
  it("refuses to replace a running task and preserves its provenance", () => {
    const executor = new DeterministicExecutor();

    expect(
      executor.start({
        kind: "approach-and-interact",
        actorId: "npc.001",
        targetId: "item.mug"
      })
    ).toBe(true);

    const before = executor.state();

    expect(
      executor.start({
        kind: "approach-and-interact",
        actorId: "npc.001",
        targetId: "item.lantern"
      })
    ).toBe(false);
    expect(executor.state()).toEqual(before);
  });
});
