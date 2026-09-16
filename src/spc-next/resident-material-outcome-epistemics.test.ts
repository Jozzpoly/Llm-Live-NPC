import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

describe("resident material outcome epistemic membrane", () => {
  it("keeps hidden holder identity in World diagnostics while rejecting it from resident-facing outcome", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 600, maxY: 600 },
      regions: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    world.addResident("resident.janek", "Janek", { x: 200, y: 200 }, { brainIntervalTicks: 99 });
    world.addPlayer("player.helper", { x: 240, y: 200 });
    world.addMaterialObject({
      id: "crate.workshop.01",
      label: "Workshop crate",
      radius: 16,
      location: { kind: "free", position: { x: 240, y: 200 } },
    });

    expect(world.attemptMaterialAction("player.helper", {
      kind: "pickup",
      objectId: "crate.workshop.01",
    })).toMatchObject({ status: "succeeded", code: "picked_up" });

    const kernel = new ResidentContinuityKernel();
    const origin = kernel.recordEvidence({
      id: "evidence:janek:crate",
      tick: 0,
      kind: "life_context",
      summary: "Janek expects the workshop crate nearby.",
    });
    kernel.openMatter({
      id: "matter.janek.crate",
      originEvidenceId: origin.id,
      semanticCourse: "pick up the workshop crate",
    });
    kernel.bindRun({
      matterId: "matter.janek.crate",
      taskId: "task.pickup",
      runId: "run.pickup",
    });
    const authority = new ResidentWorldExecutionAuthority("resident.janek", kernel, world);

    const residentResult = authority.act("run.pickup", {
      kind: "material_pickup",
      objectId: "crate.workshop.01",
    });
    expect(residentResult).toMatchObject({
      status: "resolved",
      materialOutcome: {
        status: "rejected",
        code: "object_unavailable",
        before: null,
        after: null,
      },
    });

    const raw = world.diagnostics().recentMaterialActions.at(-1);
    expect(raw).toMatchObject({
      status: "rejected",
      code: "object_unavailable",
      before: { location: { kind: "held", actorId: "player.helper" } },
      after: { location: { kind: "held", actorId: "player.helper" } },
    });
  });
});
