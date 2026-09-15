import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateSlice } from "./five-resident-missing-crate-slice";
import { ResidentSemanticProviderMembrane } from "./resident-semantic-provider-membrane";

describe("missing-crate semantic provider composition", () => {
  it("revises resident meaning after checked absence without acquiring body or World authority", () => {
    const slice = createFiveResidentJanekMissingCrateSlice();
    let state = slice.stepJanek();
    let guard = 0;
    while (state.status === "running" && guard < 360) {
      slice.world.step();
      state = slice.stepJanek();
      guard += 1;
    }
    expect(state.status).toBe("semantic_pressure");

    const beforeActor = slice.world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek")!;
    const beforeCrate = slice.world.materialObject("crate.workshop.01");
    const membrane = new ResidentSemanticProviderMembrane();
    const providerRun = membrane.prepare(slice.kernel, "matter.janek.missing-crate");

    expect(providerRun).toMatchObject({
      version: 1,
      matter: {
        id: "matter.janek.missing-crate",
        semanticCourse: "go to the last-known workshop crate position and pick it up",
      },
      semanticEvidence: {
        kind: "checked_absence",
      },
    });
    expect(providerRun).not.toHaveProperty("runId");
    expect(providerRun).not.toHaveProperty("activity");
    expect(providerRun).not.toHaveProperty("world");

    const settled = membrane.settle(slice.kernel, providerRun.providerRunId, {
      semanticCourse: "search the nearby workshop area for the familiar crate before deciding what to do next",
    });
    expect(settled).toMatchObject({
      status: "applied",
      matter: {
        id: "matter.janek.missing-crate",
        status: "active",
        semanticRevision: 3,
        semanticCourse: "search the nearby workshop area for the familiar crate before deciding what to do next",
        activeRunId: null,
      },
    });

    // Semantic authority alone may change resident meaning, but it does not grant
    // body execution or mutate material World truth.
    const afterActor = slice.world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek")!;
    expect(afterActor.position).toEqual(beforeActor.position);
    expect(slice.world.materialObject("crate.workshop.01")).toEqual(beforeCrate);
    expect(slice.kernel.matter("matter.janek.missing-crate")?.activeRunId).toBeNull();
    expect(membrane.activeLocalRunCount()).toBe(0);
  });
});
