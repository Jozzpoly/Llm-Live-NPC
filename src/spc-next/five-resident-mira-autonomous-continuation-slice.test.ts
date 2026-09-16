import { describe, expect, it } from "vitest";
import { createFiveResidentMiraAutonomousContinuationSlice } from "./five-resident-mira-autonomous-continuation-slice";

const MIRA_ID = "resident.mira";
const MATTER_ID = "matter.mira.post-walk-continuation";
const RUN_ID = "run.mira.post-walk-continuation.travel";
const WORKSHOP_DESTINATION = { x: 1_950, y: 720 } as const;
const MAX_START_STEPS = 1_200;
const MAX_TRAVEL_STEPS = 1_200;

describe("five-resident Mira post-authored autonomous continuation", () => {
  it("turns real completion pressure into a private-grounded continuing matter and exact body run without replacing legacy activity", () => {
    const slice = createFiveResidentMiraAutonomousContinuationSlice();

    let start = slice.advanceOneWorldTick();
    let startGuard = 1;
    while (start.status !== "continuation_started" && startGuard < MAX_START_STEPS) {
      start = slice.advanceOneWorldTick();
      startGuard += 1;
    }

    expect(startGuard).toBeLessThan(MAX_START_STEPS);
    expect(start.status).toBe("continuation_started");
    if (start.status !== "continuation_started") throw new Error(`continuation did not start: ${start.status}`);

    expect(start.batch.reasons.some((reason) => reason.kind === "activity_completed")).toBe(true);
    expect(start.context.currentRegionId).toBe("hearth");
    expect(start.context.knownRegions.some((region) => region.id === "workshop")).toBe(true);
    expect(start.routeRegionIds).toEqual(["hearth", "workshop"]);
    expect(start.proposal.activityDirective).toMatchObject({
      kind: "replace",
      activity: {
        kind: "travel",
        targetRegionId: "workshop",
      },
    });

    const legacyAtStart = miraPublicActivity(slice);
    expect(legacyAtStart).toMatchObject({
      kind: "idle",
      reason: expect.stringContaining("completed activity:mira:initial"),
    });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: RUN_ID,
    });
    expect(slice.kernel.canRunMutateWorld(RUN_ID)).toBe(true);

    const positionAtContinuationStart = miraPosition(slice);
    const scheduled = slice.miraScheduleDiagnostics();
    expect(scheduled.lastRequestTick).toBe(start.tick);
    expect(scheduled.nextQuietReviewTick).toBeGreaterThan(start.tick);

    let step = slice.advanceOneWorldTick();
    let travelGuard = 1;
    let sawPhysicalMotion = false;
    while (step.status === "traveling" && travelGuard < MAX_TRAVEL_STEPS) {
      // The recovered body path is now authoritative. Legacy activity remains an
      // old projection throughout and must not be rewritten to make the demo move.
      expect(miraPublicActivity(slice)).toEqual(legacyAtStart);
      const actor = miraActor(slice);
      if (Math.hypot(actor.velocity.x, actor.velocity.y) > 0.1) sawPhysicalMotion = true;
      step = slice.advanceOneWorldTick();
      travelGuard += 1;
    }

    expect(travelGuard).toBeLessThan(MAX_TRAVEL_STEPS);
    expect(sawPhysicalMotion).toBe(true);
    expect(step.status).toBe("resolved");
    if (step.status !== "resolved") throw new Error(`continuation did not resolve: ${step.status}`);

    expect(step.local).toMatchObject({
      status: "arrived",
      runId: RUN_ID,
      destination: WORKSHOP_DESTINATION,
    });
    expect(step.reconciliation).toMatchObject({ status: "recorded" });
    expect(slice.reconciliation()).toMatchObject({ status: "recorded" });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "resolved",
      semanticRevision: 1,
      activeRunId: null,
    });
    expect(slice.kernel.canRunMutateWorld(RUN_ID)).toBe(false);
    expect(miraPublicActivity(slice)).toEqual(legacyAtStart);

    const finalPosition = miraPosition(slice);
    expect(finalPosition).not.toEqual(positionAtContinuationStart);
    expect(Math.hypot(
      finalPosition.x - WORKSHOP_DESTINATION.x,
      finalPosition.y - WORKSHOP_DESTINATION.y,
    )).toBeLessThanOrEqual(18);
    expect(slice.world.diagnostics().recentMaterialActions).toEqual([]);
  });
});

function miraActor(slice: ReturnType<typeof createFiveResidentMiraAutonomousContinuationSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return actor;
}

function miraPosition(slice: ReturnType<typeof createFiveResidentMiraAutonomousContinuationSlice>) {
  const actor = miraActor(slice);
  return { ...actor.position };
}

function miraPublicActivity(slice: ReturnType<typeof createFiveResidentMiraAutonomousContinuationSlice>) {
  const resident = slice.world.publicSnapshot().residents.find((candidate) => candidate.id === MIRA_ID);
  if (!resident) throw new Error("Mira public resident missing");
  return structuredClone(resident.activity);
}
