import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor, type ExecutorRunCause } from "./deterministic-executor";
import { ExecutionDriver } from "./execution-driver";

function pickupTrace(cause: ExecutorRunCause) {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
  if (!npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
    throw new Error("R4c fixture requires NPC-001 and the lantern.");
  }

  npc.position = { x: 760, y: 390 };
  lantern.position = { x: 800, y: 390 };
  lantern.heldBy = null;
  npc.heldItemId = null;

  const world = new World(specimen);
  const executor = new DeterministicExecutor();
  const driver = new ExecutionDriver(world, executor);

  expect(
    executor.start(
      { kind: "approach-and-interact", actorId: npc.id, targetId: lantern.id },
      cause
    )
  ).toBe(true);

  const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
  expect(frame.executorActionResult).toMatchObject({
    status: "succeeded",
    code: "picked_up_item",
    actorId: npc.id,
    targetId: lantern.id
  });

  return { frame, driver };
}

describe("recovery R4c executor run causation", () => {
  it("allocates run IDs only for accepted tasks and preserves an in-flight cause across refused replacement", () => {
    const world = new World(createP1Specimen());
    const executor = new DeterministicExecutor();

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: "npc.001", targetId: "missing.target" },
        { kind: "manual" }
      )
    ).toBe(true);
    expect(executor.state().run).toEqual({ runId: 1, cause: { kind: "manual" } });

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" },
        { kind: "cognition" }
      )
    ).toBe(false);
    expect(executor.state().run).toEqual({ runId: 1, cause: { kind: "manual" } });

    expect(executor.next(world.snapshot())).toEqual({});
    expect(executor.state()).toMatchObject({
      status: "failed",
      failureCode: "target_not_found",
      run: { runId: 1, cause: { kind: "manual" } }
    });

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" },
        { kind: "cognition" }
      )
    ).toBe(true);
    expect(executor.state().run).toEqual({ runId: 2, cause: { kind: "cognition" } });
  });

  it("distinguishes otherwise identical manual and cognition executor actions in frame and bounded history provenance", () => {
    const manual = pickupTrace({ kind: "manual" });
    const cognition = pickupTrace({ kind: "cognition" });

    expect(manual.frame.executorActionRun).toEqual({ runId: 1, cause: { kind: "manual" } });
    expect(cognition.frame.executorActionRun).toEqual({ runId: 1, cause: { kind: "cognition" } });

    const manualAttempts = manual.driver.recentActionAttempts();
    const cognitionAttempts = cognition.driver.recentActionAttempts();
    expect(manualAttempts).toHaveLength(1);
    expect(cognitionAttempts).toHaveLength(1);
    expect(manualAttempts[0]).toMatchObject({
      source: "executor",
      code: "picked_up_item",
      executorRun: { runId: 1, cause: { kind: "manual" } }
    });
    expect(cognitionAttempts[0]).toMatchObject({
      source: "executor",
      code: "picked_up_item",
      executorRun: { runId: 1, cause: { kind: "cognition" } }
    });

    const { executorRun: manualRun, ...manualSemantic } = manualAttempts[0]!;
    const { executorRun: cognitionRun, ...cognitionSemantic } = cognitionAttempts[0]!;
    expect(manualSemantic).toEqual(cognitionSemantic);
    expect(manualRun).not.toEqual(cognitionRun);

    if (!manualAttempts[0]?.executorRun) throw new Error("Expected executor provenance.");
    manualAttempts[0].executorRun.runId = 999;
    expect(manual.driver.recentActionAttempts()[0]?.executorRun).toEqual({
      runId: 1,
      cause: { kind: "manual" }
    });
  });
});
