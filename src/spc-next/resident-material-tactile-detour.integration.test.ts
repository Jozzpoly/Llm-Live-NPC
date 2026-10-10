import { describe, expect, it } from "vitest";
import { createFiveResidentRegionWorld } from "./five-resident-region";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const RESIDENT = "resident.janek";
const RUN = "run.janek.tactile-route";
const MATTER = "matter.janek.tactile-route";
const CRATE = "crate.workshop.01";

function fixture(destination: { x: number; y: number }, optIn = true) {
  const world = createFiveResidentRegionWorld({ materialBodyCollision: optIn });
  const kernel = new ResidentContinuityKernel();
  kernel.recordEvidence({
    id: "evidence.janek.test-assigned-travel",
    tick: world.tick,
    kind: "life_context",
    summary: "Test-assigned destination; NOT autonomous intent.",
  });
  kernel.openMatter({
    id: MATTER,
    originEvidenceId: "evidence.janek.test-assigned-travel",
    semanticCourse: "mechanical touch navigation experiment only",
  });
  kernel.bindRun({ matterId: MATTER, taskId: "task.janek.test-route", runId: RUN });
  const authority = new ResidentWorldExecutionAuthority(RESIDENT, kernel, world);
  const executor = new ResidentGroundedTravelExecutor(RUN, destination, authority, world);
  const position = () => world.publicSnapshot().actors.find((a) => a.id === RESIDENT)!.position;
  return { world, kernel, authority, executor, position };
}

