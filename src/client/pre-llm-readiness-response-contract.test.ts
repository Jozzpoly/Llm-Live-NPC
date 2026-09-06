import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { E1AgentHarness } from "./e1-agent-harness";

describe("pre-LLM cognition response-contract characterization", () => {
  it("shows that a mismatched provider cycleId consumes the triggering attempt and does not retry unchanged state", async () => {
    const specimen = createP1Specimen();
    const player = specimen.entities.find((entity) => entity.id === "player.jozz");
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const mug = specimen.entities.find((entity) => entity.id === "item.mug");
    if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
      throw new Error("Missing mismatched-response fixtures.");
    }

    npc.position = { x: 760, y: 390 };
    player.position = { x: 680, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: 680, y: 364 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    let providerCalls = 0;
    const harness = new E1AgentHarness(world, executor, async (request) => {
      providerCalls += 1;
      return {
        cycleId: request.cycleId + 999,
        decision: { kind: "wait" },
        model: "mismatched-cycle-probe",
        gatewayLogId: "mismatch-log",
        latencyMs: 1
      };
    });

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const run = harness.afterExecutionStep(dropFrame, 1000);
    expect(run).not.toBeNull();
    await run!;

    expect(providerCalls).toBe(1);
    expect(harness.state()).toMatchObject({
      armed: true,
      inFlight: false,
      cyclesUsed: 1,
      requestStatus: "request_error",
      decisionValidation: "E1 cycle mismatch: expected 1, received 1000."
    });

    const unchangedFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(harness.afterExecutionStep(unchangedFrame, 5000)).toBeNull();
    expect(providerCalls).toBe(1);
    expect(harness.state()).toMatchObject({ cyclesUsed: 1, requestStatus: "request_error" });
  });
});
