import { describe, expect, it } from "vitest";
import { createFiveResidentRegionWorld, FIVE_RESIDENT_REGIONS, FIVE_RESIDENT_ROLE_PRESSURES } from "./five-resident-region";

describe("five-resident living-region specimen", () => {
  it("starts as a geographically distributed six-actor world with five independent SPC roles", () => {
    const world = createFiveResidentRegionWorld();
    const snapshot = world.publicSnapshot();

    expect(snapshot.actors).toHaveLength(6);
    expect(snapshot.residents).toHaveLength(5);
    expect(FIVE_RESIDENT_ROLE_PRESSURES).toHaveLength(5);
    expect(FIVE_RESIDENT_REGIONS.length).toBeGreaterThanOrEqual(7);

    const xPositions = snapshot.actors
      .filter((actor) => actor.kind === "resident")
      .map((actor) => actor.position.x);
    expect(Math.max(...xPositions) - Math.min(...xPositions)).toBeGreaterThan(5_000);
  });

  it("survives a long idle-heavy interval with bounded private memory and one authoritative clock", () => {
    const world = createFiveResidentRegionWorld();
    world.step(6_000);

    expect(world.tick).toBe(6_000);
    const snapshot = world.publicSnapshot();
    expect(snapshot.actors).toHaveLength(6);

    for (const resident of snapshot.residents) {
      const diagnostics = world.residentDiagnostics(resident.id);
      expect(diagnostics.recentPercepts.length).toBeLessThanOrEqual(128);
      expect(diagnostics.trace.length).toBeLessThanOrEqual(256);
    }

    const nela = snapshot.actors.find((actor) => actor.id === "resident.nela")!;
    expect(nela.position.x).toBeGreaterThan(7_000);
    expect(world.regionAt(nela.position)?.id).toBe("ruins");
  });

  it("characterizes the current specimen honestly: initial authored activities collapse to idle within 15 seconds", () => {
    const world = createFiveResidentRegionWorld();
    world.step(900);

    expect(world.publicSnapshot().residents.map((resident) => resident.activity.kind))
      .toEqual(["idle", "idle", "idle", "idle", "idle"]);
  });

  it("does not synchronize quiet cognition deadlines across all five residents through a global scheduler", () => {
    const world = createFiveResidentRegionWorld();
    world.step(1_799);
    const before = world.publicSnapshot().residents.map((resident) => world.takeCognitionBatch(resident.id));

    // Some residents may have activity/sight reasons, but there is no forced all-resident quiet batch yet.
    expect(before.filter((batch) => batch?.reasons.some((reason) => reason.kind === "quiet_review"))).toHaveLength(0);

    world.step(1);
    const atDeadline = world.publicSnapshot().residents.map((resident) => world.takeCognitionBatch(resident.id));
    expect(atDeadline.filter((batch) => batch?.reasons.some((reason) => reason.kind === "quiet_review")).length)
      .toBeLessThanOrEqual(5);
  });
});
