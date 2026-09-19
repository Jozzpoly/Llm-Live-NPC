import { describe, expect, it } from "vitest";
import type { CognitionBatch } from "./contracts";
import type { ResidentRuntime } from "./resident-runtime";
import { SpcWorldRuntime } from "./spc-world-runtime";

function createWorld(): { world: SpcWorldRuntime; resident: ResidentRuntime } {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 2_000, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 2_000, maxY: 1_000 }],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
  const resident = world.addResident("resident.mira", "Mira", { x: 400, y: 500 }, {
    sightRadius: 300,
    brainIntervalTicks: 1,
  });
  world.addPlayer("player.jozz", { x: 900, y: 500 }, { maxSpeed: 240 });
  return { world, resident };
}

function privateContext(resident: ResidentRuntime, tick: number) {
  const syntheticBatch: CognitionBatch = {
    residentId: resident.profile.id,
    requestedAtTick: tick,
    reasons: [],
  };
  return resident.cognitionContext(syntheticBatch);
}

function percepts(world: SpcWorldRuntime) {
  return world.residentDiagnostics("resident.mira").recentPercepts;
}

function stepUntil(
  world: SpcWorldRuntime,
  predicate: () => boolean,
  maxSteps: number,
): void {
  for (let i = 0; i < maxSteps; i += 1) {
    if (predicate()) return;
    world.step();
  }
  expect(predicate(), "condition should become true within bounded simulation steps").toBe(true);
}

