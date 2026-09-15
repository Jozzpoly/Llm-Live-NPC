import { describe, expect, it } from "vitest";
import type { ResidentActivity } from "./contracts";
import { SpcWorldRuntime } from "./spc-world-runtime";

const regions = [
  { id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_200, maxY: 1_200 },
  { id: "market", label: "Market", minX: 1_200, minY: 0, maxX: 2_400, maxY: 1_200 },
  { id: "road", label: "Road", minX: 2_400, minY: 0, maxX: 4_000, maxY: 1_800 },
  { id: "forest", label: "Forest", minX: 4_000, minY: 0, maxX: 6_200, maxY: 3_000 },
  { id: "ruins", label: "Ruins", minX: 6_200, minY: 0, maxX: 8_192, maxY: 3_500 },
];

function createWorld(): SpcWorldRuntime {
  return new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 8_192, maxY: 8_192 },
    regions,
    chunkSize: 256,
    fixedDeltaSeconds: 1 / 60,
  });
}

function addFiveResidents(world: SpcWorldRuntime): void {
  world.addResident("resident.mira", "Mira", { x: 500, y: 500 });
  world.addResident("resident.janek", "Janek", { x: 900, y: 520 });
  world.addResident("resident.ida", "Ida", { x: 2_000, y: 600 });
  world.addResident("resident.oren", "Oren", { x: 4_800, y: 900 });
  world.addResident("resident.nela", "Nela", { x: 7_100, y: 1_300 });
}

function travel(id: string, x: number, y: number): ResidentActivity {
  return {
    id: `activity:${id}:travel`,
    kind: "travel",
    targetActorId: null,
    targetPosition: { x, y },
    text: null,
    speed: 100,
    reason: "qualification travel",
  };
}

