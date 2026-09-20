import { describe, expect, it } from "vitest";
import {
  createR4DenseWorkshopSlice,
  R4_IRRELEVANT_OBJECT_ID,
  R4_PRIMARY_MATTER_ID,
  R4_PRIMARY_OBJECT_ID,
  R4_SECONDARY_DESTINATION,
  R4_SECONDARY_MATTER_ID,
  R4_SECONDARY_OBJECT_ID,
  R4_SECONDARY_PICKUP_RUN_ID,
} from "./r4-dense-workshop-slice";

describe("R4-B dense workshop local-life composition", () => {
  it("lets one blocked stale matter yield body focus to the sole deferred executable matter without provider choice", () => {
    const slice = createR4DenseWorkshopSlice();

    expect(slice.focus.focusedRun()).not.toBeNull();
    expect(slice.arbitrator.deferredRunIds()).toEqual([R4_SECONDARY_PICKUP_RUN_ID]);

    const privateBefore = slice.knowledge.observation(R4_PRIMARY_OBJECT_ID);
    expect(privateBefore).toMatchObject({
      currentlyVisible: false,
      lastKnownPosition: { x: 500, y: 500 },
    });

    const relocation = slice.relocatePrimaryHidden();
    expect(relocation.from).toEqual({ x: 500, y: 500 });
    expect(relocation.to.x).toBeLessThan(200);

    const privateAfter = slice.knowledge.observation(R4_PRIMARY_OBJECT_ID);
    expect(privateAfter).toEqual(privateBefore);

    let step = slice.advanceOneWorldTick();
    let guard = 0;
    while (step.status === "primary_running" && guard < 900) {
      step = slice.advanceOneWorldTick();
      guard += 1;
    }

    expect(guard).toBeLessThan(900);
    expect(step.status).toBe("primary_blocked");
    if (step.status !== "primary_blocked") return;

    expect(step.checkedAbsenceEvidence).toMatchObject({
      kind: "checked_absence",
      summary: expect.stringContaining("familiar crate is not visible"),
    });
    expect(step.arbitration).toEqual({
      status: "acquired_deferred",
      runId: R4_SECONDARY_PICKUP_RUN_ID,
    });

    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toMatchObject({
      status: "active",
      activeRunId: null,
      semanticEvidenceId: step.checkedAbsenceEvidence.id,
    });
    expect(slice.kernel.matter(R4_SECONDARY_MATTER_ID)).toMatchObject({
      status: "active",
      activeRunId: R4_SECONDARY_PICKUP_RUN_ID,
    });
    expect(slice.focus.focusedRun()).toBe(R4_SECONDARY_PICKUP_RUN_ID);

    expect(slice.resident.pendingCognitionReasons()).toContainEqual(expect.objectContaining({
      kind: "uncertainty",
      evidenceIds: [step.checkedAbsenceEvidence.id],
      summary: expect.stringContaining("Expected familiar material object is absent"),
    }));
  });

  it("continues factual local life through the alternate material matter while the blocked matter remains unresolved", () => {
    const slice = createR4DenseWorkshopSlice();
    slice.relocatePrimaryHidden();

    let step = slice.advanceOneWorldTick();
    let guard = 0;
    while (step.status !== "primary_blocked" && guard < 900) {
      expect(step.status).not.toBe("authority_lost");
      step = slice.advanceOneWorldTick();
      guard += 1;
    }
    expect(step.status).toBe("primary_blocked");

    guard = 0;
    step = slice.advanceOneWorldTick();
    while (step.status !== "secondary_resolved" && guard < 1_200) {
      expect(step.status).not.toBe("authority_lost");
      expect(step.status).not.toBe("blocked");
      step = slice.advanceOneWorldTick();
      guard += 1;
    }

    expect(guard).toBeLessThan(1_200);
    expect(step.status).toBe("secondary_resolved");
    expect(slice.secondaryResolved()).toBe(true);

    // B created a durable material consequence.
    expect(slice.world.materialObject(R4_SECONDARY_OBJECT_ID)).toEqual({
      id: R4_SECONDARY_OBJECT_ID,
      label: "Workshop Basket",
      radius: 18,
      location: {
        kind: "free",
        position: { ...R4_SECONDARY_DESTINATION },
      },
    });
    expect(slice.kernel.matter(R4_SECONDARY_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    // A is still Janek's unresolved resident-owned matter. Finishing B did not erase,
    // solve or silently replace the checked-absence problem.
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toMatchObject({
      status: "active",
      activeRunId: null,
    });
    expect(slice.checkedAbsenceEvidence()).not.toBeNull();

    const residentFacts = slice.authority.recentActionFacts();
    expect(residentFacts.map((fact) => fact.action.kind)).toEqual([
      "material_pickup",
      "material_place",
    ]);
    expect(residentFacts.map((fact) => fact.action.objectId)).toEqual([
      R4_SECONDARY_OBJECT_ID,
      R4_SECONDARY_OBJECT_ID,
    ]);

    // The nearby third object is real and observed by private material knowledge, but
    // no matter references it. Mere affordance presence must not manufacture activity.
    expect(slice.knowledge.observation(R4_IRRELEVANT_OBJECT_ID)).toMatchObject({
      objectId: R4_IRRELEVANT_OBJECT_ID,
      currentlyVisible: true,
    });
    expect(slice.world.materialObject(R4_IRRELEVANT_OBJECT_ID)).toEqual({
      id: R4_IRRELEVANT_OBJECT_ID,
      label: "Background Stool",
      radius: 18,
      location: {
        kind: "free",
        position: { x: 1_180, y: 650 },
      },
    });
    expect(residentFacts.some((fact) => fact.action.objectId === R4_IRRELEVANT_OBJECT_ID)).toBe(false);
    expect(residentFacts.some((fact) => fact.action.objectId === R4_PRIMARY_OBJECT_ID)).toBe(false);
  });

  it("ends in legitimate quiet with the unresolved blocked matter preserved rather than inventing a new local chore", () => {
    const slice = createR4DenseWorkshopSlice();
    slice.relocatePrimaryHidden();

    let step = slice.advanceOneWorldTick();
    let guard = 0;
    while (step.status !== "secondary_resolved" && guard < 2_100) {
      step = slice.advanceOneWorldTick();
      guard += 1;
    }
    expect(step.status).toBe("secondary_resolved");

    const beforeBody = slice.world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek");
    const beforePrimary = slice.kernel.matter(R4_PRIMARY_MATTER_ID);
    const beforeBackground = slice.world.materialObject(R4_IRRELEVANT_OBJECT_ID);
    const beforeActionCount = slice.authority.recentActionFacts().length;

    for (let tick = 0; tick < 600; tick += 1) {
      slice.advanceOneWorldTick();
    }

    const afterBody = slice.world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek");
    expect(afterBody?.position).toEqual(beforeBody?.position);
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toEqual(beforePrimary);
    expect(slice.world.materialObject(R4_IRRELEVANT_OBJECT_ID)).toEqual(beforeBackground);
    expect(slice.authority.recentActionFacts()).toHaveLength(beforeActionCount);
    expect(slice.arbitrator.reconcile()).toEqual({ status: "idle" });
  });
});