describe("run-authorized tactile material detours without fictitious NPC cognition", () => {
  it("goes around an actually contacted crate and reaches the SAME authorized destination", () => {
    const { world, kernel, authority, executor, position } = fixture({ x: 2_080, y: 720 });
    expect(authority.touchedMaterial(RUN)).toBeNull();
    expect(world.residentRunTouchedMaterial(RESIDENT, "run.unknown")).toBeNull();
    let result = executor.step();
    let leftStraight = false;
    let maxDeviation = 0;
    let contacts = 0;
    for (let i = 0; i < 450 && result.status === "running"; i += 1) {
      world.step();
      const current = position();
      maxDeviation = Math.max(maxDeviation, Math.abs(current.y - 720));
      if (maxDeviation > 12) leftStraight = true;
      const physical = authority.lastMotionOutcome();
      if (physical?.outcome.constraints.includes("material_object")) contacts += 1;
      result = executor.step();
    }
    expect(contacts).toBeGreaterThan(0);
    expect(leftStraight).toBe(true);
    expect(maxDeviation).toBeGreaterThan(38);
    expect(result).toMatchObject({ status: "arrived", runId: RUN, destination: { x: 2_080, y: 720 } });
    expect(Math.hypot(position().x - 2_080, position().y - 720)).toBeLessThanOrEqual(18);
    expect(world.materialObject(CRATE)?.location).toEqual({
      kind: "free", position: { x: 1_952, y: 720 },
    });
    expect(kernel.matter(MATTER)?.semanticCourse).toBe("mechanical touch navigation experiment only");
    expect(kernel.runBinding(RUN)?.matterId).toBe(MATTER);
    console.info("SPC_TACTILE_DETOUR_MECHANIC_ONLY", JSON.stringify({
      ticks: world.tick, maxDeviation, contacts, resultStatus: result.status,
      providerCalls: 0, spontaneousMatters: 0,
    }));
  });

  it("retries the same run when player removes the obstacle between physical contact and local response", () => {
    const { world, authority, executor, position } = fixture({ x: 2_080, y: 720 });
    world.addPlayer("player.local-clearer", { x: 2_004, y: 720 });
    let result = executor.step();
    let contacted = false;
    for (let i = 0; i < 150 && result.status === "running"; i += 1) {
      world.step();
      if (authority.lastMotionOutcome()?.outcome.constraints.includes("material_object")) {
        contacted = true;
        break;
      }
      result = executor.step();
    }
    expect(contacted).toBe(true);
    expect(authority.touchedMaterial(RUN)).toMatchObject({
      position: { x: 1_952, y: 720 }, radius: 18,
    });
    // Between World collision and the next resident motor frame, a participant
    // actually picks up the contacting object under the ordinary World rules.
    expect(world.attemptMaterialAction("player.local-clearer", {
      kind: "pickup", objectId: CRATE,
    })).toMatchObject({ status: "succeeded", code: "picked_up" });
    expect(authority.touchedMaterial(RUN)).toBeNull();
    result = executor.step();
    expect(result.status).toBe("running");
    for (let i = 0; i < 180 && result.status === "running"; i += 1) {
      world.step();
      result = executor.step();
    }
    expect(result.status).toBe("arrived");
    expect(position().x).toBeGreaterThan(2_050);
    expect(world.materialObject(CRATE)?.location).toEqual({
      kind: "held", actorId: "player.local-clearer",
    });
  });

  it("responds to a crate that the player physically puts INTO an already running route", () => {
    const { world, executor, position } = fixture({ x: 2_080, y: 720 });
    const mover = "player.route-change";
    world.addPlayer(mover, { x: 2_008, y: 720 });
    expect(world.attemptMaterialAction(mover, {
      kind: "pickup", objectId: CRATE,
    })).toMatchObject({ status: "succeeded", code: "picked_up" });
    let result = executor.step();
    expect(result.status).toBe("running");
    for (let i = 0; i < 7; i += 1) {
      world.step();
      result = executor.step();
    }
    expect(position().x).toBeGreaterThan(1_909);
    expect(position().x).toBeLessThan(1_915);
    expect(world.attemptMaterialAction(mover, {
      kind: "place", objectId: CRATE,
      position: { x: 1_952, y: 720 },
    })).toMatchObject({ status: "succeeded", code: "placed" });

    let deviation = 0, contacted = false;
    for (let i = 0; i < 450 && result.status === "running"; i += 1) {
      world.step();
      deviation = Math.max(deviation, Math.abs(position().y - 720));
      if (world.diagnostics().lastMotionOutcomes.some((o) =>
        o.actorId === RESIDENT && o.constraints.includes("material_object"))) contacted = true;
      result = executor.step();
    }
    expect(contacted).toBe(true);
    expect(deviation).toBeGreaterThan(38);
    expect(result).toMatchObject({ status: "arrived", runId: RUN });
    expect(world.diagnostics().recentMaterialActions.filter((a) =>
      a.actorId === mover && a.status === "succeeded").map((a) => a.code))
      .toEqual(["picked_up", "placed"]);
    expect(world.materialObject(CRATE)?.location)
      .toEqual({ kind: "free", position: { x: 1_952, y: 720 } });
  });

  it("does not mistake a finished contact bypass for a permanent deadline on distant travel", () => {
    const { world, executor, position } = fixture({ x: 2_850, y: 720 });
    let result = executor.step();
    for (let i = 0; i < 850 && result.status === "running"; i += 1) {
      world.step();
      result = executor.step();
    }
    expect(world.tick).toBeGreaterThan(360);
    expect(result).toMatchObject({ status: "arrived", destination: { x: 2_850, y: 720 } });
    expect(position().x).toBeGreaterThan(2_830);
  });

  it("cannot continue its local detour after the resident's exact run is revoked", () => {
    const { world, kernel, authority, executor, position } = fixture({ x: 2_080, y: 720 });
    let result = executor.step();
    let bypassAttempted = false;
    for (let i = 0; i < 150 && result.status === "running"; i += 1) {
      world.step();
      const physical = authority.lastMotionOutcome();
      result = executor.step();
      if (physical?.outcome.constraints.includes("material_object")) {
        bypassAttempted = true;
        break;
      }
    }
    expect(bypassAttempted).toBe(true);
    expect(result.status).toBe("running");
    const before = position();
    kernel.recordEvidence({
      id: "evidence.janek.local-detour-revoked",
      tick: world.tick,
      kind: "direct_world_change",
      summary: "Test: previous run's authority is no longer valid.",
    });
    kernel.advanceSemanticContext(MATTER, "evidence.janek.local-detour-revoked");
    expect(kernel.canRunMutateWorld(RUN)).toBe(false);
    expect(executor.step()).toEqual({ status: "authority_lost", runId: RUN });
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: RUN });
    world.step();
    expect(position()).toEqual(before);
  });

  it("declines to invent passage when the actual target is inside the obstruction", () => {
    const { world, authority, executor } = fixture({ x: 1_952, y: 720 });
    let result = executor.step();
    for (let i = 0; i < 140 && result.status === "running"; i += 1) {
      world.step();
      result = executor.step();
    }
    expect(result).toMatchObject({ status: "blocked", constraints: ["material_object"] });
    expect(authority.touchedMaterial("run.someone-else")).toBeNull();
    expect(world.materialObject(CRATE)?.location.kind).toBe("free");
  });

  it("preserves the original no-detour physical-block outcome if mode was not enabled", () => {
    const { world, executor } = fixture({ x: 2_080, y: 720 }, false);
    const initial = executor.step();
    expect(initial.status).toBe("running");
    for (let i = 0; i < 160; i += 1) world.step();
    // Without opt-in body collision the ordinary run goes straight through,
    // preserving the preexisting R6 movement behavior.
    let result = executor.step();
    expect(result.status).not.toBe("blocked");
    for (let i = 0; i < 200 && result.status === "running"; i += 1) {
      world.step();
      result = executor.step();
    }
    expect(result.status).toBe("arrived");
  });
});