describe("SPC Next five-resident world foundation", () => {
  it("keeps five resident perspectives independent across a large spatially separated map", () => {
    const world = createWorld();
    addFiveResidents(world);
    world.addPlayer("player.jozz", { x: 520, y: 500 });

    world.speak("player.jozz", "hej z hearth", 420);
    world.step();

    const mira = world.residentDiagnostics("resident.mira");
    const janek = world.residentDiagnostics("resident.janek");
    const ida = world.residentDiagnostics("resident.ida");
    const oren = world.residentDiagnostics("resident.oren");
    const nela = world.residentDiagnostics("resident.nela");

    expect(mira.recentPercepts.some((percept) => percept.text === "hej z hearth")).toBe(true);
    expect(janek.recentPercepts.some((percept) => percept.text === "hej z hearth")).toBe(true);
    expect(ida.recentPercepts.some((percept) => percept.text === "hej z hearth")).toBe(false);
    expect(oren.recentPercepts.some((percept) => percept.text === "hej z hearth")).toBe(false);
    expect(nela.recentPercepts.some((percept) => percept.text === "hej z hearth")).toBe(false);

    const publicSnapshot = world.publicSnapshot() as unknown as Record<string, unknown>;
    expect(publicSnapshot).not.toHaveProperty("recentPercepts");
    expect(publicSnapshot).not.toHaveProperty("trace");
    expect(world.regionAt({ x: 7_000, y: 1_000 })?.id).toBe("ruins");
  });

  it("keeps heard source geometry directional even when the same actor can separately become visible", () => {
    const world = createWorld();
    world.addResident("resident.mira", "Mira", { x: 500, y: 500 });
    world.addPlayer("player.jozz", { x: 700, y: 500 });

    world.speak("player.jozz", "Mira, słyszysz mnie?", 420, ["resident.mira"]);
    world.step();

    const percepts = world.residentDiagnostics("resident.mira").recentPercepts;
    const heard = percepts.find((percept) => percept.text === "Mira, słyszysz mnie?")!;
    const sight = percepts.find((percept) => percept.modality === "sight" && percept.actorId === "player.jozz")!;

    expect(heard.spatial.kind).toBe("directional");
    if (heard.spatial.kind === "directional") {
      expect(heard.spatial.direction.x).toBeGreaterThan(0.99);
      expect(heard.spatial.distanceBand).toBe("mid");
    }
    expect(sight.spatial).toEqual({ kind: "exact", position: { x: 700, y: 500 } });
  });

  it("preserves a bounded World occurrence ledger independently from resident perception", () => {
    const world = createWorld();
    world.addResident("resident.mira", "Mira", { x: 500, y: 500 });
    world.addPlayer("player.jozz", { x: 520, y: 500 });

    const speech = world.speak("player.jozz", "evidence", 420, ["resident.mira"]);
    const interaction = world.emitInteraction("player.jozz", "item.hammer", "touched hammer");
    world.step();

    const ledger = world.diagnostics().recentOccurrences;
    expect(ledger.map((occurrence) => occurrence.id)).toEqual([speech.id, interaction.id]);
    expect(ledger[0]!.position).toEqual({ x: 520, y: 500 });
  });

  it("advances several resident activities through one World clock without any model response", () => {
    const world = createWorld();
    addFiveResidents(world);
    world.addPlayer("player.jozz", { x: 520, y: 500 });

    world.setResidentActivity("resident.mira", travel("mira", 1_050, 500));
    world.setResidentActivity("resident.janek", travel("janek", 1_700, 520));
    world.setResidentActivity("resident.ida", travel("ida", 2_800, 650));
    world.setResidentActivity("resident.oren", travel("oren", 5_500, 1_100));
    world.setResidentActivity("resident.nela", travel("nela", 7_700, 1_500));

    const before = new Map(world.publicSnapshot().actors.map((actor) => [actor.id, actor.position.x]));
    world.step(180);
    const after = world.publicSnapshot();

    expect(after.tick).toBe(180);
    for (const id of ["resident.mira", "resident.janek", "resident.ida", "resident.oren", "resident.nela"]) {
      const actor = after.actors.find((candidate) => candidate.id === id);
      expect(actor).toBeDefined();
      expect(actor!.position.x).toBeGreaterThan(before.get(id)!);
    }

    expect(world.takeCognitionBatch("resident.mira")).not.toBeNull();
    expect(world.tick).toBe(180);
  });

  it("keeps cognition scheduling resident-local and permits urgent addressed bursts without a global poll", () => {
    const world = createWorld();
    world.addResident("resident.mira", "Mira", { x: 500, y: 500 });
    world.addResident("resident.janek", "Janek", { x: 650, y: 500 });
    world.addResident("resident.ida", "Ida", { x: 4_000, y: 4_000 });
    world.addPlayer("player.jozz", { x: 520, y: 500 });

    world.speak("player.jozz", "Mira, Janek, chodźcie", 420, ["resident.mira", "resident.janek"]);
    world.step();

    expect(world.takeCognitionBatch("resident.mira")?.reasons[0]?.kind).toBe("heard_speech");
    expect(world.takeCognitionBatch("resident.janek")?.reasons[0]?.kind).toBe("heard_speech");
    expect(world.takeCognitionBatch("resident.ida")).toBeNull();

    world.step(12);
    world.speak("player.jozz", "Mira, druga pilna zmiana", 420, ["resident.mira"]);
    world.step();
    expect(world.takeCognitionBatch("resident.mira")?.reasons[0]?.summary).toContain("druga pilna zmiana");
    expect(world.takeCognitionBatch("resident.janek")).toBeNull();
    expect(world.takeCognitionBatch("resident.ida")).toBeNull();
  });

  it("lets a nearby bystander hear addressed speech without treating it as equally urgent cognition", () => {
    const world = createWorld();
    world.addResident("resident.mira", "Mira", { x: 500, y: 500 });
    world.addResident("resident.janek", "Janek", { x: 560, y: 500 });
    world.addPlayer("player.jozz", { x: 520, y: 500 });

    world.speak("player.jozz", "hej wam", 420, ["resident.mira", "resident.janek"]);
    world.step();
    expect(world.takeCognitionBatch("resident.mira")).not.toBeNull();
    expect(world.takeCognitionBatch("resident.janek")).not.toBeNull();

    world.step(12);
    world.speak("player.jozz", "Mira, tylko do ciebie", 420, ["resident.mira"]);
    world.step();

    const miraPercept = world.residentDiagnostics("resident.mira").recentPercepts
      .findLast((percept) => percept.text === "Mira, tylko do ciebie")!;
    const janekPercept = world.residentDiagnostics("resident.janek").recentPercepts
      .findLast((percept) => percept.text === "Mira, tylko do ciebie")!;
    expect(miraPercept.addressed).toBe(true);
    expect(janekPercept.addressed).toBe(false);
    expect(world.takeCognitionBatch("resident.mira")?.reasons[0]?.salience).toBe(1);
    expect(world.takeCognitionBatch("resident.janek")).toBeNull();
  });

  it("uses spatial candidate queries rather than a whole-map perception scan", () => {
    const world = createWorld();
    addFiveResidents(world);
    world.addPlayer("player.jozz", { x: 510, y: 510 });

    world.speak("player.jozz", "lokalne", 180);
    world.step();

    const stats = world.spatialStats();
    expect(stats.totalQueries).toBeGreaterThan(0);
    expect(stats.lastCandidateCount).toBeLessThanOrEqual(3);
  });

  it("keeps the initiating causal story readable through a long local travel interval", () => {
    const world = createWorld();
    world.addResident("resident.mira", "Mira", { x: 500, y: 500 });
    world.setResidentActivity("resident.mira", travel("mira-long", 3_500, 500));

    world.step(1_200);
    const trace = world.residentDiagnostics("resident.mira").trace;
    const commandEvents = trace.filter((event) => event.kind === "command");

    expect(trace.some((event) => event.kind === "activity_changed" && event.refIds.includes("activity:mira-long:travel"))).toBe(true);
    expect(commandEvents.length).toBeLessThan(20);
    expect(trace.length).toBeLessThan(64);
  });

  it("makes communication an embodied activity: approach first, speech only after contact", () => {
    const world = createWorld();
    world.addResident("resident.mira", "Mira", { x: 500, y: 500 });
    world.addResident("resident.janek", "Janek", { x: 540, y: 500 });
    world.addPlayer("player.jozz", { x: 900, y: 500 });

    world.setResidentActivity("resident.mira", {
      id: "activity:mira:communicate",
      kind: "communicate",
      targetActorId: "player.jozz",
      targetPosition: { x: 900, y: 500 },
      text: "dotarłam",
      speed: 110,
      reason: "deliver a message physically",
    });

    world.step(60);
    expect(world.residentDiagnostics("resident.janek").recentPercepts.some((p) => p.text === "dotarłam")).toBe(false);

    world.step(180);
    const mira = world.publicSnapshot().actors.find((actor) => actor.id === "resident.mira")!;
    expect(mira.position.x).toBeGreaterThan(800);
    expect(world.residentDiagnostics("resident.mira").publicState.activity.kind).toBe("idle");
  });
});
