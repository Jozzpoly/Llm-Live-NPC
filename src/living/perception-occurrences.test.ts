import { describe, expect, it } from "vitest";
import type { Blocker, Vec2, WorldSpecimen } from "../world/types";
import { World } from "../world/world";
import { ResidentPerception } from "./perception";

const still = { moveX: 0, moveY: 0 };
const wall: Blocker = { id: "wall", label: "Wall", bounds: { x: 400, y: 180, width: 20, height: 440 }, occludesVision: true };

function fixture(options: {
  player?: Vec2; listener?: Vec2; facing?: Vec2; item?: Vec2; blockers?: Blocker[]; held?: boolean;
} = {}): World {
  const specimen: WorldSpecimen = {
    width: 2000, height: 900, actorSpeed: 400, blockers: options.blockers ?? [], locations: [], placementSites: [],
    entities: [
      { id: "player", kind: "player", label: "Known player", position: options.player ?? { x: 300, y: 300 }, radius: 16,
        facing: { x: 1, y: 0 }, heldItemId: options.held ? "mug" : null },
      { id: "listener", kind: "npc", label: "Listener", position: options.listener ?? { x: 200, y: 300 }, radius: 16,
        facing: options.facing ?? { x: 1, y: 0 }, heldItemId: null },
      { id: "remote", kind: "npc", label: "Hidden resident", position: { x: 1400, y: 300 }, radius: 16,
        facing: { x: -1, y: 0 }, heldItemId: null },
      { id: "mug", kind: "item", label: "Red mug", position: options.item ?? { x: 339, y: 300 }, radius: 9,
        heldBy: options.held ? "player" : null }
    ]
  };
  return new World(specimen);
}

function perception(world: World, actorId = "listener"): ResidentPerception {
  return new ResidentPerception(world, actorId, (_id, fallback) => fallback);
}

function walkPlayer(world: World, move: Vec2, steps: number): void {
  for (let i = 0; i < steps; i++) world.step({ moveX: move.x, moveY: move.y }, 0.25);
}

function turnListener(world: World, direction: Vec2): void {
  for (let i = 0; i < 2; i++) {
    world.stepWithActorControls(still, [{ actorId: "listener", ...still, lookDirection: direction }], 0.25);
  }
}

const witnessed = (senses: ResidentPerception) => senses.recentExperiences().filter(e => e.kind === "witnessed_manipulation");

