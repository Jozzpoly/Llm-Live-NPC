import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMaterialSlice } from "./five-resident-material-slice";

describe("five resident Janek material slice", () => {
  it("preserves factual pickup as an intermediate boundary of one continuing delivery matter", () => {
    const slice = createFiveResidentJanekMaterialSlice();
    let state = slice.stepJanek();
    let guard = 0;

    while (!(state.status === "running" && state.phase === "delivery") && guard < 120) {
      slice.world.step();
      state = slice.stepJanek();
      guard += 1;
    }

    expect(state).toMatchObject({ status: "running", phase: "delivery" });
    expect(slice.world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "held",
      actorId: "resident.janek",
    });
    expect(slice.reconciliation()).toMatchObject({
      status: "recorded",
      binding: {
        matterId: "matter.janek.crate-delivery",
        runId: "run.janek.pickup-delivery-crate",
      },
    });
    expect(slice.kernel.matter("matter.janek.crate-delivery")).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: "run.janek.place-delivery-crate",
    });
  });
});
