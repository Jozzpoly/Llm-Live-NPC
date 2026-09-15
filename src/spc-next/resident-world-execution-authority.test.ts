import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

function setup() {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 2_000, maxY: 2_000 },
    regions: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
  world.addResident("resident.mira", "Mira", { x: 500, y: 500 }, { brainIntervalTicks: 99 });
  world.addResident("resident.janek", "Janek", { x: 560, y: 500 }, { brainIntervalTicks: 99 });

  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:work",
    tick: 1,
    kind: "test",
    summary: "Mira has a real continuing matter",
  });
  kernel.openMatter({
    id: "matter.work",
    originEvidenceId: origin.id,
    semanticCourse: "continue the work",
  });
  kernel.bindRun({ matterId: "matter.work", taskId: "task.work", runId: "run.work" });

  const authority = new ResidentWorldExecutionAuthority("resident.mira", kernel, world);
  return { world, kernel, authority };
}

function miraX(world: SpcWorldRuntime): number {
  return world.publicSnapshot().actors.find((actor) => actor.id === "resident.mira")!.position.x;
}

describe("ResidentWorldExecutionAuthority K5a", () => {
  it("applies composable motion + speech effects only for an exact live run", () => {
    const { world, authority } = setup();

    const result = authority.apply({
      runId: "run.work",
      effects: [
        { kind: "motion", desiredVelocity: { x: 60, y: 0 } },
        { kind: "speech", text: "pracuję dalej", radius: 200, addressedActorIds: ["resident.janek"] },
      ],
    });

    expect(result).toMatchObject({
      status: "applied",
      runId: "run.work",
      appliedEffects: ["motion", "speech"],
    });
    expect(result.status === "applied" ? result.occurrences : []).toHaveLength(1);

    const before = miraX(world);
    world.step();
    expect(miraX(world)).toBeGreaterThan(before);
    expect(world.residentDiagnostics("resident.janek").recentPercepts.some((p) => p.text === "pracuję dalej")).toBe(true);
  });

  it("rejects unknown or semantically stale runs before they can create a World effect", () => {
    const { world, kernel, authority } = setup();
    const beforeOccurrences = world.diagnostics().recentOccurrences.length;

    expect(authority.apply({
      runId: "run.forged",
      effects: [{ kind: "speech", text: "forged", radius: 200, addressedActorIds: ["resident.janek"] }],
    })).toEqual({ status: "rejected", runId: "run.forged", reason: "run_not_authorized" });

    const revision = kernel.recordEvidence({
      id: "evidence:changed",
      tick: 2,
      kind: "heard",
      summary: "the meaning of the work changed",
    });
    kernel.advanceSemanticContext("matter.work", revision.id);

    expect(authority.apply({
      runId: "run.work",
      effects: [{ kind: "speech", text: "stale", radius: 200, addressedActorIds: ["resident.janek"] }],
    })).toEqual({ status: "rejected", runId: "run.work", reason: "run_not_authorized" });
    expect(world.diagnostics().recentOccurrences).toHaveLength(beforeOccurrences);
  });

  it("revokes latched motion immediately after suspension instead of letting old intent keep moving the body", () => {
    const { world, kernel, authority } = setup();

    authority.apply({
      runId: "run.work",
      effects: [{ kind: "motion", desiredVelocity: { x: 120, y: 0 } }],
    });
    world.step();
    const afterAuthorizedStep = miraX(world);

    const interruptOrigin = kernel.recordEvidence({
      id: "evidence:interrupt",
      tick: 2,
      kind: "heard",
      summary: "material interruption",
    });
    kernel.openMatter({
      id: "matter.interrupt",
      originEvidenceId: interruptOrigin.id,
      semanticCourse: "deal with interruption",
    });
    kernel.suspendMatter("matter.work", "matter.interrupt");

    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: "run.work" });
    expect(authority.motionOwner()).toBeNull();
    world.step(5);
    expect(miraX(world)).toBe(afterAuthorizedStep);
  });

  it("revokes latched motion after same-matter semantic supersession before another physical integration", () => {
    const { world, kernel, authority } = setup();
    authority.apply({
      runId: "run.work",
      effects: [{ kind: "motion", desiredVelocity: { x: 90, y: 0 } }],
    });
    world.step();
    const afterAuthorizedStep = miraX(world);

    const evidence = kernel.recordEvidence({
      id: "evidence:revision",
      tick: 3,
      kind: "heard",
      summary: "the same matter changed semantically",
    });
    kernel.advanceSemanticContext("matter.work", evidence.id);

    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: "run.work" });
    world.step(5);
    expect(miraX(world)).toBe(afterAuthorizedStep);
  });

  it("terminal semantic state blocks new effects and removes an already latched motion intent", () => {
    const { world, kernel, authority } = setup();
    authority.apply({
      runId: "run.work",
      effects: [{ kind: "motion", desiredVelocity: { x: 60, y: 0 } }],
    });
    world.step();
    const beforeTerminalHold = miraX(world);

    kernel.cancelMatter("matter.work");
    expect(authority.apply({
      runId: "run.work",
      effects: [{ kind: "speech", text: "should not happen", radius: 200, addressedActorIds: ["resident.janek"] }],
    })).toEqual({ status: "rejected", runId: "run.work", reason: "run_not_authorized" });

    expect(authority.enforceMotionAuthority()).toEqual({ status: "revoked", runId: "run.work" });
    world.step(5);
    expect(miraX(world)).toBe(beforeTerminalHold);
    expect(world.diagnostics().recentOccurrences.some((occurrence) => occurrence.text === "should not happen")).toBe(false);
  });

  it("validates the whole frame before mutating World so an invalid companion effect cannot cause a partial action", () => {
    const { world, authority } = setup();
    const before = miraX(world);

    expect(authority.apply({
      runId: "run.work",
      effects: [
        { kind: "motion", desiredVelocity: { x: 120, y: 0 } },
        { kind: "speech", text: "bad target", radius: 200, addressedActorIds: ["missing.actor"] },
      ],
    })).toEqual({ status: "rejected", runId: "run.work", reason: "invalid_frame" });

    world.step(5);
    expect(miraX(world)).toBe(before);
    expect(world.diagnostics().recentOccurrences).toHaveLength(0);
  });

  it("does not let an old run's revocation stop a newer motion owner", () => {
    const { world, kernel, authority } = setup();
    authority.apply({
      runId: "run.work",
      effects: [{ kind: "motion", desiredVelocity: { x: 60, y: 0 } }],
    });

    kernel.retireRun("run.work");
    kernel.bindRun({ matterId: "matter.work", taskId: "task.work.2", runId: "run.work.2" });
    authority.apply({
      runId: "run.work.2",
      effects: [{ kind: "motion", desiredVelocity: { x: 120, y: 0 } }],
    });

    expect(authority.motionOwner()).toBe("run.work.2");
    expect(authority.enforceMotionAuthority()).toEqual({ status: "unchanged" });
    const before = miraX(world);
    world.step();
    expect(miraX(world)).toBeGreaterThan(before);
  });
});
