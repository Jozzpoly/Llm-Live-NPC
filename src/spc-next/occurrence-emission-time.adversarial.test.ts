import { describe, expect, it } from "vitest";
import { SpcWorldRuntime } from "./spc-world-runtime";

function baseWorld(): SpcWorldRuntime {
  return new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 2_000, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 2_000, maxY: 1_000 }],
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  });
}

function speech(world: SpcWorldRuntime, residentId: string, text: string) {
  return world.residentDiagnostics(residentId).recentPercepts.find((percept) => percept.text === text);
}

function addSpeaker(world: SpcWorldRuntime, id = "resident.speaker", position = { x: 500, y: 500 }): void {
  world.addResident(id, "Speaker", position, { brainIntervalTicks: 100, hearingRadius: 500, sightRadius: 500 });
}

describe("SPC occurrence witness snapshots — adversarial qualification", () => {
  it("does not let a resident added after emission become a retroactive witness", () => {
    const world = baseWorld();
    addSpeaker(world);

    const occurrence = world.speak("resident.speaker", "before you existed", 400);
    world.addResident("resident.late", "Late", { x: 520, y: 500 }, { hearingRadius: 500, brainIntervalTicks: 100 });
    world.step();

    expect(occurrence.tick).toBe(0);
    expect(speech(world, "resident.late", "before you existed")).toBeUndefined();
  });

  it("keeps witness eligibility and hearing cues resident-local at emission time", () => {
    const world = baseWorld();
    addSpeaker(world);
    world.addResident("resident.near", "Near", { x: 560, y: 500 }, {
      hearingRadius: 500,
      maxSpeed: 6_000,
      brainIntervalTicks: 100,
    });
    world.addResident("resident.edge", "Edge", { x: 880, y: 500 }, {
      hearingRadius: 400,
      maxSpeed: 6_000,
      brainIntervalTicks: 100,
    });
    world.addResident("resident.out", "Out", { x: 920, y: 500 }, {
      hearingRadius: 400,
      brainIntervalTicks: 100,
    });

    world.speak("resident.speaker", "one event, separate witnesses", 500, ["resident.near"]);
    world.setActorVelocity("resident.near", { x: -6_000, y: 0 });
    world.setActorVelocity("resident.edge", { x: 6_000, y: 0 });
    world.step();

    const near = speech(world, "resident.near", "one event, separate witnesses");
    const edge = speech(world, "resident.edge", "one event, separate witnesses");
    const out = speech(world, "resident.out", "one event, separate witnesses");

    expect(near).toBeDefined();
    expect(edge).toBeDefined();
    expect(out).toBeUndefined();
    expect(near?.addressed).toBe(true);
    expect(edge?.addressed).toBe(false);
    expect(near?.spatial.kind).toBe("directional");
    expect(edge?.spatial.kind).toBe("directional");
    if (near?.spatial.kind === "directional") expect(near.spatial.distanceBand).toBe("near");
    if (edge?.spatial.kind === "directional") expect(edge.spatial.distanceBand).toBe("far");
  });

  it("does not let movement after an internally emitted speech rewrite who heard it", () => {
    const world = baseWorld();
    world.addResident("resident.listener", "Listener", { x: 300, y: 500 }, {
      hearingRadius: 120,
      sightRadius: 500,
      maxSpeed: 6_000,
      brainIntervalTicks: 1,
    });
    world.addResident("resident.speaker", "Speaker", { x: 380, y: 500 }, {
      hearingRadius: 120,
      sightRadius: 500,
      brainIntervalTicks: 1,
    });
    world.setResidentActivity("resident.listener", {
      id: "activity:listener:depart",
      kind: "travel",
      targetActorId: null,
      targetPosition: { x: 0, y: 500 },
      text: null,
      speed: 6_000,
      reason: "move away after the speech is emitted",
    });
    world.setResidentActivity("resident.speaker", {
      id: "activity:speaker:communicate",
      kind: "communicate",
      targetActorId: "resident.listener",
      targetPosition: null,
      text: "snapshot me once",
      speed: null,
      reason: "adversarial event-time test",
    });

    world.step();
    const emitted = world.diagnostics().recentOccurrences.find((occurrence) => occurrence.text === "snapshot me once")!;
    expect(emitted).toBeDefined();
    expect(world.publicSnapshot().actors.find((actor) => actor.id === "resident.listener")?.position.x).toBeLessThan(300);

    world.step();
    const heard = speech(world, "resident.listener", "snapshot me once");
    expect(heard?.tick).toBe(emitted.tick);
    expect(heard?.spatial.kind).toBe("directional");
    if (heard?.spatial.kind === "directional") {
      expect(heard.spatial.direction.x).toBeGreaterThan(0.99);
      expect(heard.spatial.distanceBand).toBe("far");
    }
  });

  it("keeps private witness snapshots out of the public World occurrence ledger", () => {
    const world = baseWorld();
    addSpeaker(world);
    world.addResident("resident.listener", "Listener", { x: 540, y: 500 }, { hearingRadius: 500, brainIntervalTicks: 100 });

    world.speak("resident.speaker", "private witness plumbing", 500, ["resident.listener"]);
    const diagnostics = world.diagnostics() as unknown as Record<string, unknown>;
    const serialized = JSON.stringify(diagnostics);

    expect(serialized).toContain("private witness plumbing");
    expect(serialized).not.toContain("observers");
    expect(serialized).not.toContain("hearingRadius");
    expect(serialized).not.toContain("sightRadius");
  });

  it("keeps visual occurrence eligibility fixed to emission-time witness geometry", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
      regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
      sightBlockers: [{
        id: "wall",
        label: "Wall",
        bounds: { minX: 490, minY: 100, maxX: 510, maxY: 900 },
      }],
      chunkSize: 64,
      fixedDeltaSeconds: 1 / 60,
    });
    world.addResident("resident.hidden", "Hidden", { x: 300, y: 500 }, { sightRadius: 500, brainIntervalTicks: 100 });
    world.addResident("resident.clear", "Clear", { x: 700, y: 300 }, { sightRadius: 500, brainIntervalTicks: 100 });
    world.addPlayer("player.jozz", { x: 700, y: 500 });

    const occurrence = world.emitInteraction("player.jozz", "item.hammer", "uses hammer", 500);
    world.step();

    const hidden = world.residentDiagnostics("resident.hidden").recentPercepts.find((p) => p.occurrenceId === occurrence.id);
    const clear = world.residentDiagnostics("resident.clear").recentPercepts.find((p) => p.occurrenceId === occurrence.id);
    expect(hidden).toBeUndefined();
    expect(clear?.modality).toBe("sight");
    expect(clear?.tick).toBe(occurrence.tick);
  });
});
