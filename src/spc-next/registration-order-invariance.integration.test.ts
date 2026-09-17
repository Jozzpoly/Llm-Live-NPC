import { describe, expect, it } from "vitest";
import { SpcWorldRuntime } from "./spc-world-runtime";
import type { WorldRegion } from "./contracts";

const REGION: WorldRegion = {
  id: "square",
  label: "Square",
  minX: 0,
  minY: 0,
  maxX: 1_000,
  maxY: 1_000,
};

const RESIDENTS = {
  "resident.alpha": { name: "Alpha", x: 300, y: 300 },
  "resident.beta": { name: "Beta", x: 380, y: 300 },
  "resident.gamma": { name: "Gamma", x: 460, y: 300 },
} as const;

describe("resident registration-order invariance", () => {
  it("keeps public and private causal state identical when only addResident order changes", () => {
    const forward = createWorld(["resident.alpha", "resident.beta", "resident.gamma"]);
    const reverse = createWorld(["resident.gamma", "resident.beta", "resident.alpha"]);

    forward.speak("player.owner", "Registration-order probe", 420, ["resident.beta"]);
    reverse.speak("player.owner", "Registration-order probe", 420, ["resident.beta"]);

    for (let tick = 0; tick < 36; tick += 1) {
      forward.step();
      reverse.step();

      expect(normalizePublic(forward)).toEqual(normalizePublic(reverse));
      expect(forward.diagnostics()).toEqual(reverse.diagnostics());
      for (const residentId of Object.keys(RESIDENTS)) {
        expect(forward.residentDiagnostics(residentId)).toEqual(reverse.residentDiagnostics(residentId));
      }
    }
  });
});

function createWorld(order: readonly (keyof typeof RESIDENTS)[]): SpcWorldRuntime {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [REGION],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
  world.addPlayer("player.owner", { x: 350, y: 220 }, { maxSpeed: 120 });
  for (const residentId of order) {
    const authored = RESIDENTS[residentId];
    world.addResident(residentId, authored.name, { x: authored.x, y: authored.y }, {
      brainIntervalTicks: 3,
      memoryLimit: 32,
      traceLimit: 64,
    });
  }
  return world;
}

function normalizePublic(world: SpcWorldRuntime) {
  const snapshot = world.publicSnapshot();
  return {
    tick: snapshot.tick,
    actors: snapshot.actors.map((actor) => ({
      id: actor.id,
      kind: actor.kind,
      position: actor.position,
      velocity: actor.velocity,
    })),
    residents: snapshot.residents,
  };
}
