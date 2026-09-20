import { describe, expect, it } from "vitest";
import {
  createR4DenseWorkshopSlice,
  R4_PRIMARY_MATTER_ID,
  R4_PRIMARY_OBJECT_ID,
} from "./r4-dense-workshop-slice";

describe("R4-C material perception / reactivation characterization", () => {
  it("shows the current gap: quiet local life does not refresh recognized material knowledge outside an active material routine", () => {
    const slice = createR4DenseWorkshopSlice();
    slice.relocatePrimaryHidden();

    let step = slice.advanceOneWorldTick();
    let guard = 0;
    while (step.status !== "secondary_resolved" && guard < 2_100) {
      step = slice.advanceOneWorldTick();
      guard += 1;
    }
    expect(step.status).toBe("secondary_resolved");

    const janek = slice.world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek");
    const primary = slice.world.materialObject(R4_PRIMARY_OBJECT_ID);
    expect(janek).toBeDefined();
    expect(primary?.location.kind).toBe("free");
    if (!janek || !primary || primary.location.kind !== "free") return;

    const physicalDistance = Math.hypot(
      janek.position.x - primary.location.position.x,
      janek.position.y - primary.location.position.y,
    );

    // The object is now physically inside Janek's nominal sight radius.
    expect(physicalDistance).toBeLessThan(janek.sightRadius);

    // Yet the private material extension still holds the old checked-absence view.
    // No hidden truth leaked, but ordinary quiet-life ticks are not sampling recognized
    // material observations either.
    expect(slice.knowledge.observation(R4_PRIMARY_OBJECT_ID)).toMatchObject({
      lastKnownPosition: { x: 500, y: 500 },
      currentlyVisible: false,
    });

    const beforeMatter = slice.kernel.matter(R4_PRIMARY_MATTER_ID);
    const beforeKnowledge = slice.knowledge.observation(R4_PRIMARY_OBJECT_ID);

    for (let tick = 0; tick < 240; tick += 1) {
      slice.advanceOneWorldTick();
    }

    expect(slice.knowledge.observation(R4_PRIMARY_OBJECT_ID)).toEqual(beforeKnowledge);
    expect(slice.kernel.matter(R4_PRIMARY_MATTER_ID)).toEqual(beforeMatter);
  });
});
