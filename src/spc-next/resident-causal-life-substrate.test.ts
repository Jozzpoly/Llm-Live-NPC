import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

const IDA_ID = "resident.ida";
const PLAYER_ID = "player.jozz";

describe("ResidentCausalLifeSubstrate", () => {
  it("gives one resident one shared continuity/scope across generic causal authorities and life cognition", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const substrate = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation: createFiveResidentNavigationGraph(),
    });

    substrate.kernel.recordEvidence({
      id: "evidence.ida.substrate.seed",
      tick: world.tick,
      kind: "test_origin",
      summary: "one existing Ida life matter",
    });
    const seeded = substrate.kernel.openMatter({
      id: "matter.ida.substrate.seed",
      originEvidenceId: "evidence.ida.substrate.seed",
      semanticCourse: "remember one existing continuing matter",
    });
    substrate.matterScope.track(seeded.id);

    expect(substrate.travelCommitments.acceptedMatterIds()).toEqual([seeded.id]);
    expect(substrate.communicateCommitments.acceptedMatterIds()).toEqual([seeded.id]);
    expect(substrate.outcomeTravelCommitments.acceptedMatterIds()).toEqual([seeded.id]);
    expect(substrate.currentLifeView().matters).toEqual([
      expect.objectContaining({
        id: seeded.id,
        status: "active",
      }),
    ]);

    const occurrence = world.speak(
      PLAYER_ID,
      "Ida, słyszysz mnie?",
      420,
      [IDA_ID],
    );
    world.step();

    let prepared = substrate.takeReadyLifeIntentAttempt();
    for (let step = 0; step < 180 && !prepared; step += 1) {
      world.step();
      prepared = substrate.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;

    expect(prepared.attempt.context.life.matters).toContainEqual(expect.objectContaining({
      id: seeded.id,
      status: "active",
    }));
    expect(prepared.attempt.context.recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: occurrence.id,
      phenomenon: "speech",
      addressed: true,
    }));

    // One exact cognition attempt owns admission until it settles or is abandoned.
    expect(substrate.takeReadyLifeIntentAttempt()).toBeNull();
    expect(substrate.lifeIntentOwner.abandon(prepared.attempt)).toBe(true);
  });
});
