import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMaterialSlice } from "./five-resident-material-slice";

describe("five resident Janek material slice", () => {
  it("runs the authored Janek matter through embodied pickup and factual reconciliation", () => {
    const slice = createFiveResidentJanekMaterialSlice();
    let state = slice.stepJanek();
    let guard = 0;

    while (state.status === "running" && guard < 120) {
      slice.world.step();
      state = slice.stepJanek();
      guard += 1;
    }

    expect(state.status).toBe("succeeded");
    expect(slice.world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "held",
      actorId: "resident.janek",
    });
    expect(slice.reconciliation()).toMatchObject({
      status: "recorded",
      binding: {
        matterId: "matter.janek.workshop-crate",
        runId: "run.janek.pickup-workshop-crate",
      },
    });
    expect(slice.kernel.matter("matter.janek.workshop-crate")).toMatchObject({
      status: "active",
      activeRunId: null,
    });
  });
});
