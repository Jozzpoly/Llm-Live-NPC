import { describe, expect, it } from "vitest";
import { SpcWorldRuntime } from "./spc-world-runtime";

function run(addSpeakerFirst: boolean): number | undefined {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  });

  const addSpeaker = () => world.addResident("resident.speaker", "Speaker", { x: 100, y: 100 }, {
    brainIntervalTicks: 4,
    sightRadius: 300,
    hearingRadius: 300,
  });
  const addListener = () => world.addResident("resident.listener", "Listener", { x: 140, y: 100 }, {
    brainIntervalTicks: 4,
    sightRadius: 300,
    hearingRadius: 300,
  });

  if (addSpeakerFirst) {
    addSpeaker();
    addListener();
  } else {
    addListener();
    addSpeaker();
  }

  world.setResidentActivity("resident.speaker", {
    id: "activity:speaker:communicate",
    kind: "communicate",
    targetActorId: "resident.listener",
    targetPosition: null,
    text: "cadence probe",
    speed: null,
    reason: "cadence determinism probe",
  });

  world.step(4);
  return world.diagnostics().recentOccurrences.find((occurrence) => occurrence.text === "cadence probe")?.tick;
}

describe("SPC resident local-brain cadence determinism", () => {
  it("does not change a resident's local cognition phase when unrelated residents are registered in another order", () => {
    const speakerFirst = run(true);
    const speakerSecond = run(false);

    expect(speakerFirst).toBeDefined();
    expect(speakerSecond).toBeDefined();
    expect(speakerSecond).toBe(speakerFirst);
  });
});
