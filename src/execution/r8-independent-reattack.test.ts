import { describe, expect, it } from "vitest";
import type { E1CycleRequest } from "../agent/e1-grounding";
import { E1AgentHarness } from "../client/e1-agent-harness";
import { resolveDirectInteractionTarget } from "../client/pointer-targeting";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { DeterministicExecutor } from "./deterministic-executor";
import { ExecutionDriver } from "./execution-driver";

function semanticFixture() {
  const specimen = createP1Specimen();
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!player || player.kind !== "player" || !npc || npc.kind !== "npc" || !mug || mug.kind !== "item") {
    throw new Error("R8 semantic fixture requires player, NPC-001 and mug.");
  }
  return { specimen, player, npc, mug };
}

describe("R8 independent repaired-substrate re-attack", () => {
  it("disambiguates two semantic actions on the same actor/item/tick with exact distinct event sequences", () => {
    const { specimen, player, mug } = semanticFixture();
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: player.position.x, y: player.position.y - player.radius - mug.radius };

    const world = new World(specimen);
    const driver = new ExecutionDriver(world, new DeterministicExecutor());
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: player.id },
        { action: "interact", actorId: player.id, targetId: mug.id }
      ]
    });

    expect(frame.playerActionResults).toHaveLength(2);
    const drop = frame.playerActionResults[0]!;
    const pickup = frame.playerActionResults[1]!;
    expect(drop).toMatchObject({ status: "succeeded", code: "dropped_item", tick: pickup.tick });
    expect(pickup).toMatchObject({ status: "succeeded", code: "picked_up_item", tick: drop.tick });
    expect(drop.targetId).toBe(mug.id);
    expect(pickup.targetId).toBe(mug.id);
    expect(drop.eventSeq).toEqual(expect.any(Number));
    expect(pickup.eventSeq).toEqual(expect.any(Number));
    expect(drop.eventSeq).not.toBe(pickup.eventSeq);
    expect(drop.eventSeq!).toBeLessThan(pickup.eventSeq!);

    expect(world.recentEvents(128).find((event) => event.seq === drop.eventSeq)).toMatchObject({
      type: "item.dropped",
      actorId: player.id,
      entityId: mug.id,
      tick: drop.tick
    });
    expect(world.recentEvents(128).find((event) => event.seq === pickup.eventSeq)).toMatchObject({
      type: "item.picked_up",
      actorId: player.id,
      entityId: mug.id,
      tick: pickup.tick
    });

    expect(frame.semanticActionOccurrences).toHaveLength(2);
    expect(frame.semanticActionOccurrences[0]!.snapshot.entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });
    expect(frame.semanticActionOccurrences[1]!.snapshot.entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: player.id
    });
  });

  it("keeps World legality and canonical outcome identical across manual and cognition executor causes", () => {
    function preparedRun(cause: { kind: "manual" } | { kind: "cognition"; correlationId: string }) {
      const specimen = createP1Specimen();
      const npc = specimen.entities.find((entity) => entity.id === "npc.001");
      const lantern = specimen.entities.find((entity) => entity.id === "item.lantern");
      if (!npc || npc.kind !== "npc" || !lantern || lantern.kind !== "item") {
        throw new Error("R8 cause-independence fixture requires NPC-001 and lantern.");
      }
      npc.position = { x: 760, y: 390 };
      lantern.position = { x: 800, y: 390 };

      const world = new World(specimen);
      const executor = new DeterministicExecutor();
      const driver = new ExecutionDriver(world, executor);
      const legalityBefore = world.validateInteraction(npc.id, lantern.id);
      expect(executor.start({ kind: "approach-and-interact", actorId: npc.id, targetId: lantern.id }, cause)).toBe(true);
      const frame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
      return { world, executor, frame, legalityBefore };
    }

    const manual = preparedRun({ kind: "manual" });
    const cognition = preparedRun({ kind: "cognition", correlationId: "independent-r8" });

    expect(manual.legalityBefore).toEqual(cognition.legalityBefore);
    expect(manual.frame.executorActionResult).toEqual(cognition.frame.executorActionResult);
    expect(manual.world.snapshot()).toEqual(cognition.world.snapshot());
    expect(manual.world.recentEvents(128)).toEqual(cognition.world.recentEvents(128));
    expect(manual.world.lastActionResult()).toEqual(cognition.world.lastActionResult());
    expect(manual.executor.state()).toMatchObject({ status: "succeeded", run: { cause: { kind: "manual" } } });
    expect(cognition.executor.state()).toMatchObject({
      status: "succeeded",
      run: { cause: { kind: "cognition", correlationId: "independent-r8" } }
    });
  });

  it("preserves presentation-side NPC targeting while rejecting the old generic actor interaction without semantic evidence", () => {
    const world = new World(createP1Specimen());
    const snapshot = world.snapshot();
    const npc = snapshot.entities.find((entity) => entity.id === "npc.001");
    if (!npc || npc.kind !== "npc") throw new Error("R8 actor-interaction fixture requires NPC-001.");

    expect(resolveDirectInteractionTarget(snapshot.entities, new Map(), npc.position, 1, 24)).toBe(npc.id);
    const eventsBefore = world.recentEvents(128);
    const driver = new ExecutionDriver(world, new DeterministicExecutor());
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "interact", actorId: world.playerId, targetId: npc.id }]
    });

    expect(frame.playerActionResults[0]).toMatchObject({
      status: "rejected",
      code: "target_not_interactable",
      targetId: npc.id
    });
    expect(frame.playerActionResults[0]!.eventSeq).toBeUndefined();
    expect(frame.semanticActionOccurrences).toEqual([]);
    expect(world.recentEvents(128)).toEqual(eventsBefore);
  });

  it("refuses to attribute an old cognition outcome after executor ownership has moved to another run", async () => {
    const { specimen, player, npc, mug } = semanticFixture();
    npc.position = { x: 760, y: 390 };
    player.position = { x: 680, y: 390 };
    player.heldItemId = mug.id;
    mug.heldBy = player.id;
    mug.position = { x: player.position.x, y: player.position.y - player.radius - mug.radius };

    const world = new World(specimen);
    const executor = new DeterministicExecutor();
    const driver = new ExecutionDriver(world, executor);
    const requests: E1CycleRequest[] = [];
    const harness = new E1AgentHarness(world, executor, async (request) => {
      requests.push(structuredClone(request));
      const targetId = request.perception.fetchableItemIds[0];
      return {
        cycleId: request.cycleId,
        decision: targetId ? { kind: "fetch" as const, targetId } : { kind: "wait" as const },
        model: "r8-fake-model",
        gatewayLogId: `r8-${request.cycleId}`,
        latencyMs: 1
      };
    });

    harness.arm();
    const dropFrame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });
    const firstCycle = harness.afterExecutionStep(dropFrame, 1000);
    if (!firstCycle) throw new Error("R8 expected the player drop to open one cognition cycle.");
    await firstCycle;
    expect(requests).toHaveLength(1);
    expect(executor.state().run).toMatchObject({ runId: 1, cause: { kind: "cognition" } });

    const cognitionPickupFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(cognitionPickupFrame.executorActionResult).toMatchObject({ status: "succeeded", code: "picked_up_item" });
    expect(executor.state()).toMatchObject({ status: "succeeded", run: { runId: 1 } });

    // Deliberately violate the browser's immediate harness-callback ordering to
    // attack the lineage join: move executor ownership before the harness sees
    // run #1's terminal frame. Matching target identity must not be enough.
    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: npc.id, targetId: mug.id },
        { kind: "manual" }
      )
    ).toBe(true);
    expect(executor.state().run).toEqual({ runId: 2, cause: { kind: "manual" } });

    expect(harness.afterExecutionStep(cognitionPickupFrame, 1034)).toBeNull();
    expect(harness.state().experience).toBeNull();
    expect(harness.state().experienceLineage).toBeNull();

    const secondRunFrame = driver.step({ playerControl: { moveX: 0, moveY: 0 } });
    expect(executor.state()).toMatchObject({ status: "succeeded", run: { runId: 2, cause: { kind: "manual" } } });
    expect(harness.afterExecutionStep(secondRunFrame, 1068)).toBeNull();
    expect(harness.state().experience).toBeNull();
    expect(harness.state().experienceLineage).toBeNull();
  });
});
