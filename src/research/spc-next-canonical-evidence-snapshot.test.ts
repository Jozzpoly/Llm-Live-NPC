import { describe, expect, it } from "vitest";
import {
  createFiveResidentJanekDeliverySlice,
  JANEK_CRATE_DELIVERY_DESTINATION,
} from "../spc-next/five-resident-delivery-slice";
import { createFiveResidentJanekMissingCrateSlice } from "../spc-next/five-resident-missing-crate-slice";
import { captureSpcCanonicalEvidenceSnapshot } from "./spc-next-canonical-evidence-snapshot";

const RESIDENT_ID = "resident.janek";
const DELIVERY_MATTER = "matter.janek.crate-delivery";
const MISSING_MATTER = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";

describe("SPC canonical evidence snapshot v1", () => {
  it("joins World material truth, Janek private knowledge and exact continuity authority during delivery", () => {
    const slice = createFiveResidentJanekDeliverySlice();
    const initial = captureSpcCanonicalEvidenceSnapshot({
      scenarioId: "baseline-delivery",
      residentId: RESIDENT_ID,
      matterId: DELIVERY_MATTER,
      world: slice.world,
      kernel: slice.kernel,
      materialKnowledge: slice.materialKnowledge,
      authority: slice.authority,
    });

    expect(initial).toMatchObject({
      schemaVersion: 1,
      scenarioId: "baseline-delivery",
      tick: 0,
      continuity: {
        matter: {
          id: DELIVERY_MATTER,
          status: "active",
          semanticRevision: 1,
          activeRunId: "run.janek.pickup-delivery-crate",
        },
        activeRunBinding: {
          runId: "run.janek.pickup-delivery-crate",
          matterId: DELIVERY_MATTER,
          semanticRevision: 1,
        },
        activeRunCanMutateWorld: true,
      },
      causalProvenance: {
        residentWorldActionFacts: [],
      },
    });
    expect(initial.authoritativeWorld.materialObjects).toContainEqual(expect.objectContaining({
      id: CRATE_ID,
      location: { kind: "free", position: { x: 1_952, y: 720 } },
    }));
    expect(initial.residentPrivate.materialKnowledge).toEqual([]);

    const pickupBoundary = slice.stepJanek();
    expect(pickupBoundary).toMatchObject({ status: "running", phase: "delivery" });

    const afterPickup = captureSpcCanonicalEvidenceSnapshot({
      scenarioId: "baseline-delivery",
      residentId: RESIDENT_ID,
      matterId: DELIVERY_MATTER,
      world: slice.world,
      kernel: slice.kernel,
      materialKnowledge: slice.materialKnowledge,
      authority: slice.authority,
    });

    expect(afterPickup.authoritativeWorld.materialObjects).toContainEqual(expect.objectContaining({
      id: CRATE_ID,
      location: { kind: "held", actorId: RESIDENT_ID },
    }));
    const pickupWorldAction = afterPickup.authoritativeWorld.recentMaterialActions.at(-1);
    expect(pickupWorldAction).toMatchObject({
      actorId: RESIDENT_ID,
      objectId: CRATE_ID,
      status: "succeeded",
      code: "picked_up",
    });
    const pickupFact = afterPickup.causalProvenance.residentWorldActionFacts.at(-1);
    expect(pickupFact).toMatchObject({
      residentId: RESIDENT_ID,
      runId: "run.janek.pickup-delivery-crate",
      action: { kind: "material_pickup", objectId: CRATE_ID },
      resolution: {
        status: "resolved",
        outcomeStatus: "succeeded",
        code: "picked_up",
      },
    });
    expect(pickupFact?.resolution.status).toBe("resolved");
    if (!pickupWorldAction || !pickupFact || pickupFact.resolution.status !== "resolved") {
      throw new Error("pickup causal evidence missing");
    }
    expect(pickupFact.resolution.actionSeq).toBe(pickupWorldAction.actionSeq);
    expect(pickupFact.tick).toBe(pickupWorldAction.tick);

    expect(afterPickup.residentPrivate.materialKnowledge).toContainEqual(expect.objectContaining({
      objectId: CRATE_ID,
      lastKnownPosition: { x: 1_952, y: 720 },
      currentlyVisible: true,
    }));
    expect(afterPickup.continuity).toMatchObject({
      matter: {
        status: "active",
        activeRunId: "run.janek.place-delivery-crate",
      },
      lastOutcomeEvidence: {
        kind: "task_outcome",
      },
      activeRunBinding: {
        runId: "run.janek.place-delivery-crate",
        matterId: DELIVERY_MATTER,
      },
      activeRunCanMutateWorld: true,
    });
    expect(afterPickup.continuity.lastOutcomeEvidence?.id).toContain("run.janek.pickup-delivery-crate");

    let step = pickupBoundary;
    for (let guard = 0; guard < 1_400 && step.status !== "succeeded"; guard += 1) {
      slice.world.step();
      step = slice.stepJanek();
    }
    expect(step.status).toBe("succeeded");

    const final = captureSpcCanonicalEvidenceSnapshot({
      scenarioId: "baseline-delivery",
      residentId: RESIDENT_ID,
      matterId: DELIVERY_MATTER,
      world: slice.world,
      kernel: slice.kernel,
      materialKnowledge: slice.materialKnowledge,
      authority: slice.authority,
    });
    expect(final.authoritativeWorld.materialObjects).toContainEqual(expect.objectContaining({
      id: CRATE_ID,
      location: { kind: "free", position: JANEK_CRATE_DELIVERY_DESTINATION },
    }));
    const placedWorldAction = final.authoritativeWorld.recentMaterialActions.at(-1);
    expect(placedWorldAction).toMatchObject({
      code: "placed",
      status: "succeeded",
    });
    const placeFact = final.causalProvenance.residentWorldActionFacts.at(-1);
    expect(placeFact).toMatchObject({
      runId: "run.janek.place-delivery-crate",
      action: {
        kind: "material_place",
        objectId: CRATE_ID,
        position: JANEK_CRATE_DELIVERY_DESTINATION,
      },
      resolution: {
        status: "resolved",
        outcomeStatus: "succeeded",
        code: "placed",
      },
    });
    expect(placeFact?.resolution.status).toBe("resolved");
    if (!placedWorldAction || !placeFact || placeFact.resolution.status !== "resolved") {
      throw new Error("place causal evidence missing");
    }
    expect(placeFact.resolution.actionSeq).toBe(placedWorldAction.actionSeq);
    expect(placeFact.tick).toBe(placedWorldAction.tick);

    expect(final.continuity.matter).toMatchObject({ status: "resolved", activeRunId: null });
    expect(final.continuity.activeRunBinding).toBeNull();
    expect(final.continuity.activeRunCanMutateWorld).toBe(false);

    // Live evidence pins are intentionally released after terminalization. The
    // canonical projection must report that honestly rather than manufacture history.
    expect(final.continuity.originEvidence).toBeNull();
    expect(final.continuity.semanticEvidence).toBeNull();
    expect(final.continuity.lastOutcomeEvidence).toBeNull();
  });

  it("makes hidden World truth and Janek's stale private material knowledge simultaneously visible to research", () => {
    const slice = createFiveResidentJanekMissingCrateSlice({ hiddenRelocationSpeed: 48_000 });
    const beforePressure = captureSpcCanonicalEvidenceSnapshot({
      scenarioId: "missing-crate",
      residentId: RESIDENT_ID,
      matterId: MISSING_MATTER,
      world: slice.world,
      kernel: slice.kernel,
      materialKnowledge: slice.materialKnowledge,
      authority: slice.authority,
    });

    const worldCrate = beforePressure.authoritativeWorld.materialObjects.find((object) => object.id === CRATE_ID);
    const privateCrate = beforePressure.residentPrivate.materialKnowledge.find((object) => object.objectId === CRATE_ID);
    expect(worldCrate?.location.kind).toBe("free");
    expect(privateCrate).toMatchObject({
      lastKnownPosition: { x: 1_952, y: 720 },
      currentlyVisible: false,
    });
    if (!worldCrate || worldCrate.location.kind !== "free" || !privateCrate) throw new Error("missing crate evidence setup failed");
    expect(worldCrate.location.position).not.toEqual(privateCrate.lastKnownPosition);
    expect(beforePressure.continuity.activeRunCanMutateWorld).toBe(true);

    let semanticPressure = slice.stepJanek();
    for (let guard = 0; guard < 360 && semanticPressure.status === "running"; guard += 1) {
      slice.world.step();
      semanticPressure = slice.stepJanek();
    }
    expect(semanticPressure.status).toBe("semantic_pressure");

    const afterPressure = captureSpcCanonicalEvidenceSnapshot({
      scenarioId: "missing-crate",
      residentId: RESIDENT_ID,
      matterId: MISSING_MATTER,
      world: slice.world,
      kernel: slice.kernel,
      materialKnowledge: slice.materialKnowledge,
      authority: slice.authority,
    });
    expect(afterPressure.continuity).toMatchObject({
      matter: {
        id: MISSING_MATTER,
        status: "active",
        semanticRevision: 2,
        activeRunId: null,
      },
      semanticEvidence: {
        kind: "checked_absence",
      },
      lastOutcomeEvidence: {
        kind: "task_outcome",
      },
      activeRunBinding: null,
      activeRunCanMutateWorld: false,
    });

    const failedPickupFact = afterPressure.causalProvenance.residentWorldActionFacts.at(-1);
    expect(failedPickupFact).toMatchObject({
      runId: "run.janek.pickup-last-known-crate",
      action: { kind: "material_pickup", objectId: CRATE_ID },
      resolution: {
        status: "resolved",
        outcomeStatus: "rejected",
      },
    });
    expect(afterPressure.continuity.lastOutcomeEvidence?.id).toContain("run.janek.pickup-last-known-crate");

    const afterWorldCrate = afterPressure.authoritativeWorld.materialObjects.find((object) => object.id === CRATE_ID);
    const afterPrivateCrate = afterPressure.residentPrivate.materialKnowledge.find((object) => object.objectId === CRATE_ID);
    expect(afterWorldCrate).toEqual(worldCrate);
    expect(afterPrivateCrate?.lastKnownPosition).toEqual(privateCrate.lastKnownPosition);
  });

  it("is a defensive observation surface rather than a second mutable game state", () => {
    const slice = createFiveResidentJanekDeliverySlice();
    const captured = captureSpcCanonicalEvidenceSnapshot({
      scenarioId: "defensive-snapshot",
      residentId: RESIDENT_ID,
      matterId: DELIVERY_MATTER,
      world: slice.world,
      kernel: slice.kernel,
      materialKnowledge: slice.materialKnowledge,
      authority: slice.authority,
    });

    const janek = captured.authoritativeWorld.actors.find((actor) => actor.id === RESIDENT_ID);
    if (!janek) throw new Error("Janek missing from canonical evidence");
    janek.position.x = 9_999;
    if (captured.continuity.matter) captured.continuity.matter.semanticCourse = "forged research mutation";
    const fact = captured.causalProvenance.residentWorldActionFacts[0];
    if (fact) fact.runId = "forged.run";

    const recaptured = captureSpcCanonicalEvidenceSnapshot({
      scenarioId: "defensive-snapshot",
      residentId: RESIDENT_ID,
      matterId: DELIVERY_MATTER,
      world: slice.world,
      kernel: slice.kernel,
      materialKnowledge: slice.materialKnowledge,
      authority: slice.authority,
    });
    expect(recaptured.authoritativeWorld.actors.find((actor) => actor.id === RESIDENT_ID)?.position.x).toBe(1_900);
    expect(recaptured.continuity.matter?.semanticCourse).toBe("deliver the workshop crate to the crossroads storage point");
    expect(recaptured.causalProvenance.residentWorldActionFacts).toEqual([]);
  });
});
