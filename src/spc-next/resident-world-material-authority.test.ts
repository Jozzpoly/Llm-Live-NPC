import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

function setup(position = { x: 200, y: 200 }) {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
  world.addResident("resident.janek", "Janek", position, { brainIntervalTicks: 99 });
  world.addMaterialObject({
    id: "crate.workshop.01",
    label: "Workshop crate",
    radius: 18,
    location: { kind: "free", position: { x: 240, y: 200 } },
  });

  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:janek:crate",
    tick: 0,
    kind: "authored_commitment",
    summary: "Janek has a continuing matter involving the workshop crate.",
  });
  kernel.openMatter({
    id: "matter.janek.crate",
    originEvidenceId: origin.id,
    semanticCourse: "move the workshop crate",
  });
  kernel.bindRun({
    matterId: "matter.janek.crate",
    taskId: "task.pickup-crate",
    runId: "run.pickup-crate",
  });
  const authority = new ResidentWorldExecutionAuthority("resident.janek", kernel, world);
  return { world, kernel, authority };
}

describe("run-authorized resident material World actions", () => {
  it("lets the exact live run create one factual pickup outcome", () => {
    const { world, authority } = setup();
    const result = authority.act("run.pickup-crate", {
      kind: "material_pickup",
      objectId: "crate.workshop.01",
    });

    expect(result).toMatchObject({
      status: "resolved",
      runId: "run.pickup-crate",
      materialOutcome: {
        status: "succeeded",
        code: "picked_up",
        actorId: "resident.janek",
        objectId: "crate.workshop.01",
        before: { location: { kind: "free", position: { x: 240, y: 200 } } },
        after: { location: { kind: "held", actorId: "resident.janek" } },
      },
    });
    expect(world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "held",
      actorId: "resident.janek",
    });
  });

  it("rejects forged and semantically stale runs before they can mutate material truth", () => {
    const { world, kernel, authority } = setup();

    expect(authority.act("run.forged", {
      kind: "material_pickup",
      objectId: "crate.workshop.01",
    })).toEqual({ status: "rejected", runId: "run.forged", reason: "run_not_authorized" });

    const changed = kernel.recordEvidence({
      id: "evidence:changed",
      tick: 1,
      kind: "new_context",
      summary: "The meaning of the matter changed before pickup.",
    });
    kernel.advanceSemanticContext("matter.janek.crate", changed.id);

    expect(authority.act("run.pickup-crate", {
      kind: "material_pickup",
      objectId: "crate.workshop.01",
    })).toEqual({ status: "rejected", runId: "run.pickup-crate", reason: "run_not_authorized" });
    expect(world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "free",
      position: { x: 240, y: 200 },
    });
  });

  it("returns physical rejection as factual run-scoped action evidence without pretending semantic failure", () => {
    const { world, kernel, authority } = setup({ x: 100, y: 100 });
    const result = authority.act("run.pickup-crate", {
      kind: "material_pickup",
      objectId: "crate.workshop.01",
    });

    expect(result).toMatchObject({
      status: "resolved",
      runId: "run.pickup-crate",
      materialOutcome: { status: "rejected", code: "out_of_range" },
    });
    expect(kernel.canRunMutateWorld("run.pickup-crate")).toBe(true);
    expect(world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "free",
      position: { x: 240, y: 200 },
    });
  });

  it("keeps possession as World truth after the pickup run is factually reconciled and retired", () => {
    const { world, kernel, authority } = setup();
    const pickup = authority.act("run.pickup-crate", {
      kind: "material_pickup",
      objectId: "crate.workshop.01",
    });
    expect(pickup.status).toBe("resolved");
    if (pickup.status !== "resolved") throw new Error("pickup did not resolve");
    expect(pickup.materialOutcome.status).toBe("succeeded");

    const reconciled = kernel.reconcileRunOutcome({
      runId: "run.pickup-crate",
      tick: 1,
      status: "succeeded",
      summary: "World accepted pickup of crate.workshop.01",
    });
    expect(reconciled.status).toBe("recorded");
    expect(kernel.canRunMutateWorld("run.pickup-crate")).toBe(false);
    expect(world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "held",
      actorId: "resident.janek",
    });

    kernel.bindRun({
      matterId: "matter.janek.crate",
      taskId: "task.place-crate",
      runId: "run.place-crate",
    });
    const place = authority.act("run.place-crate", {
      kind: "material_place",
      objectId: "crate.workshop.01",
      position: { x: 250, y: 200 },
    });
    expect(place).toMatchObject({
      status: "resolved",
      runId: "run.place-crate",
      materialOutcome: {
        status: "succeeded",
        code: "placed",
        before: { location: { kind: "held", actorId: "resident.janek" } },
        after: { location: { kind: "free", position: { x: 250, y: 200 } } },
      },
    });
  });

  it("derives resident reach and LOS from authoritative World state rather than action payload", () => {
    const { authority } = setup({ x: 100, y: 100 });
    const action = authority.act("run.pickup-crate", {
      kind: "material_pickup",
      objectId: "crate.workshop.01",
    });
    expect(action).toMatchObject({
      status: "resolved",
      materialOutcome: { status: "rejected", code: "out_of_range" },
    });
    expect(action).not.toHaveProperty("actorPosition");
    expect(action).not.toHaveProperty("lineOfSight");
  });
});