describe("SPC perception continuity integration", () => {
  it("carries one actor through enter -> bounded updates -> exit while mind and World stay causally aligned", () => {
    const { world, resident } = createWorld();
    world.setActorVelocity("player.jozz", { x: -180, y: 0 });

    stepUntil(world, () => percepts(world).some((p) => p.phenomenon === "actor_sight_enter"), 100);
    const enter = percepts(world).find((p) => p.phenomenon === "actor_sight_enter")!;
    expect(enter.modality).toBe("sight");
    expect(enter.spatial.kind).toBe("exact");

    let actor = privateContext(resident, world.tick).knownActors.find((candidate) => candidate.id === "player.jozz")!;
    expect(actor.currentlyVisible).toBe(true);
    expect(actor.lastKnownPosition).toEqual(enter.spatial.kind === "exact" ? enter.spatial.position : null);
    const visibilityAcquiredTick = actor.visibilityChangedTick;

    stepUntil(world, () => percepts(world).some((p) => p.phenomenon === "actor_sight_update"), 60);
    const firstUpdate = percepts(world).find((p) => p.phenomenon === "actor_sight_update")!;
    actor = privateContext(resident, world.tick).knownActors.find((candidate) => candidate.id === "player.jozz")!;
    expect(actor.currentlyVisible).toBe(true);
    expect(actor.visibilityChangedTick).toBe(visibilityAcquiredTick);
    expect(actor.lastObservedTick).toBe(firstUpdate.tick);
    expect(actor.lastKnownPosition).toEqual(firstUpdate.spatial.kind === "exact" ? firstUpdate.spatial.position : null);

    world.setActorVelocity("player.jozz", { x: 240, y: 0 });
    stepUntil(world, () => percepts(world).some((p) => p.phenomenon === "actor_sight_exit"), 220);

    const all = percepts(world);
    const exitIndex = all.findIndex((p) => p.phenomenon === "actor_sight_exit");
    expect(exitIndex).toBeGreaterThan(0);
    const exit = all[exitIndex]!;
    expect(exit.spatial).toEqual({ kind: "none" });
    const exactBeforeExit = [...all.slice(0, exitIndex)].reverse()
      .find((p) => p.actorId === "player.jozz" && p.spatial.kind === "exact")!;

    actor = privateContext(resident, world.tick).knownActors.find((candidate) => candidate.id === "player.jozz")!;
    expect(actor.currentlyVisible).toBe(false);
    expect(actor.visibilityChangedTick).toBe(exit.tick);
    expect(actor.lastObservedTick).toBe(exactBeforeExit.tick);
    expect(actor.lastKnownPosition).toEqual(
      exactBeforeExit.spatial.kind === "exact" ? exactBeforeExit.spatial.position : null,
    );

    const sightUpdates = all.filter((p) => p.phenomenon === "actor_sight_update");
    expect(sightUpdates.length).toBeGreaterThan(0);
    expect(sightUpdates.length).toBeLessThan(40);

    const visibilityPressure = resident.semanticPressureDecisions().filter(
      (decision) => decision.code === "actor_visibility",
    );
    expect(visibilityPressure).toEqual([
      expect.objectContaining({
        evidenceId: enter.id,
        disposition: "observation_only",
      }),
      expect.objectContaining({
        evidenceId: exit.id,
        disposition: "observation_only",
      }),
    ]);
    expect(resident.pendingCognitionReasons()).toEqual([]);
    expect(resident.semanticPressureDecisions().some(
      (decision) => decision.disposition === "unresolved"
        && decision.summary.includes("moved while visible"),
    )).toBe(false);
  });

  it("does not let the fast execution sensor silently advance durable actor memory below the semantic sample threshold", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
      regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    const resident = world.addResident("resident.mira", "Mira", { x: 300, y: 500 }, {
      sightRadius: 300,
      brainIntervalTicks: 1,
    });
    world.addPlayer("player.jozz", { x: 500, y: 500 }, { maxSpeed: 60 });

    world.step();
    const enter = percepts(world).find((p) => p.phenomenon === "actor_sight_enter")!;
    expect(enter.spatial.kind).toBe("exact");
    const enteredPosition = enter.spatial.kind === "exact" ? enter.spatial.position : null;

    world.setActorVelocity("player.jozz", { x: 60, y: 0 });
    world.step(10); // 10 units: fast sensor sees change every tick, semantic threshold is 24 units / 1 s.

    expect(percepts(world).filter((p) => p.phenomenon === "actor_sight_update")).toHaveLength(0);
    const playerWorldPosition = world.publicSnapshot().actors.find((actor) => actor.id === "player.jozz")!.position;
    expect(playerWorldPosition.x).toBeGreaterThan(enteredPosition!.x);

    const actorMemory = privateContext(resident, world.tick).knownActors.find((candidate) => candidate.id === "player.jozz")!;
    expect(actorMemory.currentlyVisible).toBe(true);
    expect(actorMemory.lastKnownPosition).toEqual(enteredPosition);
    expect(actorMemory.lastObservedTick).toBe(enter.tick);
  });

  it("reacquires sight as a new causal episode after losing the actor", () => {
    const { world, resident } = createWorld();
    world.setActorVelocity("player.jozz", { x: -240, y: 0 });
    stepUntil(world, () => percepts(world).some((p) => p.phenomenon === "actor_sight_enter"), 100);

    world.setActorVelocity("player.jozz", { x: 240, y: 0 });
    stepUntil(world, () => percepts(world).some((p) => p.phenomenon === "actor_sight_exit"), 220);
    const firstExit = percepts(world).find((p) => p.phenomenon === "actor_sight_exit")!;
    expect(privateContext(resident, world.tick).knownActors.find((a) => a.id === "player.jozz")?.currentlyVisible).toBe(false);

    world.setActorVelocity("player.jozz", { x: -240, y: 0 });
    stepUntil(world, () => percepts(world).filter((p) => p.phenomenon === "actor_sight_enter").length >= 2, 220);
    const entries = percepts(world).filter((p) => p.phenomenon === "actor_sight_enter");
    const secondEnter = entries.at(-1)!;
    const reacquired = privateContext(resident, world.tick).knownActors.find((a) => a.id === "player.jozz")!;

    expect(secondEnter.tick).toBeGreaterThan(firstExit.tick);
    expect(reacquired.currentlyVisible).toBe(true);
    expect(reacquired.visibilityChangedTick).toBe(secondEnter.tick);
    expect(reacquired.lastKnownPosition).toEqual(secondEnter.spatial.kind === "exact" ? secondEnter.spatial.position : null);
  });
});
