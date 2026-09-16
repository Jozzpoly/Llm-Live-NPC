import { describe, expect, it } from "vitest";
import { SpcWorldRuntime } from "./spc-world-runtime";

function createWorld(): SpcWorldRuntime {
  return new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  });
}

describe("resident identity ingress integration", () => {
  it("keeps an unheard-before physical speaker anonymous through memory, local contact state and cognition context", () => {
    const world = createWorld();
    const mira = world.addResident("resident.mira", "Mira", { x: 100, y: 100 }, {
      sightRadius: 80,
      hearingRadius: 420,
      brainIntervalTicks: 1_000,
    });
    world.addPlayer("player.jozz", { x: 300, y: 100 });

    world.speak("player.jozz", "Mira, słyszysz mnie?", 420, ["resident.mira"]);
    world.step();

    const diagnostics = world.residentDiagnostics("resident.mira");
    const heard = diagnostics.recentPercepts.find((percept) => percept.text === "Mira, słyszysz mnie?");
    expect(heard).toBeDefined();
    expect(heard!.actorId).toBeNull();
    expect(heard!.spatial.kind).toBe("directional");
    expect(JSON.stringify(diagnostics)).not.toContain("player.jozz");

    const batch = world.takeCognitionBatch("resident.mira");
    expect(batch).not.toBeNull();
    const context = mira.cognitionContext(batch!);
    const contextualHearing = context.recentPercepts.find((percept) => percept.text === "Mira, słyszysz mnie?");
    expect(contextualHearing?.actorId).toBeNull();
    expect(context.knownActors.some((actor) => actor.id === "player.jozz")).toBe(false);
    expect(JSON.stringify(context)).not.toContain("player.jozz");
  });

  it("may recognize a later voice after this resident acquired the actor identity through sight", () => {
    const world = createWorld();
    const mira = world.addResident("resident.mira", "Mira", { x: 100, y: 100 }, {
      sightRadius: 300,
      hearingRadius: 420,
      brainIntervalTicks: 1_000,
    });
    world.addPlayer("player.jozz", { x: 300, y: 100 });

    world.step();
    const visual = world.residentDiagnostics("resident.mira").recentPercepts.find(
      (percept) => percept.phenomenon === "actor_sight_enter" && percept.actorId === "player.jozz",
    );
    expect(visual).toBeDefined();
    world.takeCognitionBatch("resident.mira");

    world.speak("player.jozz", "To znowu ja.", 420, ["resident.mira"]);
    world.step();

    const diagnostics = world.residentDiagnostics("resident.mira");
    const heard = diagnostics.recentPercepts.find((percept) => percept.text === "To znowu ja.");
    expect(heard?.actorId).toBe("player.jozz");

    const batch = world.takeCognitionBatch("resident.mira");
    expect(batch).not.toBeNull();
    const context = mira.cognitionContext(batch!);
    expect(context.knownActors.some((actor) => actor.id === "player.jozz")).toBe(true);
  });
});
