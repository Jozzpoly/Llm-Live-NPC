import { describe, expect, it } from "vitest";
import type { CognitionBatch, SightBlocker } from "./contracts";
import type { ResidentRuntime } from "./resident-runtime";
import { SpcWorldRuntime } from "./spc-world-runtime";

const fullWall: SightBlocker = {
  id: "wall.full",
  label: "Full wall",
  bounds: { minX: 490, minY: 100, maxX: 510, maxY: 900 },
};

const doorway: readonly SightBlocker[] = [
  { id: "wall.top", label: "Upper wall", bounds: { minX: 490, minY: 100, maxX: 510, maxY: 460 } },
  { id: "wall.bottom", label: "Lower wall", bounds: { minX: 490, minY: 540, maxX: 510, maxY: 900 } },
];

function fixture(blockers: readonly SightBlocker[], sightRadius = 500): {
  world: SpcWorldRuntime;
  resident: ResidentRuntime;
} {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
    sightBlockers: blockers,
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  });
  const resident = world.addResident("resident.mira", "Mira", { x: 300, y: 500 }, { sightRadius });
  world.addPlayer("player.jozz", { x: 700, y: 500 }, { maxSpeed: 180 });
  return { world, resident };
}

function context(resident: ResidentRuntime, tick: number) {
  const batch: CognitionBatch = { residentId: resident.profile.id, requestedAtTick: tick, reasons: [] };
  return resident.cognitionContext(batch);
}

function actorPercepts(world: SpcWorldRuntime) {
  return world.residentDiagnostics("resident.mira").recentPercepts
    .filter((percept) => percept.actorId === "player.jozz");
}

describe("SPC physical sight integration red gate", () => {
  it("does not acquire an actor through an opaque wall even inside radial sight range", () => {
    const { world, resident } = fixture([fullWall]);
    world.step();

    expect(actorPercepts(world).filter((p) => p.phenomenon === "actor_sight_enter")).toEqual([]);
    expect(context(resident, world.tick).knownActors.find((actor) => actor.id === "player.jozz")).toBeUndefined();
  });

  it("keeps a geometrically open doorway visible rather than treating neighboring wall pieces as one occluder", () => {
    const { world, resident } = fixture(doorway);
    world.step();

    expect(actorPercepts(world).filter((p) => p.phenomenon === "actor_sight_enter")).toHaveLength(1);
    expect(context(resident, world.tick).knownActors.find((actor) => actor.id === "player.jozz")?.currentlyVisible).toBe(true);
  });

  it("drops an already-acquired contact when geometry occludes it before radial range is lost", () => {
    const { world, resident } = fixture(doorway);
    world.step();
    expect(context(resident, world.tick).knownActors.find((actor) => actor.id === "player.jozz")?.currentlyVisible).toBe(true);

    world.setActorVelocity("player.jozz", { x: 0, y: -120 });
    world.step(60);

    const player = world.publicSnapshot().actors.find((actor) => actor.id === "player.jozz")!;
    expect(Math.hypot(player.position.x - 300, player.position.y - 500)).toBeLessThan(500);
    expect(actorPercepts(world).filter((p) => p.phenomenon === "actor_sight_exit")).toHaveLength(1);
    expect(context(resident, world.tick).knownActors.find((actor) => actor.id === "player.jozz")?.currentlyVisible).toBe(false);
  });

  it("does not convert an occluded visual World occurrence into private exact evidence", () => {
    const { world } = fixture([fullWall]);
    world.emitInteraction("player.jozz", "item.hammer", "uses a hammer", 500);
    world.step();

    expect(actorPercepts(world).filter((percept) => percept.phenomenon === "interaction")).toEqual([]);
  });
});
