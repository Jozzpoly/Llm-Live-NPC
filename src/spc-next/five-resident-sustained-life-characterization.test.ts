import { describe, expect, it } from "vitest";
import { createFiveResidentRegionWorld } from "./five-resident-region";

const RESIDENT_IDS = [
  "resident.mira",
  "resident.janek",
  "resident.ida",
  "resident.oren",
  "resident.nela",
] as const;

const AUTHORED_SETTLE_TICK = 900;
const LONG_WINDOW_TICK = 6_000;

describe("five-resident sustained-life characterization", () => {
  it("exposes the current plateau while distinguishing real completion pressure from legitimate idle", () => {
    const world = createFiveResidentRegionWorld();
    world.step(AUTHORED_SETTLE_TICK);

    const settled = residentState(world);
    expect(Object.values(settled).map((entry) => entry.activity.kind))
      .toEqual(["idle", "idle", "idle", "idle", "idle"]);
    for (const entry of Object.values(settled)) {
      expect(entry.velocity).toEqual({ x: 0, y: 0 });
    }

    world.step(LONG_WINDOW_TICK - AUTHORED_SETTLE_TICK);
    expect(world.tick).toBe(LONG_WINDOW_TICK);
    const late = residentState(world);

    // This is characterization, not a definition that stillness is inherently bad.
    // It demonstrates that the baseline installs no second embodied/public chapter:
    // every resident remains on the exact post-authored body/activity plateau.
    for (const residentId of RESIDENT_IDS) {
      expect(late[residentId].position).toEqual(settled[residentId].position);
      expect(late[residentId].velocity).toEqual({ x: 0, y: 0 });
      expect(late[residentId].activity).toEqual(settled[residentId].activity);
    }
    expect(world.diagnostics().recentOccurrences).toEqual([]);
    expect(world.diagnostics().recentMaterialActions).toEqual([]);

    // The plateau is not evidence that the cognition scheduler is empty. Ask the
    // scheduler only after the long observation window so the query cannot influence
    // the preceding World trajectory. Every resident has a ready batch by t6000;
    // residents whose authored travel/investigation completed retain that completion
    // pressure because the baseline has no cognition host consuming it.
    const batches = Object.fromEntries(RESIDENT_IDS.map((residentId) => [
      residentId,
      world.takeCognitionBatch(residentId),
    ])) as Record<(typeof RESIDENT_IDS)[number], ReturnType<typeof world.takeCognitionBatch>>;

    for (const residentId of ["resident.mira", "resident.ida", "resident.oren", "resident.nela"] as const) {
      expect(batches[residentId], `${residentId} should retain factual completion pressure`).not.toBeNull();
      expect(batches[residentId]?.reasons.some((reason) => reason.kind === "activity_completed"), residentId)
        .toBe(true);
      expect(batches[residentId]?.reasons.some((reason) => reason.kind === "quiet_review"), residentId)
        .toBe(false);
    }

    // Janek starts intentionally idle and receives no discrepancy in this specimen.
    // Long passage of time must therefore remain legitimate quiet rather than create
    // a synthetic provider heartbeat.
    expect(batches["resident.janek"]).toBeNull();
  });
});

function residentState(world: ReturnType<typeof createFiveResidentRegionWorld>) {
  const snapshot = world.publicSnapshot();
  return Object.fromEntries(RESIDENT_IDS.map((residentId) => {
    const actor = snapshot.actors.find((candidate) => candidate.id === residentId);
    const resident = snapshot.residents.find((candidate) => candidate.id === residentId);
    if (!actor || !resident) throw new Error(`missing baseline resident: ${residentId}`);
    return [residentId, {
      position: actor.position,
      velocity: actor.velocity,
      activity: resident.activity,
      pendingCognitionReasonCount: resident.pendingCognitionReasonCount,
    }];
  })) as Record<(typeof RESIDENT_IDS)[number], {
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    activity: ReturnType<typeof world.publicSnapshot>["residents"][number]["activity"];
    pendingCognitionReasonCount: number;
  }>;
}
