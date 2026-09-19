import { describe, expect, it } from "vitest";
import {
  createFiveResidentMiraSustainedLifeSlice,
  type MiraSustainedLifeStep,
} from "./five-resident-mira-sustained-life-slice";

const MIRA_ID = "resident.mira";
const RUN_1 = "run.mira.sustained.1.workshop";
const RUN_2 = "run.mira.sustained.2.hearth";
const MATTER_1 = "matter.mira.sustained.1.workshop";
const MATTER_2 = "matter.mira.sustained.2.hearth";
const HEARTH_DESTINATION = { x: 780, y: 720 } as const;
const MAX_STEPS = 3_000;

describe("five-resident Mira sustained-life architecture pressure", () => {
  it("closes two cognition -> matter -> exact-run -> factual-outcome chapters on one persistent resident substrate", () => {
    const slice = createFiveResidentMiraSustainedLifeSlice();
    const started: Extract<MiraSustainedLifeStep, { status: "chapter_started" }>[] = [];
    const resolved: Extract<MiraSustainedLifeStep, { status: "chapter_resolved" }>[] = [];
    let legacyAfterOpening: ReturnType<typeof miraPublicActivity> | null = null;

    let guard = 0;
    while (resolved.length < 2 && guard < MAX_STEPS) {
      const step = slice.advanceOneWorldTick();
      guard += 1;

      if (step.status === "chapter_started") {
        started.push(step);
        if (!legacyAfterOpening) legacyAfterOpening = miraPublicActivity(slice);
      }
      if (step.status === "chapter_resolved") resolved.push(step);

      if (legacyAfterOpening) {
        // Once the authored opening ends, both autonomous chapters must use the
        // recovered exact-run path. A hidden legacy activity rewrite would make
        // this repeated-life specimen a demo illusion rather than a continuity test.
        expect(miraPublicActivity(slice)).toEqual(legacyAfterOpening);
      }
    }

    expect(guard).toBeLessThan(MAX_STEPS);
    expect(started).toHaveLength(2);
    expect(resolved).toHaveLength(2);
    expect(slice.phase()).toBe("completed");

    const first = started[0]!;
    const second = started[1]!;
    expect(first).toMatchObject({
      chapter: 1,
      matterId: MATTER_1,
      runId: RUN_1,
      routeRegionIds: ["hearth", "workshop"],
      context: { currentRegionId: "hearth" },
    });
    expect(first.batch.reasons.some((reason) => reason.kind === "activity_completed")).toBe(true);

    expect(second).toMatchObject({
      chapter: 2,
      matterId: MATTER_2,
      runId: RUN_2,
      routeRegionIds: ["workshop", "hearth"],
      context: { currentRegionId: "workshop" },
    });
    expect(second.tick).toBeGreaterThan(resolved[0]!.tick);
    expect(second.batch.reasons.some((reason) => (
      reason.kind === "activity_completed"
      && reason.summary.includes("Factual run outcome requires resident interpretation")
    ))).toBe(true);
    expect(second.batch.reasons.some((reason) => reason.kind === "quiet_review")).toBe(false);

    expect(resolved.map((entry) => entry.chapter)).toEqual([1, 2]);
    expect(slice.kernel.matter(MATTER_1)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      semanticRevision: 1,
    });
    expect(slice.kernel.matter(MATTER_2)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      semanticRevision: 1,
    });
    expect(slice.kernel.runBinding(RUN_1)).toBeNull();
    expect(slice.kernel.runBinding(RUN_2)).toBeNull();
    expect(slice.executionFocus.focusedRun()).toBeNull();

    expect(legacyAfterOpening).toMatchObject({
      kind: "idle",
      reason: expect.stringContaining("completed activity:mira:initial"),
    });
    const final = miraPosition(slice);
    expect(Math.hypot(
      final.x - HEARTH_DESTINATION.x,
      final.y - HEARTH_DESTINATION.y,
    )).toBeLessThanOrEqual(18);
    expect(slice.world.diagnostics().recentMaterialActions).toEqual([]);
  });
});

function miraPosition(slice: ReturnType<typeof createFiveResidentMiraSustainedLifeSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return { ...actor.position };
}

function miraPublicActivity(slice: ReturnType<typeof createFiveResidentMiraSustainedLifeSlice>) {
  const resident = slice.world.publicSnapshot().residents.find((candidate) => candidate.id === MIRA_ID);
  if (!resident) throw new Error("Mira public resident missing");
  return structuredClone(resident.activity);
}
