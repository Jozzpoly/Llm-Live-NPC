import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

function setup() {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    regions: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 30,
  });
  world.addResident("resident.janek", "Janek", { x: 100, y: 100 }, { maxSpeed: 120, brainIntervalTicks: 99 });
  world.addMaterialObject({
    id: "crate.workshop.01",
    label: "Workshop crate",
    radius: 16,
    location: { kind: "free", position: { x: 300, y: 100 } },
  });
  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({ id: "evidence:work", tick: 0, kind: "life_context", summary: "Janek has workshop work." });
  kernel.openMatter({ id: "matter.work", originEvidenceId: origin.id, semanticCourse: "pick up the workshop crate" });
  kernel.bindRun({ matterId: "matter.work", taskId: "task.pickup", runId: "run.pickup" });
  const authority = new ResidentWorldExecutionAuthority("resident.janek", kernel, world);
  const executor = new ResidentMaterialPickupExecutor("run.pickup", "crate.workshop.01", authority, world);
  return { world, kernel, authority, executor };
}

describe("ResidentMaterialPickupExecutor J1b", () => {
  it("approaches in World, performs authorized pickup, and exposes a factual outcome for reconciliation", () => {
    const { world, kernel, executor } = setup();
    let state = executor.step();
    let guard = 0;
    while (state.status === "running" && guard < 120) {
      world.step();
      state = executor.step();
      guard += 1;
    }
    expect(guard).toBeGreaterThan(0);
    expect(state.status).toBe("succeeded");
    if (state.status !== "succeeded") throw new Error(`unexpected state: ${state.status}`);
    expect(state.materialOutcome).toMatchObject({ status: "succeeded", code: "picked_up", actorId: "resident.janek" });
    expect(world.materialObject("crate.workshop.01")?.location).toEqual({ kind: "held", actorId: "resident.janek" });

    const reconciled = kernel.reconcileRunOutcome({
      runId: state.runId,
      tick: state.materialOutcome.tick,
      status: "succeeded",
      summary: `picked up ${state.materialOutcome.objectId}`,
    });
    expect(reconciled.status).toBe("recorded");
    expect(kernel.matter("matter.work")?.activeRunId).toBeNull();
    world.step(5);
    expect(world.materialObject("crate.workshop.01")?.location).toEqual({ kind: "held", actorId: "resident.janek" });
  });

  it("stops cleanly when run authority is lost before pickup", () => {
    const { world, kernel, authority, executor } = setup();
    expect(executor.step()).toMatchObject({ status: "running", phase: "approach" });
    world.step(3);
    const interrupt = kernel.recordEvidence({ id: "evidence:interrupt", tick: world.tick, kind: "world_change", summary: "Janek must handle another matter." });
    kernel.openMatter({ id: "matter.interrupt", originEvidenceId: interrupt.id, semanticCourse: "handle the interruption" });
    kernel.suspendMatter("matter.work", "matter.interrupt");

    const before = world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek")!.position.x;
    expect(executor.step()).toEqual({ status: "authority_lost", runId: "run.pickup" });
    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: "run.pickup" });
    world.step(10);
    const after = world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek")!.position.x;
    expect(after).toBe(before);
    expect(world.materialObject("crate.workshop.01")?.location).toMatchObject({ kind: "free" });
  });
});
