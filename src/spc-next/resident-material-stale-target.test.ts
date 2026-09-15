import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

describe("resident material stale-target causality", () => {
  it("walks to the last-known position, physically inspects it, and fails honestly without probing hidden truth", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
      regions: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 30,
    });
    world.addResident("resident.janek", "Janek", { x: 100, y: 100 }, { maxSpeed: 120, brainIntervalTicks: 99 });
    world.addPlayer("player.helper", { x: 300, y: 100 }, { maxSpeed: 180 });
    world.addMaterialObject({
      id: "crate.workshop.01",
      label: "Workshop crate",
      radius: 16,
      location: { kind: "free", position: { x: 300, y: 100 } },
    });

    const knowledge = new ResidentMaterialKnowledge("resident.janek", ["crate.workshop.01"], world);
    knowledge.sample();
    expect(knowledge.lastKnownPosition("crate.workshop.01")).toEqual({ x: 300, y: 100 });

    expect(world.attemptMaterialAction("player.helper", {
      kind: "pickup",
      objectId: "crate.workshop.01",
    })).toMatchObject({ status: "succeeded", code: "picked_up" });
    world.setActorMotionIntent("player.helper", { x: 180, y: 0 });
    world.step(100);
    world.setActorMotionIntent("player.helper", { x: 0, y: 0 });
    const helper = world.publicSnapshot().actors.find((actor) => actor.id === "player.helper")!;
    expect(world.attemptMaterialAction("player.helper", {
      kind: "place",
      objectId: "crate.workshop.01",
      position: helper.position,
    })).toMatchObject({ status: "succeeded", code: "placed" });
    knowledge.sample();
    expect(knowledge.observation("crate.workshop.01")).toMatchObject({
      lastKnownPosition: { x: 300, y: 100 },
      currentlyVisible: false,
    });

    const kernel = new ResidentContinuityKernel();
    const origin = kernel.recordEvidence({
      id: "evidence:janek:expected-crate",
      tick: world.tick,
      kind: "life_context",
      summary: "Janek expects the workshop crate at the last place he saw it.",
    });
    kernel.openMatter({
      id: "matter.janek.find-crate",
      originEvidenceId: origin.id,
      semanticCourse: "go to the last-known crate position and pick it up",
    });
    kernel.bindRun({
      matterId: "matter.janek.find-crate",
      taskId: "task.janek.pickup-last-known-crate",
      runId: "run.janek.pickup-last-known-crate",
    });
    const authority = new ResidentWorldExecutionAuthority("resident.janek", kernel, world);
    const executor = new ResidentMaterialPickupExecutor(
      "run.janek.pickup-last-known-crate",
      "crate.workshop.01",
      knowledge,
      authority,
      world,
    );

    let state = executor.step();
    let guard = 0;
    let sawInspect = state.status === "running" && state.phase === "inspect";
    while (state.status === "running" && guard < 240) {
      world.step();
      knowledge.sample();
      state = executor.step();
      sawInspect ||= state.status === "running" && state.phase === "inspect";
      guard += 1;
    }

    expect(guard).toBeLessThan(240);
    expect(sawInspect).toBe(true);
    expect(state.status).toBe("blocked");
    if (state.status !== "blocked") throw new Error(`unexpected state: ${state.status}`);
    expect(state.reason).toContain("bounded local inspection");
    expect(state.materialOutcome).toBeNull();
    expect(authority.recentActionFacts()).toEqual([]);

    const janek = world.publicSnapshot().actors.find((actor) => actor.id === "resident.janek")!;
    expect(janek.position.x).toBeLessThan(360);
    expect(knowledge.lastKnownPosition("crate.workshop.01")).toEqual({ x: 300, y: 100 });
    expect(world.materialObject("crate.workshop.01")?.location).toMatchObject({
      kind: "free",
      position: helper.position,
    });
    expect(kernel.matter("matter.janek.find-crate")).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: "run.janek.pickup-last-known-crate",
    });
    expect(kernel.canRunMutateWorld("run.janek.pickup-last-known-crate")).toBe(true);
  });
});
