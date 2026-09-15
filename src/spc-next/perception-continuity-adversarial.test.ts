import { describe, expect, it } from "vitest";
import type { CognitionBatch } from "./contracts";
import type { ResidentRuntime } from "./resident-runtime";
import { SpcWorldRuntime } from "./spc-world-runtime";

function worldWithResident(brainIntervalTicks = 1): { world: SpcWorldRuntime; resident: ResidentRuntime } {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_500, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_500, maxY: 1_000 }],
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  });
  const resident = world.addResident("resident.mira", "Mira", { x: 500, y: 500 }, {
    sightRadius: 100,
    brainIntervalTicks,
  });
  return { world, resident };
}

function privateContext(resident: ResidentRuntime, tick: number) {
  const batch: CognitionBatch = { residentId: resident.profile.id, requestedAtTick: tick, reasons: [] };
  return resident.cognitionContext(batch);
}

function sightPercepts(world: SpcWorldRuntime) {
  return world.residentDiagnostics("resident.mira").recentPercepts
    .filter((percept) => percept.phenomenon.startsWith("actor_sight_"));
}

function actorSight(world: SpcWorldRuntime, actorId: string) {
  return sightPercepts(world).filter((percept) => percept.actorId === actorId);
}

describe("SPC perception continuity adversarial gate", () => {
  it("does not manufacture enter/exit cognition churn from tiny edge-of-range jitter", () => {
    const { world, resident } = worldWithResident();
    world.addPlayer("player.jozz", { x: 599, y: 500 }, { maxSpeed: 120 });
    world.step();

    expect(actorSight(world, "player.jozz").filter((p) => p.phenomenon === "actor_sight_enter")).toHaveLength(1);
    expect(privateContext(resident, world.tick).knownActors.find((a) => a.id === "player.jozz")?.currentlyVisible).toBe(true);

    for (let cycle = 0; cycle < 12; cycle += 1) {
      world.setActorVelocity("player.jozz", { x: 120, y: 0 });
      world.step(); // sense 599, integrate to 601.
      world.setActorVelocity("player.jozz", { x: -120, y: 0 });
      world.step(); // sense 601, integrate back to 599.
      world.setActorVelocity("player.jozz", { x: 0, y: 0 });
      world.step(); // explicitly sense the returned 599 without cumulative drift.
    }

    const duringJitter = actorSight(world, "player.jozz");
    expect(duringJitter.filter((p) => p.phenomenon === "actor_sight_enter")).toHaveLength(1);
    expect(duringJitter.filter((p) => p.phenomenon === "actor_sight_exit")).toHaveLength(0);
    expect(privateContext(resident, world.tick).knownActors.find((a) => a.id === "player.jozz")?.currentlyVisible).toBe(true);

    world.setActorVelocity("player.jozz", { x: 120, y: 0 });
    world.step(12); // 24 units of real departure: well beyond the 12-unit release margin.
    const afterDeparture = actorSight(world, "player.jozz");
    expect(afterDeparture.filter((p) => p.phenomenon === "actor_sight_exit")).toHaveLength(1);
    expect(privateContext(resident, world.tick).knownActors.find((a) => a.id === "player.jozz")?.currentlyVisible).toBe(false);
  });

  it("keeps simultaneous actor sight histories independent when one leaves and the other remains", () => {
    const { world, resident } = worldWithResident();
    world.addPlayer("player.jozz", { x: 560, y: 500 }, { maxSpeed: 120 });
    world.addPlayer("player.ania", { x: 500, y: 560 }, { maxSpeed: 120 });
    world.step();

    const initial = privateContext(resident, world.tick).knownActors;
    expect(initial.find((a) => a.id === "player.jozz")?.currentlyVisible).toBe(true);
    expect(initial.find((a) => a.id === "player.ania")?.currentlyVisible).toBe(true);

    world.setActorVelocity("player.jozz", { x: 120, y: 0 });
    world.setActorVelocity("player.ania", { x: 0, y: 30 });
    world.step(30);

    const context = privateContext(resident, world.tick).knownActors;
    const jozz = context.find((a) => a.id === "player.jozz")!;
    const ania = context.find((a) => a.id === "player.ania")!;
    expect(jozz.currentlyVisible).toBe(false);
    expect(ania.currentlyVisible).toBe(true);
    expect(actorSight(world, "player.jozz").some((p) => p.phenomenon === "actor_sight_exit")).toBe(true);
    expect(actorSight(world, "player.ania").some((p) => p.phenomenon === "actor_sight_exit")).toBe(false);
    expect(jozz.lastKnownPosition).not.toEqual(ania.lastKnownPosition);
  });

  it("keeps semantic sight continuity independent from the local brain cadence", () => {
    const run = (brainIntervalTicks: number) => {
      const { world } = worldWithResident(brainIntervalTicks);
      world.addPlayer("player.jozz", { x: 560, y: 500 }, { maxSpeed: 60 });
      world.step();
      world.setActorVelocity("player.jozz", { x: 30, y: 0 });
      world.step(180);
      return actorSight(world, "player.jozz").map((percept) => ({
        tick: percept.tick,
        phenomenon: percept.phenomenon,
        spatial: percept.spatial,
      }));
    };

    expect(run(7)).toEqual(run(1));
  });
});