describe("resident event-time speech reception", () => {
  it("hears at emission time even when the listener moves away before the next observation", () => {
    const world = fixture();
    const senses = perception(world);
    world.speak("player", "A short utterance");
    expect(senses.recentSpeech()).toEqual([{ id: 1, tick: 0, text: "A short utterance" }]);
    for (let i = 0; i < 8; i++) {
      world.stepWithActorControls(still, [{ actorId: "listener", moveX: 1, moveY: 0 }], 0.25);
    }
    senses.observe(world.snapshot());
    expect(senses.recentSpeech()).toEqual([{ id: 1, tick: 0, text: "A short utterance" }]);
    expect(senses.recentExperiences().filter(e => e.kind === "heard_speech")).toHaveLength(1);
  });

  it("never hears old words by moving into range or subscribing after they were spoken", () => {
    const world = fixture({ player: { x: 800, y: 300 } });
    world.speak("player", "Before subscription", "call");
    world.callOut("player");
    const senses = perception(world);
    world.speak("player", "Too far away");
    walkPlayer(world, { x: -1, y: 0 }, 4);
    senses.observe(world.snapshot());
    senses.observe(world.snapshot());
    expect(senses.recentSpeech()).toEqual([]);
    expect(senses.latestCall()).toBeUndefined();
    world.speak("player", "Now in range");
    expect(senses.recentSpeech().map(s => s.text)).toEqual(["Now in range"]);
  });

  it.each([
    { mode: "quiet", range: 120, occluded: false },
    { mode: "normal", range: 420, occluded: false },
    { mode: "call", range: 700, occluded: false },
    { mode: "quiet", range: 40, occluded: true },
    { mode: "normal", range: 180, occluded: true },
    { mode: "call", range: 460, occluded: true }
  ] as const)("uses the bounded $mode speech range ($range, occluded=$occluded)", ({ mode, range, occluded }) => {
    for (const offset of [0, 1]) {
      const distance = range + offset;
      const blockers = occluded ? [{ ...wall, bounds: { x: 200 + distance / 2, y: 100, width: 2, height: 500 } }] : [];
      const world = fixture({ player: { x: 200 + distance, y: 300 }, blockers });
      const senses = perception(world);
      world.speak("player", "Only audible words", mode);
      expect(senses.recentSpeech(), `offset=${offset}`).toHaveLength(offset === 0 ? 1 : 0);
      if (offset === 1) expect(senses.recentExperiences()).toEqual([]);
    }
  });

  it("keeps an unknown audible voice anonymous and does not learn identity or position from its words", () => {
    const world = fixture({ player: { x: 350, y: 300 }, facing: { x: -1, y: 0 } });
    const senses = perception(world);
    senses.observe(world.snapshot());
    const before = senses.remembered();
    world.speak("player", "I am nearby");
    expect(senses.recentSpeech()).toEqual([{ id: 1, tick: 0, text: "I am nearby" }]);
    expect(senses.remembered()).toEqual(before);
    const receipt = senses.recentExperiences().find(e => e.kind === "heard_speech")!;
    expect(receipt).not.toHaveProperty("sourceId");
    expect(receipt.text).not.toContain("Known player");
    expect(receipt.text).not.toContain("350");
    turnListener(world, { x: 1, y: 0 });
    senses.observe(world.snapshot());
    expect(senses.known.has("player")).toBe(true);
    expect(senses.recentSpeech()[0]).not.toHaveProperty("sourceId");
  });

  it("recognizes an acquired identity behind a wall without updating the last seen position", () => {
    const world = fixture({ blockers: [wall] });
    const senses = perception(world);
    senses.observe(world.snapshot());
    const knownPlayer = structuredClone(senses.known.get("player"));
    walkPlayer(world, { x: 0, y: -1 }, 2);
    walkPlayer(world, { x: 1, y: 0 }, 3);
    walkPlayer(world, { x: 0, y: 1 }, 2);
    expect(world.hasLineOfSight({ x: 200, y: 300 }, { x: 600, y: 300 })).toBe(false);
    world.speak("player", "Calling through the wall", "call");
    expect(senses.recentSpeech().at(-1)).toMatchObject({ sourceId: "player", tick: 7, text: "Calling through the wall" });
    expect(senses.known.get("player")).toEqual(knownPlayer);
    expect(senses.latestCall("player")).toMatchObject({
      seq: 1, tick: 7, sourceId: "player", listenerPosition: { x: 200, y: 300 },
      direction: { x: 1, y: 0 }, distanceBand: "far"
    });
    expect(senses.latestCall()).not.toHaveProperty("position");
    expect(senses.recentSpeech()).toHaveLength(1);
    expect(senses.recentExperiences().filter(e => e.kind === "heard_call")).toHaveLength(1);
  });

  it("knows its own speech without prior visual observation and adds no self-call cue", () => {
    const world = fixture();
    const senses = perception(world);
    world.speak("listener", "My own words", "call");
    expect(senses.recentSpeech()).toEqual([{ id: 1, tick: 0, sourceId: "listener", text: "My own words" }]);
    expect(senses.recentExperiences()[0]).toMatchObject({ kind: "action", sourceId: "listener" });
    expect(senses.latestCall()).toBeUndefined();
  });

  it("does not expose skipped global events in personal experience IDs or call sequences", () => {
    const worlds = [fixture({ item: { x: 1439, y: 300 } }), fixture({ item: { x: 1439, y: 300 } })];
    const senses = worlds.map(world => perception(world));
    for (const world of worlds) world.speak("player", "First");
    worlds[1].speak("remote", "Hidden dialogue");
    worlds[1].callOut("remote");
    expect(worlds[1].attemptAction({ actorId: "remote", action: "interact", targetId: "mug" }).status).toBe("succeeded");
    worlds[1].attemptAction({ actorId: "remote", action: "drop" });
    for (const world of worlds) {
      world.callOut("player");
      world.speak("player", "Second", "call");
    }
    expect(senses[1].recentExperiences()).toEqual(senses[0].recentExperiences());
    expect(senses[1].recentSpeech()).toEqual(senses[0].recentSpeech());
    expect(senses[1].latestCall()).toEqual(senses[0].latestCall());
    expect(senses[1].latestCall()?.seq).toBe(2);
    expect(senses[1].recentExperiences().map(e => e.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("resident event-time manipulation reception", () => {
  it("witnesses a short pickup/drop cycle even when the next snapshot returns to the same item state", () => {
    const world = fixture();
    const senses = perception(world);
    senses.observe(world.snapshot());
    const before = world.snapshot().entities.find(e => e.id === "mug");
    expect(world.attemptAction({ actorId: "player", action: "interact", targetId: "mug" }).status).toBe("succeeded");
    expect(witnessed(senses)).toHaveLength(1);
    expect(world.attemptAction({ actorId: "player", action: "drop" }).status).toBe("succeeded");
    expect(witnessed(senses)).toHaveLength(2);
    expect(witnessed(senses).map(e => ({ tick: e.tick, sourceId: e.sourceId, subjectId: e.subjectId }))).toEqual([
      { tick: 0, sourceId: "player", subjectId: "mug" }, { tick: 0, sourceId: "player", subjectId: "mug" }
    ]);
    expect(witnessed(senses)[0].text).toContain("podnosi");
    expect(witnessed(senses)[1].text).toContain("odkłada");
    expect(world.snapshot().entities.find(e => e.id === "mug")).toEqual(before);
    senses.observe(world.snapshot());
    expect(witnessed(senses)).toHaveLength(2);
  });

  it("keeps witnessed but not previously identified actors and items anonymous", () => {
    const world = fixture();
    const senses = perception(world);
    world.attemptAction({ actorId: "player", action: "interact", targetId: "mug" });
    expect(witnessed(senses)).toHaveLength(1);
    expect(witnessed(senses)[0]).not.toHaveProperty("sourceId");
    expect(witnessed(senses)[0]).not.toHaveProperty("subjectId");
    expect(witnessed(senses)[0].text).not.toContain("Known player");
    expect(witnessed(senses)[0].text).not.toContain("Red mug");
  });

  it("cannot learn hidden pickup/drop or unheard words from a world occurrence", () => {
    const world = fixture({ player: { x: 600, y: 300 }, item: { x: 639, y: 300 }, blockers: [wall] });
    const senses = perception(world);
    senses.observe(world.snapshot());
    const before = { known: senses.remembered(), experiences: senses.recentExperiences(), speech: senses.recentSpeech() };
    expect(world.attemptAction({ actorId: "player", action: "interact", targetId: "mug" }).status).toBe("succeeded");
    expect(world.attemptAction({ actorId: "player", action: "drop" }).status).toBe("succeeded");
    world.speak("player", "A private conversation", "normal");
    senses.observe(world.snapshot());
    expect({ known: senses.remembered(), experiences: senses.recentExperiences(), speech: senses.recentSpeech() }).toEqual(before);
    expect(senses.known.has("player")).toBe(false);
    expect(senses.known.has("mug")).toBe(false);
  });

  it("does not mistake a later visible change for having witnessed the transfer", () => {
    const world = fixture({ held: true });
    const senses = perception(world);
    senses.observe(world.snapshot());
    expect(senses.known.get("mug")?.heldBy).toBe("player");
    turnListener(world, { x: -1, y: 0 });
    world.attemptAction({ actorId: "player", action: "drop" });
    expect(witnessed(senses)).toEqual([]);
    turnListener(world, { x: 1, y: 0 });
    senses.observe(world.snapshot());
    expect(senses.known.get("mug")?.heldBy).toBeNull();
    expect(senses.recentExperiences().some(e => e.kind === "noticed" && e.subjectId === "mug" && e.text.includes("Widzę teraz"))).toBe(true);
    expect(witnessed(senses)).toEqual([]);
  });

  it("requires both item states to be visible instead of inferring a pickup from a visible actor edge", () => {
    const world = fixture({ player: { x: 190, y: 300 }, item: { x: 230, y: 300 } });
    const senses = perception(world);
    senses.observe(world.snapshot());
    expect(senses.visible.has("player")).toBe(true);
    expect(senses.visible.has("mug")).toBe(true);
    expect(world.attemptAction({ actorId: "player", action: "interact", targetId: "mug" }).status).toBe("succeeded");
    expect(witnessed(senses)).toEqual([]);
    senses.observe(world.snapshot());
    expect(senses.visible.has("mug")).toBe(false);
  });

  it("records its own manipulation and keeps rejected actions private to the acting resident", () => {
    const world = fixture({ item: { x: 230, y: 300 } });
    const senses = perception(world);
    const playerSenses = perception(world, "player");
    const rejected = world.attemptAction({ actorId: "listener", action: "drop" });
    senses.action(rejected);
    playerSenses.action(rejected);
    expect(playerSenses.recentExperiences()).toEqual([]);
    expect(senses.recentExperiences()[0]).toMatchObject({ kind: "action", sourceId: "listener" });
    expect(world.attemptAction({ actorId: "listener", action: "interact", targetId: "mug" }).status).toBe("succeeded");
    expect(witnessed(senses)[0]).toMatchObject({ sourceId: "listener" });
  });
});

describe("resident perception lifecycle and older call behavior", () => {
  it("unsubscribes on disposal, remains safe to dispose twice, and does not replay on replacement", () => {
    const world = fixture();
    const senses = perception(world);
    world.speak("player", "Before disposal");
    const before = senses.recentExperiences();
    senses.dispose();
    senses.dispose();
    world.speak("player", "After disposal", "call");
    world.callOut("player");
    world.attemptAction({ actorId: "player", action: "interact", targetId: "mug" });
    expect(senses.recentExperiences()).toEqual(before);
    expect(senses.recentSpeech().map(s => s.text)).toEqual(["Before disposal"]);
    expect(senses.latestCall()).toBeUndefined();
    const replacement = perception(world);
    replacement.observe(world.snapshot());
    expect(replacement.recentSpeech()).toEqual([]);
    expect(replacement.latestCall()).toBeUndefined();
    expect(witnessed(replacement)).toEqual([]);
  });

  it("stops reception when disposed by an earlier listener during occurrence dispatch", () => {
    const world = fixture();
    let senses: ResidentPerception;
    world.onOccurrence(() => senses.dispose());
    senses = perception(world);
    world.speak("player", "During disposal");
    expect(senses.recentExperiences()).toEqual([]);
    expect(senses.recentSpeech()).toEqual([]);
  });

  it("keeps callOut as a coarse cue, ignores self calls, and expires old cues without inventing words", () => {
    const world = fixture();
    const senses = perception(world);
    senses.observe(world.snapshot());
    world.callOut("listener");
    expect(senses.latestCall()).toBeUndefined();
    world.callOut("player");
    expect(senses.latestCall("player")).toMatchObject({
      seq: 1, tick: 0, sourceId: "player", listenerPosition: { x: 200, y: 300 },
      direction: { x: 1, y: 0 }, distanceBand: "near"
    });
    expect(senses.recentSpeech()).toEqual([]);
    const cue = senses.latestCall()!;
    cue.direction.x = -50;
    expect(senses.latestCall()?.direction.x).toBe(1);
    for (let i = 0; i < 301; i++) world.step(still);
    expect(senses.latestCall()).toBeUndefined();
  });

  it("does not localize an unknown spoken call beyond the same coarse older call cue", () => {
    const world = fixture({ player: { x: 600, y: 310 }, blockers: [wall] });
    const senses = perception(world);
    world.speak("player", "Here!", "call");
    const call = senses.latestCall()!;
    expect(call).toMatchObject({ seq: 1, listenerPosition: { x: 200, y: 300 }, direction: { x: 1, y: 0 }, distanceBand: "far" });
    expect(Object.keys(call).sort()).toEqual(["direction", "distanceBand", "listenerPosition", "seq", "tick"]);
    expect(senses.recentSpeech()).toHaveLength(1);
    expect(senses.recentSpeech()[0]).not.toHaveProperty("sourceId");
    expect(senses.known.size).toBe(0);
    expect(senses.latestCall("player")).toBeUndefined();
  });

  it("retains bounded, isolated word receipts tied to this listener's retained experiences", () => {
    const world = fixture();
    const senses = perception(world);
    for (let i = 0; i < 120; i++) world.speak("player", `Words ${i}`);
    const speech = senses.recentSpeech();
    const experiences = senses.recentExperiences();
    expect(speech).toHaveLength(96);
    expect(experiences).toHaveLength(96);
    expect(speech.map(s => s.id)).toEqual(experiences.map(e => e.id));
    speech[0].text = "Changed outside perception";
    experiences[0].text = "Changed outside perception";
    expect(senses.recentSpeech()[0].text).toBe("Words 24");
    expect(senses.recentExperiences()[0].text).toContain("Words 24");
    for (let i = 0; i < 96; i++) senses.record(world.tick, "search", `Personal search ${i}`);
    expect(senses.recentSpeech()).toEqual([]);
  });
});
