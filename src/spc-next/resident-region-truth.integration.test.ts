import { describe, expect, it } from "vitest";
import type { ResidentActivity } from "./contracts";
import { SpcWorldRuntime } from "./spc-world-runtime";

function travel(id: string, x: number, y: number): ResidentActivity {
  return {
    id,
    kind: "travel",
    targetActorId: null,
    targetPosition: { x, y },
    text: null,
    speed: 120,
    reason: "region truth qualification",
  };
}

describe("SPC Next authoritative resident region truth", () => {
  it("clears stale currentRegionId when authoritative motion enters valid World space outside all authored regions", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 400 },
      regions: [
        { id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 120, maxY: 200 },
      ],
      chunkSize: 64,
      fixedDeltaSeconds: 1 / 60,
    });
    const resident = world.addResident(
      "resident.mira",
      "Mira",
      { x: 60, y: 100 },
      { brainIntervalTicks: 1, maxSpeed: 120 },
    );

    const initial = resident.cognitionContext({
      residentId: "resident.mira",
      requestedAtTick: world.tick,
      reasons: [],
    });
    expect(initial.currentRegionId).toBe("hearth");
    expect(initial.knownRegions).toContainEqual(expect.objectContaining({
      id: "hearth",
      knowledge: "visited",
    }));

    world.setResidentActivity("resident.mira", travel("activity:leave-hearth", 400, 100));
    world.step(60);

    const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === "resident.mira")!;
    expect(actor.position.x).toBeGreaterThan(120);
    expect(world.regionAt(actor.position)).toBeNull();

    const outside = resident.cognitionContext({
      residentId: "resident.mira",
      requestedAtTick: world.tick,
      reasons: [],
    });
    expect(outside.currentRegionId).toBeNull();
    expect(outside.knownRegions).toContainEqual(expect.objectContaining({
      id: "hearth",
      knowledge: "visited",
    }));
    expect(resident.semanticPressureDecisions()).toContainEqual(expect.objectContaining({
      tick: expect.any(Number),
      disposition: "observation_only",
      code: "region_transition",
      cognitionReason: null,
      summary: expect.stringContaining("hearth -> none"),
    }));
    expect(resident.pendingCognitionReasons()).toEqual([]);

    world.setResidentActivity("resident.mira", travel("activity:return-hearth", 60, 100));
    world.step(70);

    const returned = resident.cognitionContext({
      residentId: "resident.mira",
      requestedAtTick: world.tick,
      reasons: [],
    });
    expect(returned.currentRegionId).toBe("hearth");
    expect(returned.knownRegions.find((region) => region.id === "hearth")?.lastVisitedTick).toBe(world.tick);
  });
});
