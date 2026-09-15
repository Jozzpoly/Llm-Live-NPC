import { describe, expect, it } from "vitest";
import {
  createFiveResidentJanekDeliverySlice,
  JANEK_CRATE_DELIVERY_DESTINATION,
} from "../spc-next/five-resident-delivery-slice";
import { observeMaterialProgress } from "./spc-next-material-progress-witness";

const INPUT = {
  residentId: "resident.janek",
  matterId: "matter.janek.crate-delivery",
  objectId: "crate.workshop.01",
  destination: JANEK_CRATE_DELIVERY_DESTINATION,
} as const;

describe("research-only external material progress witness", () => {
  it("tracks real material progress without turning semantic state into a progress score", () => {
    const slice = createFiveResidentJanekDeliverySlice();
    const initial = observeMaterialProgress(slice.world, slice.kernel, INPUT);

    expect(initial.witness.relation).toBe("free_elsewhere");
    expect(initial.witness.delivered).toBe(false);
    expect(initial.witness.objectDistanceToDestination).toBeGreaterThan(1_000);
    expect(initial.semanticContext).toMatchObject({ matterStatus: "active", semanticRevision: 1 });

    const carriedDistances: number[] = [];
    let final = initial;
    let succeeded = false;

    for (let guard = 0; guard < 1_400; guard += 1) {
      const step = slice.stepJanek();
      const observed = observeMaterialProgress(slice.world, slice.kernel, INPUT);
      if (observed.witness.relation === "held_by_resident") {
        const distance = observed.witness.residentDistanceToDestination;
        if (distance !== null) carriedDistances.push(distance);
      }
      final = observed;

      expect(step.status).not.toBe("blocked");
      expect(step.status).not.toBe("authority_lost");
      if (step.status === "succeeded") {
        succeeded = true;
        break;
      }
      slice.world.step();
    }

    expect(succeeded).toBe(true);
    expect(carriedDistances.length).toBeGreaterThan(10);
    expect(carriedDistances.at(0)!).toBeGreaterThan(carriedDistances.at(-1)! + 500);
    expect(final.witness).toMatchObject({ relation: "delivered", delivered: true, carrierId: null });
    expect(final.witness.objectDistanceToDestination).toBeCloseTo(0, 8);
    expect(final.semanticContext.matterStatus).toBe("resolved");
  });

  it("does not mistake semantic revision churn for material progress", () => {
    const slice = createFiveResidentJanekDeliverySlice();
    const before = observeMaterialProgress(slice.world, slice.kernel, INPUT);

    for (let revision = 0; revision < 3; revision += 1) {
      const evidence = slice.kernel.recordEvidence({
        id: `evidence:research:semantic-churn:${revision}`,
        tick: slice.world.tick,
        kind: "research_semantic_churn",
        summary: `Research-only semantic reconsideration ${revision}.`,
      });
      slice.kernel.advanceSemanticContext(INPUT.matterId, evidence.id);
    }

    const after = observeMaterialProgress(slice.world, slice.kernel, INPUT);

    // Semantic state changed materially, but authoritative actor/material truth did not.
    expect(after.semanticContext.semanticRevision).toBe(before.semanticContext.semanticRevision! + 3);
    expect(after.witness).toEqual(before.witness);

    // The semantic churn also invalidated the old grounded run. This is deliberately
    // not interpreted as progress; it is a separate authority consequence.
    expect(slice.kernel.canRunMutateWorld("run.janek.pickup-delivery-crate")).toBe(false);
  });
});
