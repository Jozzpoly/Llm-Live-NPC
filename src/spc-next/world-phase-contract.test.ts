import { describe, expect, it } from "vitest";
import { SpcWorldRuntime } from "./spc-world-runtime";

function simpleWorld(options: { fixedDeltaSeconds?: number; regions?: Array<{ id: string; label: string; minX: number; minY: number; maxX: number; maxY: number }> } = {}): SpcWorldRuntime {
  return new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: options.regions ?? [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
    chunkSize: 64,
    fixedDeltaSeconds: options.fixedDeltaSeconds ?? 1 / 60,
  });
}

function textPercept(world: SpcWorldRuntime, residentId: string, text: string) {
  return world.residentDiagnostics(residentId).recentPercepts.find((percept) => percept.text === text);
}

describe("SPC World phase contract before authority extraction", () => {
  it("delivers externally queued occurrences on the next World step while preserving emission time", () => {
    const world = simpleWorld();
    world.addResident("resident.listener", "Listener", { x: 100, y: 100 }, { hearingRadius: 300, brainIntervalTicks: 100 });
    world.addPlayer("player.jozz", { x: 180, y: 100 });

    const occurrence = world.speak("player.jozz", "external event", 300, ["resident.listener"]);
    expect(occurrence.tick).toBe(0);
    expect(textPercept(world, "resident.listener", "external event")).toBeUndefined();

    world.step();
    const percept = textPercept(world, "resident.listener", "external event");
    expect(world.tick).toBe(1);
    expect(percept?.tick).toBe(0);
    expect(percept?.occurrenceId).toBe(occurrence.id);
  });

  it("defers speech emitted by a resident fast step until the following World step", () => {
    const world = simpleWorld();
    world.addResident("resident.listener", "Listener", { x: 100, y: 100 }, { hearingRadius: 300, brainIntervalTicks: 100 });
    world.addResident("resident.speaker", "Speaker", { x: 160, y: 100 }, { hearingRadius: 300, sightRadius: 300, brainIntervalTicks: 1 });
    world.setResidentActivity("resident.speaker", {
      id: "activity:speaker:communicate",
      kind: "communicate",
      targetActorId: "resident.listener",
      targetPosition: null,
      text: "internal event",
      speed: null,
      reason: "phase contract",
    });

    world.step();
    const occurrence = world.diagnostics().recentOccurrences.find((candidate) => candidate.text === "internal event");
    expect(occurrence?.tick).toBe(1);
    expect(textPercept(world, "resident.listener", "internal event")).toBeUndefined();

    world.step();
    expect(textPercept(world, "resident.listener", "internal event")?.tick).toBe(1);
  });

  it("samples continuous sight before same-step movement integration", () => {
    const world = simpleWorld();
    world.addResident("resident.mira", "Mira", { x: 100, y: 100 }, { sightRadius: 100, brainIntervalTicks: 100 });
    world.addPlayer("player.jozz", { x: 205, y: 100 }, { maxSpeed: 600 });
    world.setActorVelocity("player.jozz", { x: -600, y: 0 });

    world.step();
    expect(world.publicSnapshot().actors.find((actor) => actor.id === "player.jozz")?.position.x).toBeCloseTo(195, 8);
    expect(world.residentDiagnostics("resident.mira").recentPercepts.some((percept) =>
      percept.actorId === "player.jozz" && percept.phenomenon === "actor_sight_enter"
    )).toBe(false);

    world.step();
    const enter = world.residentDiagnostics("resident.mira").recentPercepts.find((percept) =>
      percept.actorId === "player.jozz" && percept.phenomenon === "actor_sight_enter"
    );
    expect(enter?.tick).toBe(2);
    expect(enter?.spatial).toEqual({ kind: "exact", position: { x: 195, y: 100 } });
  });

  it("lets the local brain act on the same pre-integration visibility sample rather than future movement", () => {
    const world = simpleWorld();
    world.addResident("resident.speaker", "Speaker", { x: 100, y: 100 }, { sightRadius: 300, hearingRadius: 300, brainIntervalTicks: 1 });
    world.addPlayer("player.jozz", { x: 185, y: 100 }, { maxSpeed: 600 });
    world.setResidentActivity("resident.speaker", {
      id: "activity:speaker:communicate",
      kind: "communicate",
      targetActorId: "player.jozz",
      targetPosition: null,
      text: "only after contact",
      speed: null,
      reason: "phase contract",
    });
    world.setActorVelocity("player.jozz", { x: -600, y: 0 });

    world.step();
    expect(world.diagnostics().recentOccurrences.some((occurrence) => occurrence.text === "only after contact")).toBe(false);

    world.step();
    const occurrence = world.diagnostics().recentOccurrences.find((candidate) => candidate.text === "only after contact");
    expect(occurrence?.tick).toBe(2);
  });

  it("integrates accepted velocity once per step and updates semantic region membership afterward", () => {
    const world = simpleWorld({
      regions: [
        { id: "west", label: "West", minX: 0, minY: 0, maxX: 500, maxY: 1_000 },
        { id: "east", label: "East", minX: 500, minY: 0, maxX: 1_000, maxY: 1_000 },
      ],
    });
    world.addResident("resident.mira", "Mira", { x: 495, y: 100 }, { maxSpeed: 600, brainIntervalTicks: 100 });
    world.setActorVelocity("resident.mira", { x: 600, y: 0 });

    world.step();
    const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === "resident.mira")!;
    expect(actor.position.x).toBeCloseTo(505, 8);
    expect(world.regionAt(actor.position)?.id).toBe("east");

    const regionReason = world.residentDiagnostics("resident.mira").trace.find((event) =>
      event.kind === "cognition_reason" && event.summary.includes("Entered region: East")
    );
    expect(regionReason?.tick).toBe(1);
  });
});
