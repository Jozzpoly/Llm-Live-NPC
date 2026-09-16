import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateRecoverySlice } from "./five-resident-missing-crate-recovery-slice";

const CRATE_ID = "crate.workshop.01";
const MATTER_ID = "matter.janek.missing-crate";
const MAX_STEPS = 1_500;

describe("five-resident missing-crate embodied recovery", () => {
  it("moves from stale history through inspection, semantic search, legal reacquisition and separately authorized pickup", () => {
    const slice = createFiveResidentJanekMissingCrateRecoverySlice();
    const seenPhases = new Set<string>();
    let sawReacquired = false;
    let guard = 0;

    while (slice.phase() !== "resolved" && guard < MAX_STEPS) {
      const step = slice.advanceOneWorldTick();
      seenPhases.add(slice.phase());
      if (step.status === "reacquired") {
        sawReacquired = true;
        expect(step.observation).toMatchObject({
          objectId: CRATE_ID,
          currentlyVisible: true,
        });
        expect(slice.authority.recentActionFacts()).toEqual([]);
        expect(slice.world.materialObject(CRATE_ID)?.location.kind).toBe("free");
        expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
          status: "active",
          semanticRevision: 4,
          activeRunId: null,
        });
      }
      guard += 1;
    }

    expect(guard).toBeLessThan(MAX_STEPS);
    expect(sawReacquired).toBe(true);
    expect([...seenPhases]).toEqual(expect.arrayContaining([
      "checking_last_known",
      "awaiting_search_semantics",
      "searching",
      "awaiting_pickup_semantics",
      "picking_up",
      "resolved",
    ]));

    const facts = slice.authority.recentActionFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      residentId: "resident.janek",
      runId: "run.janek.pickup-reacquired-crate",
      action: { kind: "material_pickup", objectId: CRATE_ID },
      resolution: { status: "resolved", outcomeStatus: "succeeded", code: "picked_up" },
    });
    expect(slice.world.materialObject(CRATE_ID)?.location).toEqual({ kind: "held", actorId: "resident.janek" });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "resolved",
      semanticRevision: 5,
      activeRunId: null,
    });
    expect(slice.kernel.pendingSemanticProposals()).toEqual([]);
  });
});
