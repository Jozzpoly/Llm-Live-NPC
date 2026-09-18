import { describe, expect, it } from "vitest";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import {
  createFiveResidentRegionComposition,
  type FiveResidentId,
} from "./five-resident-region";

const MOVING_OPENING_RESIDENTS = [
  "resident.mira",
  "resident.ida",
  "resident.oren",
  "resident.nela",
] as const satisfies readonly FiveResidentId[];

describe("five-resident causal life runtime handoff", () => {
  it("lets each authored opening finish before permanently claiming recovered execution authority", () => {
    const composition = createFiveResidentRegionComposition();
    const initial = positions(composition);
    const runtime = new FiveResidentCausalLifeRuntime(composition);

    expect(runtime.ownership("resident.janek")).toBe("recovered_life");
    for (const residentId of MOVING_OPENING_RESIDENTS) {
      expect(runtime.ownership(residentId)).toBe("local_opening");
    }

    let guard = 0;
    while (runtime.claimedResidentIds().length < 5 && guard < 1_500) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }

    expect(guard).toBeLessThan(1_500);
    expect(runtime.claimedResidentIds().sort()).toEqual([
      "resident.ida",
      "resident.janek",
      "resident.mira",
      "resident.nela",
      "resident.oren",
    ]);

    const after = positions(composition);
    for (const residentId of MOVING_OPENING_RESIDENTS) {
      expect(after[residentId]).not.toEqual(initial[residentId]);
      expect(composition.runtimes[residentId].publicState().activity.kind).toBe("idle");
      expect(runtime.life(residentId)).not.toBeNull();
      expect(runtime.execution(residentId)).not.toBeNull();
    }

    // Handoff is one-way. With no recovered matter focused, another World window
    // cannot silently resume the old authored controller.
    const frozenAtHandoff = positions(composition);
    for (let step = 0; step < 120; step += 1) runtime.advanceOneWorldTick();
    expect(positions(composition)).toEqual(frozenAtHandoff);
  });
});

function positions(composition: ReturnType<typeof createFiveResidentRegionComposition>) {
  const actors = composition.world.publicSnapshot().actors;
  return Object.fromEntries(
    actors
      .filter((actor) => actor.kind === "resident")
      .map((actor) => [actor.id, { ...actor.position }]),
  ) as Record<FiveResidentId, { x: number; y: number }>;
}
