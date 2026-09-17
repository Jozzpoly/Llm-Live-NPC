import { describe, expect, it } from "vitest";
import {
  createFiveResidentJanekDeliverySlice,
  type FiveResidentJanekDeliverySlice,
} from "./five-resident-delivery-slice";

const MATTER_ID = "matter.janek.crate-delivery";
const CRATE_ID = "crate.workshop.01";

describe("observer-query non-interference", () => {
  it("keeps the material life slice identical under intensive read-only observation", () => {
    const baseline = createFiveResidentJanekDeliverySlice();
    const observed = createFiveResidentJanekDeliverySlice();

    let finalStatus: string | null = null;
    for (let guard = 0; guard < 1_400; guard += 1) {
      // Intentionally hammer the observed copy with the same kinds of reads an
      // Observatory/research layer would use. None of them may acquire authority.
      probeReadSurface(observed);
      probeReadSurface(observed);

      const baselineStep = baseline.stepJanek();
      const observedStep = observed.stepJanek();
      expect(observedStep).toEqual(baselineStep);

      probeReadSurface(observed);
      expect(causalProjection(observed)).toEqual(causalProjection(baseline));

      if (baselineStep.status === "succeeded") {
        finalStatus = baselineStep.status;
        break;
      }
      expect(baselineStep.status).not.toBe("blocked");
      expect(baselineStep.status).not.toBe("authority_lost");

      baseline.world.step();
      observed.world.step();
      expect(causalProjection(observed)).toEqual(causalProjection(baseline));
    }

    expect(finalStatus).toBe("succeeded");
    expect(observed.kernel.matter(MATTER_ID)).toEqual(baseline.kernel.matter(MATTER_ID));
    expect(observed.deliveryReconciliation()).toEqual(baseline.deliveryReconciliation());
  });
});

function probeReadSurface(slice: FiveResidentJanekDeliverySlice): void {
  const publicSnapshot = slice.world.publicSnapshot();
  slice.world.diagnostics();
  slice.world.materialObjects();
  slice.world.materialObject(CRATE_ID);
  slice.world.regions();
  slice.world.anchors();
  slice.world.spatialStats();
  slice.materialKnowledge.snapshot();
  slice.kernel.matter(MATTER_ID);
  slice.pickupReconciliation();
  slice.deliveryReconciliation();
  slice.executionHold();

  for (const resident of publicSnapshot.residents) {
    slice.world.residentDiagnostics(resident.id);
    const actor = publicSnapshot.actors.find((candidate) => candidate.id === resident.id);
    if (actor) slice.world.regionAt(actor.position);
  }
}

function causalProjection(slice: FiveResidentJanekDeliverySlice) {
  const snapshot = slice.world.publicSnapshot();
  return {
    world: snapshot,
    diagnostics: slice.world.diagnostics(),
    material: slice.world.materialObjects(),
    janekPrivate: slice.world.residentDiagnostics("resident.janek"),
    janekMaterialKnowledge: slice.materialKnowledge.snapshot(),
    matter: slice.kernel.matter(MATTER_ID),
    pickup: slice.pickupReconciliation(),
    delivery: slice.deliveryReconciliation(),
    hold: slice.executionHold(),
  };
}
