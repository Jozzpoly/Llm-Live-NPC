import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateSlice } from "./five-resident-missing-crate-slice";

describe("five resident Janek missing-crate semantic pressure", () => {
  it("turns exhausted local execution into checked-absence semantic evidence without resolving the matter", () => {
    const slice = createFiveResidentJanekMissingCrateSlice();
    const initial = slice.kernel.matter("matter.janek.missing-crate");
    expect(initial).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: "run.janek.pickup-last-known-crate",
    });

    let state = slice.stepJanek();
    let guard = 0;
    while (state.status === "running" && guard < 360) {
      slice.world.step();
      state = slice.stepJanek();
      guard += 1;
    }

    expect(state.status).toBe("semantic_pressure");
    if (state.status !== "semantic_pressure") throw new Error(`unexpected state: ${state.status}`);
    expect(state.local).toMatchObject({
      status: "blocked",
      runId: "run.janek.pickup-last-known-crate",
      materialOutcome: {
        status: "rejected",
        code: "out_of_range",
        before: null,
        after: null,
      },
    });
    expect(state.checkedAbsenceEvidence).toMatchObject({
      kind: "checked_absence",
    });

    expect(slice.blockedRunReconciliation()).toMatchObject({
      status: "recorded",
      binding: {
        matterId: "matter.janek.missing-crate",
        runId: "run.janek.pickup-last-known-crate",
      },
      evidence: {
        kind: "task_outcome",
      },
    });

    const matter = slice.kernel.matter("matter.janek.missing-crate");
    expect(matter).toMatchObject({
      status: "active",
      semanticRevision: 2,
      semanticCourse: "go to the last-known workshop crate position and pick it up",
      activeRunId: null,
      semanticEvidenceId: state.checkedAbsenceEvidence.id,
    });
    expect(slice.kernel.semanticEvidence("matter.janek.missing-crate")).toEqual(state.checkedAbsenceEvidence);
    expect(slice.kernel.lastOutcomeEvidence("matter.janek.missing-crate")).toMatchObject({
      kind: "task_outcome",
    });

    const actualCrate = slice.world.materialObject("crate.workshop.01");
    expect(actualCrate?.location.kind).toBe("free");
    if (!actualCrate || actualCrate.location.kind !== "free") throw new Error("crate did not remain in World");
    expect(actualCrate.location.position.x).toBeGreaterThan(2_500);
    expect(slice.materialKnowledge.lastKnownPosition("crate.workshop.01")).toEqual({ x: 1_952, y: 720 });

    // This is the exact pre-provider frontier: resident meaning is still alive,
    // local execution has no current run, and new evidence says the old course
    // needs semantic reconsideration rather than mechanical retry.
    expect(slice.kernel.pendingSemanticProposals()).toHaveLength(0);
  });
});
