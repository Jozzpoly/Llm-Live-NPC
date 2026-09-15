import { describe, expect, it } from "vitest";
import {
  createFiveResidentJanekDeliverySlice,
  JANEK_CRATE_DELIVERY_DESTINATION,
} from "./five-resident-delivery-slice";

describe("five resident Janek delivery slice", () => {
  it("keeps one matter continuous across pickup and placement runs", () => {
    const slice = createFiveResidentJanekDeliverySlice();
    let state = slice.stepJanek();
    let guard = 0;
    let observedPickupBoundary = false;

    while (state.status === "running" && guard < 1_200) {
      if (state.phase === "delivery" && !observedPickupBoundary) {
        observedPickupBoundary = true;
        expect(slice.world.materialObject("crate.workshop.01")?.location).toEqual({
          kind: "held",
          actorId: "resident.janek",
        });
        expect(slice.pickupReconciliation()).toMatchObject({
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
      }
      slice.world.step();
      state = slice.stepJanek();
      guard += 1;
    }

    expect(observedPickupBoundary).toBe(true);
    expect(state.status).toBe("succeeded");
    expect(slice.deliveryReconciliation()).toMatchObject({
      status: "recorded",
      binding: {
        matterId: "matter.janek.crate-delivery",
        runId: "run.janek.place-delivery-crate",
      },
    });
    expect(slice.kernel.matter("matter.janek.crate-delivery")).toMatchObject({
      status: "resolved",
      semanticRevision: 1,
      activeRunId: null,
    });
    expect(slice.world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "free",
      position: JANEK_CRATE_DELIVERY_DESTINATION,
    });
  });

  it("holds only execution while preserving the same active matter, run and possession, then resumes", () => {
    const slice = createFiveResidentJanekDeliverySlice();
    let state = slice.stepJanek();
    let guard = 0;

    while (!(state.status === "running" && state.phase === "delivery") && guard < 120) {
      slice.world.step();
      state = slice.stepJanek();
      guard += 1;
    }

    expect(state).toMatchObject({ status: "running", phase: "delivery" });
    expect(slice.holdJanekExecution("temporary participant interruption")).toBe(true);
    const before = slice.world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek")!.position;

    for (let tick = 0; tick < 60; tick += 1) {
      slice.world.step();
      state = slice.stepJanek();
      expect(state).toMatchObject({
        status: "execution_held",
        phase: "delivery",
        runId: "run.janek.place-delivery-crate",
      });
    }

    const after = slice.world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek")!.position;
    expect(after).toEqual(before);
    expect(slice.world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "held",
      actorId: "resident.janek",
    });
    expect(slice.kernel.matter("matter.janek.crate-delivery")).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: "run.janek.place-delivery-crate",
    });
    expect(slice.kernel.runBinding("run.janek.place-delivery-crate")).toMatchObject({
      matterId: "matter.janek.crate-delivery",
      semanticRevision: 1,
    });

    expect(slice.resumeJanekExecution()).toBe(true);
    state = slice.stepJanek();
    guard = 0;
    while (state.status === "running" && guard < 1_200) {
      slice.world.step();
      state = slice.stepJanek();
      guard += 1;
    }

    expect(state.status).toBe("succeeded");
    expect(slice.kernel.matter("matter.janek.crate-delivery")?.status).toBe("resolved");
    expect(slice.world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "free",
      position: JANEK_CRATE_DELIVERY_DESTINATION,
    });
  });
});
