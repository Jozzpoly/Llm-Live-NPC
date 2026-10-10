import { describe, expect, it, vi } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import {
  ResidentRunMaterialRelocationExecutor,
  type ResidentRunMaterialRelocationStep,
} from "./resident-run-material-relocation-executor";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const JAN = "resident.janek";
const PLAYER = "player.jozz";
const CRATE = "crate.workshop.01";
const RUN = "run.janek.test-relocation";
const MATTER = "matter.janek.test-relocation";
const ORIGINAL = { x: 1_952, y: 720 };

function fixture(occupyOriginal = false) {
  const composition = createFiveResidentRegionComposition({
    materialBodyCollision: true,
    playerStart: { x: 2_004, y: 720 },
  });
  const world = composition.world;
  const knowledge = new ResidentMaterialKnowledge(JAN, [CRATE], world);
  expect(knowledge.sample()).toEqual([expect.objectContaining({
    objectId: CRATE, currentlyVisible: true,
    observedLocationKind: "free", lastKnownPosition: ORIGINAL,
  })]);
  // This target is remembered from Janek's actual private sight BEFORE any
  // physical change, not read from post-event public World state.
  const rememberedPlace = knowledge.lastKnownPosition(CRATE)!;

  const moverPosition = () => world.publicSnapshot().actors.find((a) => a.id === PLAYER)!.position;
  function physicallyMovePlayer(to: { x: number; y: number }) {
    for (let i = 0; i < 450; i += 1) {
      const at = moverPosition();
      const dx = to.x - at.x, dy = to.y - at.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1.8) break;
      const speed = Math.min(150, distance / world.options.fixedDeltaSeconds);
      world.setActorMotionIntent(PLAYER, {
        x: (dx / distance) * speed, y: (dy / distance) * speed,
      });
      world.step();
    }
    world.setActorMotionIntent(PLAYER, { x: 0, y: 0 });
    expect(Math.hypot(moverPosition().x - to.x, moverPosition().y - to.y)).toBeLessThan(1.8);
  }

  expect(world.attemptMaterialAction(PLAYER, { kind: "pickup", objectId: CRATE }))
    .toMatchObject({ status: "succeeded", code: "picked_up" });
  physicallyMovePlayer({ x: 2_135, y: 760 });
  expect(world.attemptMaterialAction(PLAYER, {
    kind: "place", objectId: CRATE, position: { x: 2_182, y: 760 },
  })).toMatchObject({ status: "succeeded", code: "placed" });
  physicallyMovePlayer({ x: 2_370, y: 960 });

  if (occupyOriginal) {
    world.addMaterialObject({
      id: "crate.workshop.blocker",
      label: "Physical obstruction",
      radius: 20,
      location: { kind: "free", position: ORIGINAL },
    });
  }

  expect(knowledge.sample()).toEqual([expect.objectContaining({
    objectId: CRATE, currentlyVisible: true,
    lastKnownPosition: { x: 2_182, y: 760 },
  })]);
  expect(rememberedPlace).toEqual(ORIGINAL);

  const kernel = new ResidentContinuityKernel();
  kernel.recordEvidence({
    id: "evidence.janek.explicit-relocation-test-stimulus",
    tick: world.tick,
    kind: "life_context",
    summary: "Explicit mechanical test intention. NOT an NPC preference, model proposal or resident-originated task.",
  });
  kernel.openMatter({
    id: MATTER,
    originEvidenceId: "evidence.janek.explicit-relocation-test-stimulus",
    semanticCourse: "Test-only material relocation with remembered-place provenance",
  });
  kernel.bindRun({ matterId: MATTER, taskId: "task.janek.test-relocation", runId: RUN });
  const authority = new ResidentWorldExecutionAuthority(JAN, kernel, world);
  const executor = new ResidentRunMaterialRelocationExecutor(
    RUN, CRATE, rememberedPlace, knowledge, authority, world,
  );
  return { world, kernel, authority, executor, knowledge, rememberedPlace };
}

function runUntil(
  fixture: ReturnType<typeof fixture>,
  stop: (step: ResidentRunMaterialRelocationStep) => boolean,
  max = 1_400,
) {
  let step = fixture.executor.step();
  for (let i = 0; i < max && !stop(step); i += 1) {
    fixture.world.step();
    step = fixture.executor.step();
  }
  return step;
}

