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

function selfMotionEvidence(runtime: SpcWorldRuntime) {
  return runtime.residentDiagnostics("resident.mira").recentPercepts.filter((percept) =>
    percept.modality === "self" && percept.phenomenon === "movement" && percept.selfMotionOutcome
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

  it("lets a resident ground genuine zero-progress blockage in exact World outcome evidence", () => {
    const runtime = world();
    runtime.addResident("resident.mira", "Mira", { x: 1_000, y: 500 }, {
      maxSpeed: 100,
      brainIntervalTicks: 1_000,
    });
    runtime.setActorMotionIntent("resident.mira", { x: 100, y: 0 });
    runtime.step();

    const evidence = selfMotionEvidence(runtime);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.spatial).toEqual({ kind: "none" });
    expect(evidence[0]?.selfMotionOutcome).toMatchObject({
      actorId: "resident.mira",
      before: { x: 1_000, y: 500 },
      desiredVelocity: { x: 100, y: 0 },
      after: { x: 1_000, y: 500 },
      resolvedVelocity: { x: 0, y: 0 },
      resolution: "blocked",
      constraints: ["world_bounds"],
    });

    const reasons = blockedReasons(runtime);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.refIds).toContain(evidence[0]!.id);
  });

  it("deduplicates one continuous zero-progress blockage episode instead of producing memory or cognition pressure every tick", () => {
    const runtime = world();
    runtime.addResident("resident.mira", "Mira", { x: 1_000, y: 500 }, {
      maxSpeed: 100,
      brainIntervalTicks: 1_000,
    });
    runtime.setActorMotionIntent("resident.mira", { x: 100, y: 0 });
    runtime.step(60);

    expect(blockedReasons(runtime)).toHaveLength(1);
    expect(selfMotionEvidence(runtime)).toHaveLength(1);
  });

  it("opens a new grounded blockage episode after real physical progress", () => {
    const runtime = world();
    runtime.addResident("resident.mira", "Mira", { x: 1_000, y: 500 }, {
      maxSpeed: 100,
      brainIntervalTicks: 1_000,
    });

    runtime.setActorMotionIntent("resident.mira", { x: 100, y: 0 });
    runtime.step();
    expect(blockedReasons(runtime)).toHaveLength(1);
    expect(selfMotionEvidence(runtime)).toHaveLength(1);

    runtime.setActorMotionIntent("resident.mira", { x: -100, y: 0 });
    runtime.step();
    expect(runtime.publicSnapshot().actors.find((actor) => actor.id === "resident.mira")?.position.x).toBe(900);

    runtime.setActorMotionIntent("resident.mira", { x: 100, y: 0 });
    runtime.step();
    expect(runtime.publicSnapshot().actors.find((actor) => actor.id === "resident.mira")?.position.x).toBe(1_000);
    expect(blockedReasons(runtime)).toHaveLength(1);

    runtime.step();
    expect(blockedReasons(runtime)).toHaveLength(2);
    expect(selfMotionEvidence(runtime)).toHaveLength(2);
    expect(blockedReasons(runtime)[1]?.tick).toBeGreaterThan(blockedReasons(runtime)[0]!.tick);
  });

  it("records partial physical constraint as resident experience without treating it as zero-progress blockage", () => {
    const runtime = world();
    runtime.addResident("resident.mira", "Mira", { x: 1_000, y: 500 }, {
      maxSpeed: 100,
      brainIntervalTicks: 1_000,
    });
    runtime.setActorMotionIntent("resident.mira", { x: 60, y: 80 });
    runtime.step();

    const actor = runtime.publicSnapshot().actors.find((candidate) => candidate.id === "resident.mira")!;
    const outcome = runtime.diagnostics().lastMotionOutcomes.find((candidate) => candidate.actorId === "resident.mira")!;
    expect(actor.position).toEqual({ x: 1_000, y: 580 });
    expect(actor.velocity).toEqual({ x: 0, y: 80 });
    expect(outcome.resolution).toBe("constrained");
    expect(outcome.constraints).toEqual(["world_bounds"]);
    expect(selfMotionEvidence(runtime)).toHaveLength(1);
    expect(selfMotionEvidence(runtime)[0]?.selfMotionOutcome?.resolution).toBe("constrained");
    expect(blockedReasons(runtime)).toHaveLength(0);
  });

  it("does not flood private resident experience with ordinary full motion outcomes", () => {
    const runtime = world();
    runtime.addResident("resident.mira", "Mira", { x: 500, y: 500 }, {
      maxSpeed: 100,
      brainIntervalTicks: 1_000,
    });
    runtime.setActorMotionIntent("resident.mira", { x: 10, y: 0 });
    runtime.step(20);

    expect(selfMotionEvidence(runtime)).toHaveLength(0);
    expect(blockedReasons(runtime)).toHaveLength(0);
  });
});
