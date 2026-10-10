import { describe, expect, it } from "vitest";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { createFiveResidentRegionComposition } from "./five-resident-region";

const JAN = "resident.janek";

function createRun(targetRegionId: "crossroads" | "workshop") {
  const composition = createFiveResidentRegionComposition({ materialBodyCollision: true });
  const runtime = new FiveResidentCausalLifeRuntime(composition);
  const life = runtime.life(JAN);
  if (!life) throw new Error("Janek recovered-life absent");
  const matterId = `matter.janek.assigned-${targetRegionId}-test`;
  const runId = `run.janek.assigned-${targetRegionId}-test`;
  life.kernel.recordEvidence({
    id: `evidence.janek.authored-${targetRegionId}-mechanical-stimulus`,
    tick: composition.world.tick,
    kind: "life_context",
    summary: "Explicit test-assigned destination, not a provider choice, autonomous NPC goal or generated work.",
  });
  life.kernel.openMatter({
    id: matterId,
    originEvidenceId: `evidence.janek.authored-${targetRegionId}-mechanical-stimulus`,
    semanticCourse: "test-only bounded resident material-navigation validation",
    semanticIntent: {
      kind: "travel_region",
      goal: "test whether physical World topology permits arrival",
      targetRegionId,
    },
  });
  life.matterScope.track(matterId);
  life.kernel.bindRun({ matterId, runId, taskId: `task.janek.assigned-${targetRegionId}-test` });
  expect(life.arbitrator.request(runId)).toMatchObject({ status: "acquired" });
  return { composition, runtime, life, matterId, runId };
}

describe("real five-resident R6 causal-life travel with material geometry enabled", () => {
  it("keeps a non-model-issued crossroads matter authorized through a factual detour and outcome reconciliation", () => {
    const { composition, runtime, life, matterId, runId } = createRun("crossroads");
    let terminal: "completed" | "blocked" | null = null;
    let contacts = 0, deviation = 0;
    for (let i = 0; i < 1_700 && !terminal; i += 1) {
      const tick = runtime.advanceOneWorldTick();
      const state = tick.execution[JAN];
      if (state?.status === "completed" || state?.status === "blocked") terminal = state.status;
      const body = composition.world.publicSnapshot().actors.find((a) => a.id === JAN)!;
      const outcome = composition.world.diagnostics().lastMotionOutcomes
        .find((motion) => motion.actorId === JAN);
      if (outcome?.constraints.includes("material_object")) contacts += 1;
      deviation = Math.max(deviation, Math.abs(body.position.y - 720));
    }
    expect(contacts).toBeGreaterThan(0);
    expect(deviation).toBeGreaterThan(38);
    expect(terminal).toBe("completed");
    expect(life.kernel.matter(matterId)).toMatchObject({
      status: "resolved", activeRunId: null,
      lastOutcomeEvidenceId: expect.any(String),
    });
    expect(life.kernel.runBinding(runId)).toBeNull();
    expect(life.focus.focusedRun()).toBeNull();
    const janek = composition.world.publicSnapshot().actors.find((a) => a.id === JAN)!;
    expect(Math.hypot(janek.position.x - 3_200, janek.position.y - 920))
      .toBeLessThanOrEqual(18);
    expect(composition.world.materialObject("crate.workshop.01")?.location)
      .toEqual({ kind: "free", position: { x: 1_952, y: 720 } });
    // No synthetic cognition, no others' fake work, no upstream calls.
    expect(runtime.life("resident.mira")?.currentLifeView().matters).toEqual([]);
    console.info("SPC_FIVE_RESIDENT_CAUSAL_MATERIAL_ROUTE", JSON.stringify({
      worldTick: composition.world.tick,
      physicalContacts: contacts,
      status: terminal,
      resolvedMatter: matterId,
      actualModelCalls: 0,
      testAssignedOrigin: true,
    }));
  });

  it("reports a genuinely blocked matter if the player moves a crate onto the physical workshop landing", () => {
    const { composition, runtime, life, matterId } = createRun("workshop");
    const world = composition.world;
    const mover = "player.workshop-placer";
    world.addPlayer(mover, { x: 1_952, y: 760 });
    expect(world.attemptMaterialAction(mover, {
      kind: "pickup", objectId: "crate.workshop.01",
    })).toMatchObject({ status: "succeeded", code: "picked_up" });
    expect(world.attemptMaterialAction(mover, {
      kind: "place", objectId: "crate.workshop.01", position: { x: 1_900, y: 760 },
    })).toMatchObject({ status: "succeeded", code: "placed" });
    let terminal: "blocked" | "completed" | null = null;
    for (let i = 0; i < 240 && terminal === null; i += 1) {
      const result = runtime.advanceOneWorldTick().execution[JAN];
      if (result?.status === "completed" || result?.status === "blocked") terminal = result.status;
    }
    expect(terminal).toBe("blocked");
    expect(life.kernel.matter(matterId)).toMatchObject({ status: "active" });
    expect(world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "free", position: { x: 1_900, y: 760 },
    });
  });

  it("uses a reachable physical workshop landing point and resolves the existing R6 matter honestly", () => {
    const { composition, runtime, life, matterId } = createRun("workshop");
    let terminal: string | null = null;
    for (let i = 0; i < 240 && !terminal; i += 1) {
      const state = runtime.advanceOneWorldTick().execution[JAN];
      if (state?.status === "completed" || state?.status === "blocked") terminal = state.status;
    }
    expect(terminal).toBe("completed");
    expect(life.kernel.matter(matterId)).toMatchObject({ status: "resolved" });
    const janek = composition.world.publicSnapshot().actors.find((a) => a.id === JAN)!;
    expect(Math.hypot(janek.position.x - 1_900, janek.position.y - 760)).toBeLessThanOrEqual(18);
    expect(composition.world.materialObject("crate.workshop.01")?.location.kind).toBe("free");
  });
});
