import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

function world(options: { blocked?: boolean; playerX?: number } = {}): SpcWorldRuntime {
  const runtime = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [],
    sightBlockers: options.blocked ? [{
      id: "wall",
      label: "Wall",
      bounds: { minX: 215, minY: 160, maxX: 225, maxY: 240 },
    }] : [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
  runtime.addPlayer("player.jozz", { x: options.playerX ?? 200, y: 200 });
  runtime.addResident("resident.janek", "Janek", { x: 200, y: 260 }, { brainIntervalTicks: 99 });
  runtime.addMaterialObject({
    id: "crate.workshop.01",
    label: "Workshop crate",
    radius: 18,
    location: { kind: "free", position: { x: 240, y: 200 } },
  });
  return runtime;
}

describe("SpcWorldRuntime material J0 authority", () => {
  it("derives pickup reach and LOS from authoritative World state", () => {
    const runtime = world();
    const result = runtime.attemptMaterialAction("player.jozz", {
      kind: "pickup",
      objectId: "crate.workshop.01",
    });

    expect(result).toMatchObject({
      tick: 0,
      actorId: "player.jozz",
      objectId: "crate.workshop.01",
      status: "succeeded",
      code: "picked_up",
      before: { location: { kind: "free", position: { x: 240, y: 200 } } },
      after: { location: { kind: "held", actorId: "player.jozz" } },
    });
    expect(runtime.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "held",
      actorId: "player.jozz",
    });
    expect(runtime.diagnostics().recentMaterialActions.at(-1)).toEqual(result);
  });

  it("rejects a distant actor without allowing the caller to spoof interaction geometry", () => {
    const runtime = world({ playerX: 80 });
    const before = runtime.materialObject("crate.workshop.01");

    const result = runtime.attemptMaterialAction("player.jozz", {
      kind: "pickup",
      objectId: "crate.workshop.01",
    });

    expect(result).toMatchObject({ status: "rejected", code: "out_of_range" });
    expect(runtime.materialObject("crate.workshop.01")).toEqual(before);
  });

  it("uses authored World LOS rather than trusting a caller claim", () => {
    const runtime = world({ blocked: true });
    const before = runtime.materialObject("crate.workshop.01");

    const result = runtime.attemptMaterialAction("player.jozz", {
      kind: "pickup",
      objectId: "crate.workshop.01",
    });

    expect(result).toMatchObject({ status: "rejected", code: "occluded" });
    expect(runtime.materialObject("crate.workshop.01")).toEqual(before);
  });

  it("keeps placement factual and bounded by the actor's authoritative current position", () => {
    const runtime = world();
    expect(runtime.attemptMaterialAction("player.jozz", {
      kind: "pickup",
      objectId: "crate.workshop.01",
    }).status).toBe("succeeded");

    const farPlace = runtime.attemptMaterialAction("player.jozz", {
      kind: "place",
      objectId: "crate.workshop.01",
      position: { x: 500, y: 500 },
    });
    expect(farPlace).toMatchObject({ status: "rejected", code: "out_of_range" });
    expect(runtime.materialObject("crate.workshop.01")?.location).toEqual({ kind: "held", actorId: "player.jozz" });

    const nearPlace = runtime.attemptMaterialAction("player.jozz", {
      kind: "place",
      objectId: "crate.workshop.01",
      position: { x: 250, y: 200 },
    });
    expect(nearPlace).toMatchObject({
      status: "succeeded",
      code: "placed",
      after: { location: { kind: "free", position: { x: 250, y: 200 } } },
    });
  });

  it("does not expose a direct resident material mutation bypass before J1 run authority", () => {
    const runtime = world();

    expect(() => runtime.attemptMaterialAction("resident.janek", {
      kind: "pickup",
      objectId: "crate.workshop.01",
    })).toThrow(/requires recovered execution authority/);

    const kernel = new ResidentContinuityKernel();
    const origin = kernel.recordEvidence({ id: "e:work", tick: 0, kind: "test", summary: "Janek has work" });
    kernel.openMatter({ id: "matter.work", originEvidenceId: origin.id, semanticCourse: "move the crate" });
    kernel.bindRun({ matterId: "matter.work", taskId: "task.move-crate", runId: "run.move-crate" });
    new ResidentWorldExecutionAuthority("resident.janek", kernel, runtime);

    expect(() => runtime.attemptMaterialAction("resident.janek", {
      kind: "pickup",
      objectId: "crate.workshop.01",
    })).toThrow(/requires recovered execution authority/);
    expect(runtime.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "free",
      position: { x: 240, y: 200 },
    });
  });

  it("returns defensive material snapshots instead of mutable World authority", () => {
    const runtime = world();
    const object = runtime.materialObject("crate.workshop.01")!;
    if (object.location.kind === "free") object.location.position.x = 999;
    const list = runtime.materialObjects();
    if (list[0]?.location.kind === "free") list[0].location.position.y = 999;

    expect(runtime.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "free",
      position: { x: 240, y: 200 },
    });
  });
});