describe("single-run resident World material relocation — MECHANIC ONLY / no Luna", () => {
  it("keeps one exact authorized run for both pickup and factual placement; reconciles only after place", () => {
    const upstream = vi.fn(() => { throw new Error("no provider calls permitted"); });
    vi.stubGlobal("fetch", upstream);
    try {
      const f = fixture();
      const phaseTransition = runUntil(f, (step) => step.status === "running" && step.phase === "place");
      expect(phaseTransition).toMatchObject({ status: "running", phase: "place", runId: RUN });
      expect(f.world.materialObject(CRATE)?.location).toEqual({ kind: "held", actorId: JAN });
      expect(f.kernel.runBinding(RUN)).toMatchObject({ matterId: MATTER });
      expect(f.kernel.matter(MATTER)?.status).toBe("active");
      expect(f.authority.recentActionFacts().filter(a => a.action.kind === "material_pickup"))
        .toHaveLength(1);
      expect(f.authority.recentActionFacts().filter(a => a.action.kind === "material_place"))
        .toHaveLength(0);

      const terminal = runUntil(f, step => step.status !== "running");
      expect(terminal).toMatchObject({
        status: "succeeded", runId: RUN,
        pickupOutcome: { status: "succeeded", code: "picked_up" },
        placeOutcome: { status: "succeeded", code: "placed" },
      });
      expect(f.world.materialObject(CRATE)?.location).toEqual({
        kind: "free", position: ORIGINAL,
      });
      expect(f.authority.recentActionFacts().map(a => a.action.kind))
        .toEqual(["material_pickup", "material_place"]);
      expect(f.kernel.matter(MATTER)?.status).toBe("active");
      expect(f.kernel.runBinding(RUN)).toMatchObject({ matterId: MATTER });
      const reconciled = f.kernel.reconcileRunOutcome({
        runId: RUN, tick: f.world.tick, status: "succeeded",
        summary: "World placed known material at resident-private previously observed workstation point",
      });
      expect(reconciled.status).toBe("recorded");
      f.kernel.resolveMatter(MATTER);
      expect(f.kernel.matter(MATTER)).toMatchObject({ status: "resolved", activeRunId: null });
      expect(f.kernel.runBinding(RUN)).toBeNull();
      expect(upstream).not.toHaveBeenCalled();
      console.info("SPC_ONE_RUN_MATERIAL_RELOCATION_MECHANIC_ONLY", JSON.stringify({
        status: terminal.status, actualWorldActions: 2, completedAt: f.world.tick,
        lastPlaceFromResidentPrivateMemory: true, modelCalls: 0, testAuthoredIntention: true,
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does NOT call successful pickup 'complete' when the remembered place is physically occupied", () => {
    const f = fixture(true);
    const terminal = runUntil(f, step => step.status !== "running");
    expect(terminal).toMatchObject({
      status: "blocked", phase: "place", reason: "material place object_occupied",
      materialOutcome: { status: "rejected", code: "object_occupied" },
    });
    expect(f.world.materialObject(CRATE)?.location).toEqual({ kind: "held", actorId: JAN });
    expect(f.kernel.runBinding(RUN)).toMatchObject({ matterId: MATTER });
    expect(f.kernel.matter(MATTER)?.status).toBe("active");
    const count = f.authority.recentActionFacts().length;
    expect(f.executor.step()).toEqual(terminal);
    expect(f.authority.recentActionFacts()).toHaveLength(count);
  });

  it("after pickup, revoked run cannot place or pretend a physical return", () => {
    const f = fixture();
    const stage = runUntil(f, step => step.status === "running" && step.phase === "place");
    expect(stage).toMatchObject({ status: "running", phase: "place" });
    expect(f.world.materialObject(CRATE)?.location).toEqual({ kind: "held", actorId: JAN });
    expect(f.kernel.retireRun(RUN)).toMatchObject({ runId: RUN, matterId: MATTER });
    const terminal = f.executor.step();
    expect(terminal).toMatchObject({ status: "authority_lost", phase: "place", runId: RUN });
    expect(f.world.materialObject(CRATE)?.location).toEqual({ kind: "held", actorId: JAN });
    expect(f.authority.recentActionFacts().map(a => a.action.kind))
      .toEqual(["material_pickup"]);
    expect(f.kernel.matter(MATTER)).toMatchObject({ status: "active", activeRunId: null });
  });
});
