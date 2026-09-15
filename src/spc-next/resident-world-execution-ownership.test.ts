import { describe, expect, it } from "vitest";
import type { ResidentActivity } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

function travel(id: string, x: number): ResidentActivity {
  return {
    id,
    kind: "travel",
    targetActorId: null,
    targetPosition: { x, y: 500 },
    text: null,
    speed: 100,
    reason: "legacy control probe",
  };
}

function setup() {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 2_000, maxY: 2_000 },
    regions: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
  world.addResident("resident.mira", "Mira", { x: 500, y: 500 });
  world.addResident("resident.janek", "Janek", { x: 700, y: 500 });
  world.addPlayer("player.jozz", { x: 540, y: 500 });

  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:mira:work",
    tick: 1,
    kind: "test",
    summary: "Mira owns recovered work matter",
  });
  kernel.openMatter({
    id: "matter.mira.work",
    originEvidenceId: origin.id,
    semanticCourse: "continue recovered work",
  });
  kernel.bindRun({ matterId: "matter.mira.work", taskId: "task.mira.work", runId: "run.mira.work" });

  return { world, kernel };
}

function x(world: SpcWorldRuntime, id: string): number {
  return world.publicSnapshot().actors.find((actor) => actor.id === id)!.position.x;
}

describe("SPC Next K5b recovered resident execution ownership", () => {
  it("makes execution-authority claim a hard per-resident transition away from the legacy activity controller", () => {
    const { world, kernel } = setup();
    world.setResidentActivity("resident.mira", travel("activity:mira:legacy", 1_500));
    const authority = new ResidentWorldExecutionAuthority("resident.mira", kernel, world);

    const before = x(world, "resident.mira");
    world.step(180);
    expect(x(world, "resident.mira")).toBe(before);
    expect(authority.motionOwner()).toBeNull();

    expect(() => world.setResidentActivity("resident.mira", travel("activity:mira:bypass", 1_700)))
      .toThrow("legacy resident activity is disabled");
    expect(() => world.setActorMotionIntent("resident.mira", { x: 100, y: 0 }))
      .toThrow("direct motion bypass is disabled");
    expect(() => world.speak("resident.mira", "bypass", 100, ["resident.janek"]))
      .toThrow("direct speech bypass is disabled");
    expect(() => world.emitInteraction("resident.mira", "item.fake", "fake interaction"))
      .toThrow("synthetic interaction bypass is disabled");
  });

  it("keeps migration per-resident: an unclaimed resident may still run the explicitly legacy scaffold", () => {
    const { world, kernel } = setup();
    new ResidentWorldExecutionAuthority("resident.mira", kernel, world);
    world.setResidentActivity("resident.janek", travel("activity:janek:legacy", 1_500));

    const miraBefore = x(world, "resident.mira");
    const janekBefore = x(world, "resident.janek");
    world.step(120);

    expect(x(world, "resident.mira")).toBe(miraBefore);
    expect(x(world, "resident.janek")).toBeGreaterThan(janekBefore);
  });

  it("rechecks latched motion authority inside the World phase before every physical integration", () => {
    const { world, kernel } = setup();
    const authority = new ResidentWorldExecutionAuthority("resident.mira", kernel, world);

    expect(authority.apply({
      runId: "run.mira.work",
      effects: [{ kind: "motion", desiredVelocity: { x: 120, y: 0 } }],
    }).status).toBe("applied");
    world.step();
    const afterAuthorizedMotion = x(world, "resident.mira");

    const changed = kernel.recordEvidence({
      id: "evidence:mira:changed",
      tick: 2,
      kind: "heard",
      summary: "same matter received materially new semantic evidence",
    });
    kernel.advanceSemanticContext("matter.mira.work", changed.id);

    world.step(30);
    expect(x(world, "resident.mira")).toBe(afterAuthorizedMotion);
    expect(authority.motionOwner()).toBeNull();
  });

  it("also stops a latched run automatically when its matter is suspended between local-control updates", () => {
    const { world, kernel } = setup();
    const authority = new ResidentWorldExecutionAuthority("resident.mira", kernel, world);
    authority.apply({
      runId: "run.mira.work",
      effects: [{ kind: "motion", desiredVelocity: { x: 90, y: 0 } }],
    });
    world.step();
    const afterAuthorizedMotion = x(world, "resident.mira");

    const interruptEvidence = kernel.recordEvidence({
      id: "evidence:mira:interrupt",
      tick: 2,
      kind: "heard",
      summary: "material interruption",
    });
    kernel.openMatter({
      id: "matter.mira.interrupt",
      originEvidenceId: interruptEvidence.id,
      semanticCourse: "deal with interruption",
    });
    kernel.suspendMatter("matter.mira.work", "matter.mira.interrupt");

    world.step(30);
    expect(x(world, "resident.mira")).toBe(afterAuthorizedMotion);
    expect(authority.motionOwner()).toBeNull();
  });

  it("routes recovered physical motion feedback to the exact run instead of legacy activity_blocked cognition", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
      regions: [],
      chunkSize: 64,
      fixedDeltaSeconds: 1,
    });
    world.addResident("resident.mira", "Mira", { x: 1_000, y: 500 }, { maxSpeed: 100 });

    const kernel = new ResidentContinuityKernel();
    const origin = kernel.recordEvidence({ id: "evidence:block", tick: 1, kind: "test", summary: "move east" });
    kernel.openMatter({ id: "matter.block", originEvidenceId: origin.id, semanticCourse: "move east" });
    kernel.bindRun({ matterId: "matter.block", taskId: "task.block", runId: "run.block" });
    const authority = new ResidentWorldExecutionAuthority("resident.mira", kernel, world);

    authority.apply({
      runId: "run.block",
      effects: [{ kind: "motion", desiredVelocity: { x: 100, y: 0 } }],
    });
    world.step();

    expect(authority.lastMotionOutcome()).toMatchObject({
      runId: "run.block",
      tick: 1,
      outcome: {
        actorId: "resident.mira",
        resolution: "blocked",
        constraints: ["world_bounds"],
        resolvedVelocity: { x: 0, y: 0 },
      },
    });
    expect(world.residentDiagnostics("resident.mira").trace.some((event) =>
      event.kind === "cognition_reason" && event.summary.includes("physical motion blocked")
    )).toBe(false);
  });

  it("keeps direct player control and player speech outside resident execution authority", () => {
    const { world, kernel } = setup();
    new ResidentWorldExecutionAuthority("resident.mira", kernel, world);

    world.setActorMotionIntent("player.jozz", { x: 60, y: 0 });
    const speech = world.speak("player.jozz", "Mira?", 200, ["resident.mira"]);
    const before = x(world, "player.jozz");
    world.step();

    expect(x(world, "player.jozz")).toBeGreaterThan(before);
    expect(speech.actorId).toBe("player.jozz");
    expect(world.residentDiagnostics("resident.mira").recentPercepts.some((p) => p.text === "Mira?")).toBe(true);
  });

  it("refuses competing recovered execution owners for the same resident", () => {
    const { world, kernel } = setup();
    new ResidentWorldExecutionAuthority("resident.mira", kernel, world);

    expect(() => new ResidentWorldExecutionAuthority("resident.mira", kernel, world))
      .toThrow("resident execution authority already claimed");
  });
});
