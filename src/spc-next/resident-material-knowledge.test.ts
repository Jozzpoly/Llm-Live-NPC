import { describe, expect, it } from "vitest";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { SpcWorldRuntime } from "./spc-world-runtime";

describe("ResidentMaterialKnowledge", () => {
  it("retains last-known position instead of following hidden World movement", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
      regions: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 30,
    });
    world.addResident("resident.janek", "Janek", { x: 100, y: 100 }, { brainIntervalTicks: 99 });
    world.addPlayer("player.helper", { x: 200, y: 100 }, { maxSpeed: 180 });
    world.addMaterialObject({
      id: "crate.workshop.01",
      label: "Workshop crate",
      radius: 16,
      location: { kind: "free", position: { x: 200, y: 100 } },
    });

    const knowledge = new ResidentMaterialKnowledge("resident.janek", ["crate.workshop.01"], world);
    knowledge.sample();
    expect(knowledge.observation("crate.workshop.01")).toMatchObject({
      lastKnownPosition: { x: 200, y: 100 },
      currentlyVisible: true,
    });

    expect(world.attemptMaterialAction("player.helper", {
      kind: "pickup",
      objectId: "crate.workshop.01",
    })).toMatchObject({ status: "succeeded", code: "picked_up" });

    world.setActorMotionIntent("player.helper", { x: 180, y: 0 });
    world.step(100);
    world.setActorMotionIntent("player.helper", { x: 0, y: 0 });
    const helper = world.publicSnapshot().actors.find((actor) => actor.id === "player.helper")!;
    expect(helper.position.x).toBeGreaterThan(700);
    expect(world.attemptMaterialAction("player.helper", {
      kind: "place",
      objectId: "crate.workshop.01",
      position: helper.position,
    })).toMatchObject({ status: "succeeded", code: "placed" });

    knowledge.sample();
    expect(world.materialObject("crate.workshop.01")?.location).toMatchObject({
      kind: "free",
      position: helper.position,
    });
    expect(knowledge.observation("crate.workshop.01")).toEqual({
      objectId: "crate.workshop.01",
      lastKnownPosition: { x: 200, y: 100 },
      observedAtTick: 0,
      currentlyVisible: false,
    });
  });

  it("does not acquire a stable object identity that was not authored as recognizable", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 },
      regions: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    world.addResident("resident.janek", "Janek", { x: 100, y: 100 }, { brainIntervalTicks: 99 });
    world.addMaterialObject({
      id: "crate.unknown.01",
      label: "Unfamiliar crate",
      radius: 16,
      location: { kind: "free", position: { x: 140, y: 100 } },
    });
    const knowledge = new ResidentMaterialKnowledge("resident.janek", [], world);
    knowledge.sample();
    expect(knowledge.observation("crate.unknown.01")).toBeNull();
  });
});
