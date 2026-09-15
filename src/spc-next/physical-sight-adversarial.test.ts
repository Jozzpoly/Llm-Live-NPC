import { describe, expect, it } from "vitest";
import type { SightBlocker } from "./contracts";
import { SpcWorldRuntime } from "./spc-world-runtime";

function worldWith(
  blockers: readonly SightBlocker[],
  observer = { x: 300, y: 500 },
  target = { x: 700, y: 500 },
): SpcWorldRuntime {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
    sightBlockers: blockers,
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  });
  world.addResident("resident.mira", "Mira", observer, { sightRadius: 500, hearingRadius: 500 });
  world.addPlayer("player.jozz", target, { maxSpeed: 180, hearingRadius: 500 });
  return world;
}

function jozzPercepts(world: SpcWorldRuntime) {
  return world.residentDiagnostics("resident.mira").recentPercepts
    .filter((percept) => percept.actorId === "player.jozz");
}

function sightLifecycle(world: SpcWorldRuntime) {
  return jozzPercepts(world)
    .filter((percept) => percept.phenomenon.startsWith("actor_sight_"))
    .map((percept) => ({ tick: percept.tick, phenomenon: percept.phenomenon, spatial: percept.spatial }));
}

describe("SPC physical point-sight adversarial qualification", () => {
  it("snapshots authored blockers at World construction instead of retaining caller mutation authority", () => {
    const blockers: SightBlocker[] = [{
      id: "wall",
      label: "Wall",
      bounds: { minX: 490, minY: 100, maxX: 510, maxY: 900 },
    }];
    const world = worldWith(blockers);

    blockers[0]!.bounds.minX = 900;
    blockers[0]!.bounds.maxX = 920;
    blockers.splice(0, 1);
    world.step();

    expect(sightLifecycle(world)).toEqual([]);
  });

  it("preserves open-interior tangent semantics through the live World sensor gate", () => {
    const wall: SightBlocker = {
      id: "wall",
      label: "Wall",
      bounds: { minX: 490, minY: 400, maxX: 510, maxY: 460 },
    };

    const tangent = worldWith([wall], { x: 300, y: 460 }, { x: 700, y: 460 });
    tangent.step();
    expect(sightLifecycle(tangent).filter((event) => event.phenomenon === "actor_sight_enter")).toHaveLength(1);

    const interior = worldWith([wall], { x: 300, y: 459.999 }, { x: 700, y: 459.999 });
    interior.step();
    expect(sightLifecycle(interior)).toEqual([]);
  });

  it("is invariant to authored blocker order at the World perception boundary", () => {
    const blockers: SightBlocker[] = [
      { id: "z.wall", label: "Z wall", bounds: { minX: 490, minY: 100, maxX: 510, maxY: 440 } },
      { id: "a.wall", label: "A wall", bounds: { minX: 490, minY: 560, maxX: 510, maxY: 900 } },
    ];
    const first = worldWith(blockers);
    const second = worldWith([...blockers].reverse());
    first.step();
    second.step();

    expect(sightLifecycle(first)).toEqual(sightLifecycle(second));
    expect(sightLifecycle(first).filter((event) => event.phenomenon === "actor_sight_enter")).toHaveLength(1);
  });

  it("does not let distance-release hysteresis preserve contact after a real occlusion", () => {
    const blockers: SightBlocker[] = [
      { id: "wall.top", label: "Upper wall", bounds: { minX: 490, minY: 100, maxX: 510, maxY: 490 } },
      { id: "wall.bottom", label: "Lower wall", bounds: { minX: 490, minY: 510, maxX: 510, maxY: 900 } },
    ];
    const world = worldWith(blockers, { x: 300, y: 500 }, { x: 598, y: 500 });
    world.step();
    expect(sightLifecycle(world).at(-1)?.phenomenon).toBe("actor_sight_enter");

    world.setActorVelocity("player.jozz", { x: 0, y: -180 });
    world.step(4);

    const player = world.publicSnapshot().actors.find((actor) => actor.id === "player.jozz")!;
    expect(Math.hypot(player.position.x - 300, player.position.y - 500)).toBeLessThan(500 + 12);
    expect(sightLifecycle(world).filter((event) => event.phenomenon === "actor_sight_exit")).toHaveLength(1);
  });

  it("keeps acoustic delivery independent: an opaque sight blocker does not silently become a sound model", () => {
    const world = worldWith([{
      id: "wall",
      label: "Wall",
      bounds: { minX: 490, minY: 100, maxX: 510, maxY: 900 },
    }]);

    world.speak("player.jozz", "Mira, słyszysz mnie?", 500, ["resident.mira"]);
    world.step();

    const percepts = jozzPercepts(world);
    const hearing = percepts.filter((percept) => percept.phenomenon === "speech");
    expect(hearing).toHaveLength(1);
    expect(hearing[0]?.modality).toBe("hearing");
    expect(hearing[0]?.spatial.kind).not.toBe("exact");
    expect(percepts.filter((percept) => percept.phenomenon === "actor_sight_enter")).toEqual([]);
  });

  it("applies the same physical sight truth to event-time visual evidence and persistent actor sight", () => {
    const wall: SightBlocker = {
      id: "wall",
      label: "Wall",
      bounds: { minX: 490, minY: 100, maxX: 510, maxY: 900 },
    };
    const world = worldWith([wall]);
    world.emitInteraction("player.jozz", "item.hammer", "uses hammer", 500);
    world.step();

    expect(jozzPercepts(world).filter((percept) => percept.modality === "sight")).toEqual([]);
  });
});
