import { describe, expect, it } from "vitest";
import { SpcWorldRuntime } from "./spc-world-runtime";

function world(fixedDeltaSeconds = 1): SpcWorldRuntime {
  return new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
    chunkSize: 64,
    fixedDeltaSeconds,
  });
}

function blockedReasons(runtime: SpcWorldRuntime) {
  return runtime.residentDiagnostics("resident.mira").trace.filter((event) =>
    event.kind === "cognition_reason" && event.summary.includes("physical motion blocked")
  );
}

describe("SPC World motion intent -> physical outcome seam", () => {
  it("keeps non-zero desired motion while public physical velocity truthfully reports a blocked body", () => {
    const runtime = world();
    runtime.addPlayer("player.jozz", { x: 1_000, y: 500 }, { maxSpeed: 100 });
    runtime.setActorMotionIntent("player.jozz", { x: 100, y: 0 });

    expect(runtime.publicSnapshot().actors[0]?.velocity).toEqual({ x: 0, y: 0 });
    runtime.step();

    const actor = runtime.publicSnapshot().actors.find((candidate) => candidate.id === "player.jozz")!;
    const outcome = runtime.diagnostics().lastMotionOutcomes.find((candidate) => candidate.actorId === "player.jozz")!;
    expect(actor.position).toEqual({ x: 1_000, y: 500 });
    expect(actor.velocity).toEqual({ x: 0, y: 0 });
    expect(outcome.desiredVelocity).toEqual({ x: 100, y: 0 });
    expect(outcome.resolvedVelocity).toEqual({ x: 0, y: 0 });
    expect(outcome.resolution).toBe("blocked");
    expect(outcome.constraints).toEqual(["world_bounds"]);
  });

  it("lets a resident learn about genuine zero-progress physical blockage without treating partial constraint as the same thing", () => {
    const runtime = world();
    runtime.addResident("resident.mira", "Mira", { x: 1_000, y: 500 }, {
      maxSpeed: 100,
      brainIntervalTicks: 1_000,
    });
    runtime.setActorMotionIntent("resident.mira", { x: 100, y: 0 });
    runtime.step();

    expect(blockedReasons(runtime)).toHaveLength(1);
  });

  it("deduplicates one continuous zero-progress blockage episode instead of producing cognition pressure every tick", () => {
    const runtime = world();
    runtime.addResident("resident.mira", "Mira", { x: 1_000, y: 500 }, {
      maxSpeed: 100,
      brainIntervalTicks: 1_000,
    });
    runtime.setActorMotionIntent("resident.mira", { x: 100, y: 0 });
    runtime.step(60);

    expect(blockedReasons(runtime)).toHaveLength(1);
  });

  it("opens a new blockage episode after real physical progress", () => {
    const runtime = world();
    runtime.addResident("resident.mira", "Mira", { x: 1_000, y: 500 }, {
      maxSpeed: 100,
      brainIntervalTicks: 1_000,
    });

    runtime.setActorMotionIntent("resident.mira", { x: 100, y: 0 });
    runtime.step();
    expect(blockedReasons(runtime)).toHaveLength(1);

    runtime.setActorMotionIntent("resident.mira", { x: -100, y: 0 });
    runtime.step();
    expect(runtime.publicSnapshot().actors.find((actor) => actor.id === "resident.mira")?.position.x).toBe(900);

    runtime.setActorMotionIntent("resident.mira", { x: 100, y: 0 });
    runtime.step();
    expect(runtime.publicSnapshot().actors.find((actor) => actor.id === "resident.mira")?.position.x).toBe(1_000);
    expect(blockedReasons(runtime)).toHaveLength(1);

    runtime.step();
    expect(blockedReasons(runtime)).toHaveLength(2);
    expect(blockedReasons(runtime)[1]?.tick).toBeGreaterThan(blockedReasons(runtime)[0]!.tick);
  });

  it("reports partial movement as constrained while preserving the physically realized component", () => {
    const runtime = world();
    runtime.addPlayer("player.jozz", { x: 1_000, y: 500 }, { maxSpeed: 100 });
    runtime.setActorMotionIntent("player.jozz", { x: 60, y: 80 });
    runtime.step();

    const actor = runtime.publicSnapshot().actors.find((candidate) => candidate.id === "player.jozz")!;
    const outcome = runtime.diagnostics().lastMotionOutcomes.find((candidate) => candidate.actorId === "player.jozz")!;
    expect(actor.position).toEqual({ x: 1_000, y: 580 });
    expect(actor.velocity).toEqual({ x: 0, y: 80 });
    expect(outcome.resolution).toBe("constrained");
    expect(outcome.constraints).toEqual(["world_bounds"]);
  });
});
