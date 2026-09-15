import { describe, expect, it } from "vitest";
import {
  createFiveResidentJanekMissingCrateSlice,
  type FiveResidentJanekMissingCrateSlice,
  type FiveResidentJanekMissingCrateStep,
} from "./five-resident-missing-crate-slice";

const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const JANEK_ID = "resident.janek";
const MAX_RESIDENT_STEPS = 520;

describe("epistemic non-interference", () => {
  it("keeps Janek causally equivalent while hidden crate truth differs but his acquired history is identical", () => {
    const nearerHiddenTruth = createFiveResidentJanekMissingCrateSlice({ hiddenRelocationSpeed: 48_000 });
    const fartherHiddenTruth = createFiveResidentJanekMissingCrateSlice({ hiddenRelocationSpeed: 54_000 });

    const crateA = freeCratePosition(nearerHiddenTruth);
    const crateB = freeCratePosition(fartherHiddenTruth);
    expect(crateA).not.toEqual(crateB);

    // The Worlds are objectively different, but Janek has acquired the same legal
    // material history in both. From this point until a differentiating perception,
    // his private state and embodied local execution must remain equivalent.
    expect(nearerHiddenTruth.materialKnowledge.snapshot()).toEqual(fartherHiddenTruth.materialKnowledge.snapshot());
    expect(nearerHiddenTruth.kernel.matter(MATTER_ID)).toEqual(fartherHiddenTruth.kernel.matter(MATTER_ID));

    let stepA = nearerHiddenTruth.stepJanek();
    let stepB = fartherHiddenTruth.stepJanek();
    let guard = 0;
    let sawInspect = false;

    while (guard < MAX_RESIDENT_STEPS) {
      expect(stepA).toEqual(stepB);
      expect(janekState(nearerHiddenTruth)).toEqual(janekState(fartherHiddenTruth));
      expect(nearerHiddenTruth.materialKnowledge.snapshot()).toEqual(fartherHiddenTruth.materialKnowledge.snapshot());
      expect(nearerHiddenTruth.kernel.matter(MATTER_ID)).toEqual(fartherHiddenTruth.kernel.matter(MATTER_ID));

      if (stepA.status === "running" && stepA.local.status === "running" && stepA.local.phase === "inspect") {
        sawInspect = true;
      }
      if (stepA.status !== "running" || stepB.status !== "running") break;

      nearerHiddenTruth.world.step();
      fartherHiddenTruth.world.step();
      stepA = nearerHiddenTruth.stepJanek();
      stepB = fartherHiddenTruth.stepJanek();
      guard += 1;
    }

    expect(guard).toBeLessThan(MAX_RESIDENT_STEPS);
    expect(sawInspect).toBe(true);
    expect(stepA.status).toBe("semantic_pressure");
    expect(stepB.status).toBe("semantic_pressure");
    expect(stepA).toEqual(stepB);

    // Hidden truth remains different even though the resident-side causal chain is
    // the same. Local inspection must not become a disguised object-id oracle.
    expect(freeCratePosition(nearerHiddenTruth)).not.toEqual(freeCratePosition(fartherHiddenTruth));
    expect(nearerHiddenTruth.authority.recentActionFacts()).toEqual([]);
    expect(fartherHiddenTruth.authority.recentActionFacts()).toEqual([]);
    expect(nearerHiddenTruth.semanticPressureEvidence()).toEqual(fartherHiddenTruth.semanticPressureEvidence());
    expect(nearerHiddenTruth.blockedRunReconciliation()).toEqual(fartherHiddenTruth.blockedRunReconciliation());
  });
});

function janekState(slice: FiveResidentJanekMissingCrateSlice) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === JANEK_ID);
  if (!actor) throw new Error("Janek missing from world");
  return {
    position: actor.position,
    velocity: actor.velocity,
  };
}

function freeCratePosition(slice: FiveResidentJanekMissingCrateSlice) {
  const crate = slice.world.materialObject(CRATE_ID);
  if (!crate || crate.location.kind !== "free") throw new Error("crate is not free");
  return crate.location.position;
}

// Keep the imported union in this file's type surface so future additions to the
// slice step model remain visible to this hyperproperty during typechecking.
type _StepSurface = FiveResidentJanekMissingCrateStep;
