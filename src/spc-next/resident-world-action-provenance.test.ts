import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

function setup(residentPosition = { x: 100, y: 100 }) {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
  world.addResident("resident.janek", "Janek", residentPosition, { brainIntervalTicks: 99 });
  world.addMaterialObject({
    id: "crate.provenance",
    label: "Provenance crate",
    radius: 18,
    location: { kind: "free", position: { x: 240, y: 200 } },
  });

  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:provenance:origin",
    tick: 0,
    kind: "life_context",
    summary: "Janek has a crate matter.",
  });
  kernel.openMatter({
    id: "matter.provenance",
    originEvidenceId: origin.id,
    semanticCourse: "pick up the crate",
  });
  kernel.bindRun({
    matterId: "matter.provenance",
    taskId: "task.provenance",
    runId: "run.provenance",
  });
  const authority = new ResidentWorldExecutionAuthority("resident.janek", kernel, world);
  return { world, kernel, authority };
}

describe("resident World action causal provenance", () => {
  it("joins a successful exact run action to the authoritative World action sequence", () => {
    const { world, authority } = setup({ x: 220, y: 200 });
    const result = authority.act("run.provenance", {
      kind: "material_pickup",
      objectId: "crate.provenance",
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("pickup unexpectedly rejected by authority gate");

    const fact = authority.recentActionFacts().at(-1);
    expect(fact).toMatchObject({
      residentId: "resident.janek",
      runId: "run.provenance",
      tick: result.materialOutcome.tick,
      action: { kind: "material_pickup", objectId: "crate.provenance" },
      resolution: {
        status: "resolved",
        actionSeq: result.materialOutcome.actionSeq,
        outcomeStatus: "succeeded",
        code: "picked_up",
      },
    });
    expect(world.diagnostics().recentMaterialActions.at(-1)?.actionSeq).toBe(result.materialOutcome.actionSeq);
  });

  it("records factual physical rejection without leaking raw material before/after truth", () => {
    const { authority } = setup({ x: 100, y: 100 });
    const result = authority.act("run.provenance", {
      kind: "material_pickup",
      objectId: "crate.provenance",
    });
    expect(result).toMatchObject({
      status: "resolved",
      materialOutcome: { status: "rejected", code: "out_of_range", before: null, after: null },
    });

    const fact = authority.recentActionFacts().at(-1);
    expect(fact).toMatchObject({
      runId: "run.provenance",
      resolution: { status: "resolved", outcomeStatus: "rejected", code: "out_of_range" },
    });
    expect(fact).not.toHaveProperty("materialOutcome");
    expect(fact).not.toHaveProperty("before");
    expect(fact).not.toHaveProperty("after");
    expect(JSON.stringify(fact)).not.toContain('"location"');
  });

  it("records an authority-gate rejection without manufacturing a World material action", () => {
    const { world, authority } = setup({ x: 220, y: 200 });
    expect(authority.act("run.forged", {
      kind: "material_pickup",
      objectId: "crate.provenance",
    })).toEqual({ status: "rejected", runId: "run.forged", reason: "run_not_authorized" });

    expect(world.diagnostics().recentMaterialActions).toEqual([]);
    expect(authority.recentActionFacts().at(-1)).toMatchObject({
      runId: "run.forged",
      resolution: { status: "rejected", reason: "run_not_authorized" },
    });
  });

  it("returns defensive provenance snapshots", () => {
    const { authority } = setup({ x: 220, y: 200 });
    authority.act("run.provenance", { kind: "material_pickup", objectId: "crate.provenance" });
    const first = authority.recentActionFacts();
    first[0]!.runId = "forged.run";
    expect(authority.recentActionFacts()[0]!.runId).toBe("run.provenance");
  });
});
