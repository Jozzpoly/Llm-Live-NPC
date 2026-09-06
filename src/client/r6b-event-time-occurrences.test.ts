import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { ExecutionDriver } from "../execution/execution-driver";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { deriveE1SemanticActionObservedChanges } from "./e1-sensory-events";

function heldMugFixture() {
  const specimen = createP1Specimen();
  const npc = specimen.entities.find((entity) => entity.id === "npc.001");
  const player = specimen.entities.find((entity) => entity.id === "player.jozz");
  const mug = specimen.entities.find((entity) => entity.id === "item.mug");
  if (!npc || npc.kind !== "npc" || !player || player.kind !== "player" || !mug || mug.kind !== "item") {
    throw new Error("Missing R6b event-time fixture.");
  }

  npc.position = { x: 760, y: 390 };
  player.position = { x: 680, y: 390 };
  player.heldItemId = mug.id;
  mug.heldBy = player.id;
  mug.position = { ...player.position };

  const world = new World(specimen);
  const driver = new ExecutionDriver(world, new DeterministicExecutor());
  return { world, driver, npc, player, mug };
}

describe("R6b1 frame-local event-time semantic occurrences", () => {
  it("preserves separate post-action read models for same-frame drop then pickup", () => {
    const { world, driver, player, mug } = heldMugFixture();

    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: player.id },
        { action: "interact", actorId: player.id }
      ]
    });

    expect(frame.playerActionResults.map((result) => result.code)).toEqual([
      "dropped_item",
      "picked_up_item"
    ]);
    expect(frame.semanticActionOccurrences).toHaveLength(2);
    expect(frame.semanticActionOccurrences.map((entry) => entry.result.code)).toEqual([
      "dropped_item",
      "picked_up_item"
    ]);

    const droppedSnapshot = frame.semanticActionOccurrences[0]!.snapshot;
    const pickedSnapshot = frame.semanticActionOccurrences[1]!.snapshot;
    expect(droppedSnapshot.entities.find((entity) => entity.id === player.id)).toMatchObject({
      kind: "player",
      heldItemId: null
    });
    expect(droppedSnapshot.entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: null
    });
    expect(pickedSnapshot.entities.find((entity) => entity.id === player.id)).toMatchObject({
      kind: "player",
      heldItemId: mug.id
    });
    expect(pickedSnapshot.entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: player.id
    });

    expect(world.snapshot().entities.find((entity) => entity.id === mug.id)).toMatchObject({
      kind: "item",
      heldBy: player.id
    });
  });

  it("derives both transient holder changes in occurrence order despite baseline-equivalent final state", () => {
    const { world, driver, npc, player, mug } = heldMugFixture();
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [
        { action: "drop", actorId: player.id },
        { action: "interact", actorId: player.id }
      ]
    });

    expect(
      deriveE1SemanticActionObservedChanges(
        frame.semanticActionOccurrences,
        npc.id,
        (start, end) => world.hasLineOfSight(start, end)
      )
    ).toEqual([
      {
        kind: "item_holder_changed",
        itemId: mug.id,
        previousHolderId: player.id,
        holderId: null
      },
      {
        kind: "item_holder_changed",
        itemId: mug.id,
        previousHolderId: null,
        holderId: player.id
      }
    ]);
  });

  it("does not expose an event-time actor relation when the actor and item fail local visibility", () => {
    const { world, driver, npc, player } = heldMugFixture();
    npc.position = { x: 300, y: 390 };
    const relocated = new World({
      ...createP1Specimen(),
      entities: world.snapshot().entities.map((entity) =>
        entity.id === npc.id && entity.kind === "npc"
          ? { ...entity, position: { x: 300, y: 390 } }
          : entity
      )
    });
    const relocatedDriver = new ExecutionDriver(relocated, new DeterministicExecutor());

    const frame = relocatedDriver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });

    expect(
      deriveE1SemanticActionObservedChanges(
        frame.semanticActionOccurrences,
        npc.id,
        (start, end) => relocated.hasLineOfSight(start, end)
      )
    ).toEqual([]);
  });

  it("returns isolated occurrence snapshots that cannot mutate canonical World state", () => {
    const { world, driver, player } = heldMugFixture();
    const frame = driver.step({
      playerControl: { moveX: 0, moveY: 0 },
      playerActions: [{ action: "drop", actorId: player.id }]
    });

    const occurrence = frame.semanticActionOccurrences[0];
    if (!occurrence) throw new Error("Missing semantic occurrence.");
    occurrence.snapshot.entities[0]!.position.x = -9999;
    occurrence.result.message = "mutated outside execution";

    expect(world.snapshot().entities.some((entity) => entity.position.x === -9999)).toBe(false);
    expect(world.lastActionResult()?.message).not.toBe("mutated outside execution");
  });
});
