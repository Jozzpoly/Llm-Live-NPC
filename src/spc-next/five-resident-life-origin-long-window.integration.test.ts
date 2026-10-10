import { describe, expect, it } from "vitest";
import {
  createFiveResidentRegionComposition,
  type FiveResidentId,
  type FiveResidentRegionComposition,
} from "./five-resident-region";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";

const RESIDENTS = [
  "resident.mira", "resident.janek", "resident.ida",
  "resident.oren", "resident.nela",
] as const satisfies readonly FiveResidentId[];
const PLAYER = "player.jozz";
type Scenario = {
  composition: FiveResidentRegionComposition;
  life: FiveResidentCausalLifeRuntime;
};

function createScenario(): Scenario {
  const composition = createFiveResidentRegionComposition();
  return { composition, life: new FiveResidentCausalLifeRuntime(composition) };
}

function position(s: Scenario, id: string) {
  const actor = s.composition.world.publicSnapshot().actors.find(a => a.id === id);
  if (!actor) throw new Error(`no actor ${id}`);
  return actor.position;
}

function settledOpening(s: Scenario) {
  for (let i = 0; i < 1_800 && s.life.claimedResidentIds().length !== 5; i += 1) {
    s.life.advanceOneWorldTick();
  }
  expect(s.life.claimedResidentIds()).toHaveLength(5);
  // Explicitly separate the authored opening from autonomous recovered-life
  // observation; do not count authored travel or its terminal pressure as new life.
  for (let i = 0; i < 16; i += 1) s.life.advanceOneWorldTick();
  for (const id of RESIDENTS) {
    expect(s.composition.runtimes[id].publicState().activity.kind).toBe("idle");
    expect(s.life.life(id)?.focus.focusedRun()).toBeNull();
    expect(s.life.life(id)?.currentLifeView().matters).toHaveLength(0);
  }
}

function residentPositions(s: Scenario) {
  return Object.fromEntries(RESIDENTS.map(id => [id, { ...position(s, id) }]));
}

function reasonsNewerThan(s: Scenario, tick: number) {
  return RESIDENTS.flatMap(id =>
    s.composition.runtimes[id].pendingCognitionReasons()
      .filter(reason => reason.tick > tick)
      .map(reason => ({ residentId: id, reason })),
  );
}

function actualPlayerWalk(
  s: Scenario,
  target: Readonly<{ x: number; y: number }>,
  seen: Set<string>,
) {
  let arrived = false;
  for (let step = 0; step < 5_000; step += 1) {
    const current = position(s, PLAYER);
    const dx = target.x - current.x, dy = target.y - current.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 5) {
      arrived = true;
      break;
    }
    const speed = Math.min(150, 60 * distance);
    s.composition.world.setActorMotionIntent(PLAYER, {
      x: (dx / distance) * speed, y: (dy / distance) * speed,
    });
    const frame = s.life.advanceOneWorldTick();
    for (const id of RESIDENTS) {
      for (const percept of s.composition.runtimes[id].perceptionSnapshot().recentPercepts) {
        if (percept.tick === frame.tick && percept.phenomenon === "actor_sight_enter"
          && percept.actorId === PLAYER) seen.add(id);
      }
    }
  }
  s.composition.world.setActorMotionIntent(PLAYER, { x: 0, y: 0 });
  expect(arrived).toBe(true);
}

describe("R6 actual five-resident ordinary-life origin, long-window zero-provider falsifier", () => {
  it("separates legitimate long quiet after authored openings from resident-owned newly generated life", () => {
    const s = createScenario();
    settledOpening(s);
    const cutoff = s.composition.world.tick;
    const originalPositions = residentPositions(s);
    const openingReasons = Object.fromEntries(RESIDENTS.map(id => [
      id, s.composition.runtimes[id].pendingCognitionReasons().map(r => r.id),
    ]));
    for (let i = 0; i < 3_600; i += 1) s.life.advanceOneWorldTick();
    expect(s.composition.world.tick).toBe(cutoff + 3_600);
    expect(residentPositions(s)).toEqual(originalPositions);
    expect(reasonsNewerThan(s, cutoff)).toEqual([]);
    for (const id of RESIDENTS) {
      const resident = s.life.life(id);
      if (!resident) throw new Error("recovered resident disappeared");
      expect(resident.currentLifeView().matters).toHaveLength(0);
      expect(resident.focus.focusedRun()).toBeNull();
      expect(s.composition.runtimes[id].pendingCognitionReasons().map(r => r.id))
        .toEqual(openingReasons[id]);
    }
    console.info("SPC_R6_QUIET_BASELINE", JSON.stringify({
      ownNewMatters: 0, newReasonsAfterOpening: 0,
      motionAfterOpening: false, openingIsAuthored: true, providerCalls: 0,
      quietTicks: 3600, qualification: "no_original_motivation_proven",
    }));
  });

  it("player visiting all five can increase genuine private encounters WITHOUT becoming NPC agency", () => {
    const s = createScenario();
    settledOpening(s);
    const cutoff = s.composition.world.tick;
    const originalPositions = residentPositions(s);
    const seen = new Set<string>();
    // Player movements are openly test-directed World inputs, not autonomous NPC travel.
    for (const id of RESIDENTS) {
      const actor = position(s, id);
      actualPlayerWalk(s, { x: actor.x + 35, y: actor.y + 35 }, seen);
    }
    expect(seen.has("resident.janek")).toBe(true);
    expect(seen.has("resident.oren")).toBe(true);
    expect(seen.has("resident.nela")).toBe(true);
    expect(residentPositions(s)).toEqual(originalPositions);
    expect(reasonsNewerThan(s, cutoff)).toEqual([]);
    for (const id of RESIDENTS) {
      expect(s.life.life(id)?.currentLifeView().matters).toHaveLength(0);
      expect(s.life.life(id)?.focus.focusedRun()).toBeNull();
    }
    // A genuine addressed speech is a positive control: hearing is semantically
    // relevant, but zero provider does not manufacture a speaking/moving intention.
    s.composition.world.speak(PLAYER, "Nela, słyszysz mnie?", 420, ["resident.nela"]);
    s.life.advanceOneWorldTick();
    expect(reasonsNewerThan(s, cutoff).filter(x =>
      x.residentId === "resident.nela" && x.reason.kind === "heard_speech",
    )).toHaveLength(1);
    expect(s.life.life("resident.nela")?.focus.focusedRun()).toBeNull();
    console.info("SPC_R6_SOCIAL_DENSITY_CONTROL", JSON.stringify({
      residentsWhoReallySawPlayer: [...seen].sort(),
      newUnaddressedReasonCount: 0,
      directAddressYieldsQuestion: true,
      voluntaryNewMatter: false, providerCalls: 0,
    }));
  });
});
