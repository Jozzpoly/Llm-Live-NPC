import { describe, expect, it } from "vitest";
import { SpcWorldRuntime } from "./spc-world-runtime";

function world(hearingRadius: number): SpcWorldRuntime {
  const runtime = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  });

  // Listener is registered first so a large brain interval gives phase 0. It will not
  // run its fast brain on tick 1, allowing the deliberately high World velocity below
  // to exercise event-time causality without a test-only movement hook.
  runtime.addResident("resident.listener", "Listener", { x: 300, y: 500 }, {
    hearingRadius,
    sightRadius: 500,
    maxSpeed: 6_000,
    brainIntervalTicks: 100,
  });
  runtime.addResident("resident.speaker", "Speaker", { x: 380, y: 500 }, {
    hearingRadius,
    sightRadius: 500,
    brainIntervalTicks: 1,
  });
  runtime.setResidentActivity("resident.speaker", {
    id: "activity:speaker:communicate",
    kind: "communicate",
    targetActorId: "resident.listener",
    targetPosition: null,
    text: "event-time evidence",
    speed: null,
    reason: "speak while the listener is physically nearby",
  });
  return runtime;
}

function speechPercept(runtime: SpcWorldRuntime) {
  return runtime.residentDiagnostics("resident.listener").recentPercepts
    .find((percept) => percept.text === "event-time evidence");
}

describe("SPC World occurrence emission-time causality red gate", () => {
  it("delivers speech to a resident who was in range at emission even if they move away before queued delivery", () => {
    const runtime = world(100);
    runtime.setActorVelocity("resident.listener", { x: -6_000, y: 0 });

    runtime.step(); // speaker emits at tick 1 while listener is 80 units away; listener then moves to x=200.
    expect(runtime.diagnostics().recentOccurrences.at(-1)?.tick).toBe(1);
    runtime.step(); // queued occurrence is delivered here.

    expect(speechPercept(runtime)).toBeDefined();
  });

  it("grounds percept time and rough hearing distance from the emission snapshot, not delivery-time listener position", () => {
    const runtime = world(500);
    runtime.setActorVelocity("resident.listener", { x: -6_000, y: 0 });

    runtime.step(); // emission: listener x=300, speaker x=380 => 80/500 = near.
    const occurrence = runtime.diagnostics().recentOccurrences.at(-1)!;
    expect(occurrence.tick).toBe(1);
    runtime.step(); // delivery: listener is now x=200 => 180/500 would incorrectly become mid.

    const percept = speechPercept(runtime)!;
    expect(percept).toBeDefined();
    expect(percept.tick).toBe(occurrence.tick);
    expect(percept.spatial.kind).toBe("directional");
    if (percept.spatial.kind === "directional") {
      expect(percept.spatial.distanceBand).toBe("near");
      expect(percept.spatial.direction.x).toBeGreaterThan(0.99);
    }
  });
});
