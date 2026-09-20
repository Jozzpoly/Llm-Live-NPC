import { describe, expect, it } from "vitest";
import {
  createR4DenseWorkshopSlice,
  R4_PRIMARY_MATTER_ID,
  R4_PRIMARY_OBJECT_ID,
  R4_PRIMARY_REACQUIRED_RUN_ID,
  R4_PRIMARY_REVEAL_POSITION,
  R4_SECONDARY_OBJECT_ID,
} from "./r4-dense-workshop-slice";
import { materialAbsencePressureReasonId } from "./resident-material-matter-relevance-bridge";

describe("R4-C legal material reacquisition -> local matter reactivation", () => {
  it("keeps A truly hidden through B and quiet, then reacquires/reactivates it only after a later observable World change", () => {
    const slice = createR4DenseWorkshopSlice();
    const hidden = slice.relocatePrimaryHidden();

    expect(hidden.to.x).toBeGreaterThan(1_650);
    expect(hidden.to.y).toBeGreaterThan(1_000);

    let step = slice.advanceOneWorldTick();
    let guard = 0;
    while (step.status !== "secondary_resolved" && guard < 2_100) {
      expect(step.status).not.toBe("authority_lost");
      expect(step.status).not.toBe("blocked");
      step = slice.advanceOneWorldTick();
      guard += 1;
    }
    expect(step.status).toBe("secondary_resolved");

    const janekAfterB = slice.world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek");
    const hiddenPrimary = slice.world.materialObject(R4_PRIMARY_OBJECT_ID);
    expect(janekAfterB).toBeDefined();
    expect(hiddenPrimary?.location.kind).toBe("free");
    if (!janekAfterB || !hiddenPrimary || hiddenPrimary.location.kind !== "free") return;

    expect(Math.hypot(
      janekAfterB.position.x - hiddenPrimary.location.position.x,
      janekAfterB.position.y - hiddenPrimary.location.position.y,
    )).toBeGreaterThan(janekAfterB.sightRadius);

    expect(slice.knowledge.observation(R4_PRIMARY_OBJECT_ID)).toMatchObject({
      lastKnownPosition: { x: 500, y: 500 },
      currentlyVisible: false,
    });
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toMatchObject({
      status: "active",
      activeRunId: null,
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: R4_PRIMARY_OBJECT_ID,
      },
      semanticEvidenceId: expect.stringContaining("checked-absence"),
    });
    expect(slice.resident.pendingCognitionReasons()).toContainEqual(expect.objectContaining({
      id: materialAbsencePressureReasonId("resident.janek", R4_PRIMARY_OBJECT_ID),
      kind: "uncertainty",
    }));

    const beforeQuietKnowledge = slice.knowledge.observation(R4_PRIMARY_OBJECT_ID);
    const beforeQuietMatter = slice.kernel.matter(R4_PRIMARY_MATTER_ID);
    const beforeQuietFacts = slice.authority.recentActionFacts();

    for (let tick = 0; tick < 240; tick += 1) slice.advanceOneWorldTick();

    expect(slice.knowledge.observation(R4_PRIMARY_OBJECT_ID)).toEqual(beforeQuietKnowledge);
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toEqual(beforeQuietMatter);
    expect(slice.authority.recentActionFacts()).toEqual(beforeQuietFacts);

    const reveal = slice.revealPrimaryNearby();
    expect(reveal.to.x).toBeCloseTo(R4_PRIMARY_REVEAL_POSITION.x, 6);
    expect(reveal.to.y).toBeCloseTo(R4_PRIMARY_REVEAL_POSITION.y, 6);

    // External World truth changed, but private knowledge is still stale until the
    // next ordinary resident-local sampling tick.
    expect(slice.knowledge.observation(R4_PRIMARY_OBJECT_ID)).toEqual(beforeQuietKnowledge);

    step = slice.advanceOneWorldTick();
    expect(step.status).toBe("primary_reactivated");
    if (step.status !== "primary_reactivated") return;

    expect(step.evidence).toMatchObject({
      kind: "material_reacquired",
      summary: expect.stringContaining(R4_PRIMARY_OBJECT_ID),
    });
    expect(step.arbitrationRequest).toMatchObject({
      status: "acquired",
      runId: R4_PRIMARY_REACQUIRED_RUN_ID,
    });
    expect(slice.knowledge.observation(R4_PRIMARY_OBJECT_ID)).toMatchObject({
      currentlyVisible: true,
      lastKnownPosition: {
        x: expect.closeTo(R4_PRIMARY_REVEAL_POSITION.x, 6),
        y: expect.closeTo(R4_PRIMARY_REVEAL_POSITION.y, 6),
      },
    });
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toMatchObject({
      status: "active",
      activeRunId: R4_PRIMARY_REACQUIRED_RUN_ID,
      semanticEvidenceId: step.evidence.id,
    });
    expect(slice.focus.focusedRun()).toBe(R4_PRIMARY_REACQUIRED_RUN_ID);
    expect(slice.resident.pendingCognitionReasons()).toEqual([]);
    expect(slice.resident.semanticPressureLifecycleSnapshot()).toContainEqual(expect.objectContaining({
      status: "settled",
      reason: expect.objectContaining({
        id: materialAbsencePressureReasonId("resident.janek", R4_PRIMARY_OBJECT_ID),
      }),
    }));
  });

  it("finishes the same material goal locally after reacquisition without provider novelty or touching unrelated material truth", () => {
    const slice = createR4DenseWorkshopSlice();
    slice.relocatePrimaryHidden();

    let step = slice.advanceOneWorldTick();
    let guard = 0;
    while (step.status !== "secondary_resolved" && guard < 2_100) {
      step = slice.advanceOneWorldTick();
      guard += 1;
    }
    expect(step.status).toBe("secondary_resolved");

    slice.revealPrimaryNearby();

    guard = 0;
    step = slice.advanceOneWorldTick();
    while (step.status !== "primary_resolved" && guard < 900) {
      expect(step.status).not.toBe("authority_lost");
      expect(step.status).not.toBe("blocked");
      step = slice.advanceOneWorldTick();
      guard += 1;
    }

    expect(guard).toBeLessThan(900);
    expect(step.status).toBe("primary_resolved");
    expect(slice.primaryResolved()).toBe(true);
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: R4_PRIMARY_OBJECT_ID,
      },
    });
    expect(slice.world.materialObject(R4_PRIMARY_OBJECT_ID)).toMatchObject({
      location: {
        kind: "held",
        actorId: "resident.janek",
      },
    });
    expect(slice.world.materialObject(R4_SECONDARY_OBJECT_ID)).toMatchObject({
      location: {
        kind: "free",
        position: { x: 1_450, y: 500 },
      },
    });

    const facts = slice.authority.recentActionFacts();
    expect(facts.map((fact) => [fact.runId, fact.action.kind, fact.action.objectId])).toEqual([
      ["run.janek.r4.pickup-basket", "material_pickup", R4_SECONDARY_OBJECT_ID],
      ["run.janek.r4.place-basket", "material_place", R4_SECONDARY_OBJECT_ID],
      [R4_PRIMARY_REACQUIRED_RUN_ID, "material_pickup", R4_PRIMARY_OBJECT_ID],
    ]);
  });
});
