import { describe, expect, it } from "vitest";
import { recentRuntimeActionAttempts } from "./action-attempt-history";
import { DeterministicExecutor } from "./deterministic-executor";
import { ExecutionDriver } from "./execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";

describe("R4 execution causation lineage", () => {
  it("allocates monotonic executor runs and never replaces the cause of an in-flight run", () => {
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
        { kind: "cognition", correlationId: "e1:s1:r1:c1" }
      )
    ).toBe(false);
    expect(executor.state().run).toEqual({ runId: 1, cause: { kind: "manual" } });

    expect(
      executor.next(world.snapshot(), (actorId, targetId) => world.validateInteraction(actorId, targetId))
    ).toEqual({});
    expect(executor.state()).toMatchObject({
      status: "failed",
      failureCode: "target_not_found",
      run: { runId: 1, cause: { kind: "manual" } }
    });

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.lantern" },
        { kind: "cognition", correlationId: "e1:s1:r1:c1" }
      )
    ).toBe(true);
    expect(executor.state().run).toEqual({
      runId: 2,
      cause: { kind: "cognition", correlationId: "e1:s1:r1:c1" }
    });
  });

  it("retains manual executor cause and exact action-to-World-event correlation on a semantic outcome", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find((entity) => entity.id === "npc.001");
    const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
    if (!npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
      throw new Error("Execution causation fixture requires NPC-001 and the lantern.");
    }

    npc.position = { x: 760, y: 390 };
    lantern.position = { x: 800, y: 390 };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: npc.id, targetId: lantern.id },
        { kind: "manual" }
      )
    ).toBe(true);

    const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });

    expect(frame.executorActionRun).toEqual({ runId: 1, cause: { kind: "manual" } });
    expect(frame.executorActionResult).toMatchObject({
      status: "succeeded",
      code: "picked_up_item",
      actorId: npc.id,
      targetId: lantern.id,
      eventSeq: expect.any(Number)
    });

    const action = frame.executorActionResult;
    if (!action?.eventSeq) throw new Error("Semantic executor action must expose its correlated event sequence.");
    expect(world.recentEvents(128).find((event) => event.seq === action.eventSeq)).toMatchObject({
      type: "item.picked_up",
      actorId: npc.id,
      entityId: lantern.id
    });

    expect(frame.semanticActionOccurrences).toHaveLength(1);
    expect(frame.semanticActionOccurrences[0]).toMatchObject({
      source: "executor",
      result: { seq: action.seq, eventSeq: action.eventSeq },
      executorRun: { runId: 1, cause: { kind: "manual" } }
    });

    expect(recentRuntimeActionAttempts().at(-1)).toMatchObject({
      seq: action.seq,
      eventSeq: action.eventSeq,
      source: "executor",
      executorRun: { runId: 1, cause: { kind: "manual" } }
    });
  });
});
