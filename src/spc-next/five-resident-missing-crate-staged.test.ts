import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateStagedSlice } from "./five-resident-missing-crate-slice";

const CRATE_ID = "crate.workshop.01";
const MATTER_ID = "matter.janek.missing-crate";
const RELOCATOR_ID = "player.relocator";
const RESIDENT_IDS = [
  "resident.mira",
  "resident.janek",
  "resident.ida",
  "resident.oren",
  "resident.nela",
] as const;

describe("staged missing-crate causal boundary", () => {
  it("keeps legally acquired history stable until an explicit hidden World relocation", () => {
    const slice = createFiveResidentJanekMissingCrateStagedSlice();
    const beforeTick = slice.world.tick;
    const beforeCrate = slice.world.materialObject(CRATE_ID);
    const beforeKnowledge = slice.materialKnowledge.snapshot();

    expect(beforeCrate?.location.kind).toBe("free");
    expect(beforeKnowledge).toEqual([{
      objectId: CRATE_ID,
      lastKnownPosition: { x: 1_952, y: 720 },
      observedAtTick: 0,
      currentlyVisible: false,
    }]);
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: "run.janek.pickup-last-known-crate",
    });
    expect(slice.hiddenRelocationApplied()).toBe(false);
    expect(() => slice.stepJanek()).toThrow(/relocation must be applied/);

    const relocation = slice.relocateCrateHidden();
    const afterCrate = slice.world.materialObject(CRATE_ID);

    expect(relocation.tickBefore).toBe(beforeTick);
    expect(relocation.tickAfter).toBe(beforeTick + 1);
    expect(relocation.from).toEqual({ x: 1_952, y: 720 });
    expect(relocation.to).not.toEqual(relocation.from);
    expect(afterCrate).toMatchObject({
      location: { kind: "free", position: relocation.to },
    });
    expect(slice.materialKnowledge.snapshot()).toEqual(beforeKnowledge);
    for (const residentId of RESIDENT_IDS) {
      expect(
        slice.world.residentDiagnostics(residentId).recentPercepts
          .some((percept) => percept.actorId === RELOCATOR_ID),
        `${residentId} must not acquire the research relocator as resident experience`,
      ).toBe(false);
    }
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: "run.janek.pickup-last-known-crate",
    });
    expect(slice.hiddenRelocationApplied()).toBe(true);
    expect(() => slice.relocateCrateHidden()).toThrow(/already applied/);

    const firstResidentStep = slice.stepJanek();
    expect(firstResidentStep).toMatchObject({
      status: "running",
      local: {
        status: "running",
        phase: "approach",
        runId: "run.janek.pickup-last-known-crate",
      },
    });
    expect(slice.materialKnowledge.lastKnownPosition(CRATE_ID)).toEqual({ x: 1_952, y: 720 });
    expect(slice.world.materialObject(CRATE_ID)).toEqual(afterCrate);
  });
});