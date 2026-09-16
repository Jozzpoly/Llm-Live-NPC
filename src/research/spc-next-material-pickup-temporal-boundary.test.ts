import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "../spc-next/resident-continuity-kernel";
import { ResidentMaterialKnowledge } from "../spc-next/resident-material-knowledge";
import { ResidentMaterialPickupExecutor, type ResidentMaterialPickupStep } from "../spc-next/resident-material-pickup-executor";
import { ResidentWorldExecutionAuthority } from "../spc-next/resident-world-execution-authority";
import { SpcWorldRuntime, type SpcMaterialActionIntent } from "../spc-next/spc-world-runtime";
import type { MaterialActionResult } from "../spc-next/material-world-state";

const RESIDENT_ID = "resident.janek";
const RACER_ID = "player.racer";
const OBJECT_ID = "crate.temporal-boundary";
const RUN_ID = "run.janek.temporal-boundary-pickup";

type InjectionPhase = "before_resident_step" | "after_resident_step";

interface RaceOutcome {
  resident: ResidentMaterialPickupStep;
  racer: MaterialActionResult | null;
  finalHolder: string | null;
  residentTerminalTick: number | null;
}

describe("research-only material pickup temporal boundary", () => {
  it("discovers the resident pickup boundary instead of hard-coding a timing constant", () => {
    const fixture = createFixture();
    const boundaryTick = discoverResidentPickupTick(fixture);

    expect(boundaryTick).toBeGreaterThan(20);
    expect(boundaryTick).toBeLessThan(200);
  });

  it("keeps exact action ordering deterministic across T-1 / T / T+1 perturbations", () => {
    const boundaryTick = discoverResidentPickupTick(createFixture());

    const oneTickEarly = runRace(boundaryTick - 1, "before_resident_step", boundaryTick);
    expect(oneTickEarly.racer).toMatchObject({ status: "succeeded", code: "picked_up" });
    expect(oneTickEarly.resident.status).toBe("blocked");
    expect(oneTickEarly.finalHolder).toBe(RACER_ID);

    const sameTickExternalFirst = runRace(boundaryTick, "before_resident_step", boundaryTick);
    expect(sameTickExternalFirst.racer).toMatchObject({ status: "succeeded", code: "picked_up" });
    expect(sameTickExternalFirst.resident.status).toBe("blocked");
    expect(sameTickExternalFirst.finalHolder).toBe(RACER_ID);

    const sameTickResidentFirst = runRace(boundaryTick, "after_resident_step", boundaryTick);
    expect(sameTickResidentFirst.resident.status).toBe("succeeded");
    expect(sameTickResidentFirst.racer).toMatchObject({ status: "rejected", code: "object_unavailable" });
    expect(sameTickResidentFirst.finalHolder).toBe(RESIDENT_ID);

    const oneTickLate = runRace(boundaryTick + 1, "before_resident_step", boundaryTick);
    expect(oneTickLate.resident.status).toBe("succeeded");
    expect(oneTickLate.racer).toMatchObject({ status: "rejected", code: "object_unavailable" });
    expect(oneTickLate.finalHolder).toBe(RESIDENT_ID);

    // The phase boundary is sharp and replayable: moving only the external action
    // from before to after the resident's exact pickup action flips the winner.
    expect(sameTickExternalFirst.residentTerminalTick).toBe(sameTickResidentFirst.residentTerminalTick);
  });
});

function createFixture() {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [{ id: "lab", label: "Lab", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
  world.addResident(RESIDENT_ID, "Janek", { x: 100, y: 100 }, { maxSpeed: 120 });
  world.addPlayer(RACER_ID, { x: 300, y: 100 }, { maxSpeed: 120 });
  world.addMaterialObject({
    id: OBJECT_ID,
    label: "Temporal Boundary Crate",
    radius: 18,
    location: { kind: "free", position: { x: 300, y: 100 } },
  });

  const knowledge = new ResidentMaterialKnowledge(RESIDENT_ID, [OBJECT_ID], world);
  knowledge.sample();

  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:janek:temporal-boundary:origin",
    tick: world.tick,
    kind: "life_context",
    summary: "Janek intends to pick up the visible lab crate.",
  });
  kernel.openMatter({
    id: "matter.janek.temporal-boundary",
    originEvidenceId: origin.id,
    semanticCourse: "approach and pick up the visible crate",
  });
  kernel.bindRun({
    matterId: "matter.janek.temporal-boundary",
    taskId: "task.janek.temporal-boundary-pickup",
    runId: RUN_ID,
  });

  const authority = new ResidentWorldExecutionAuthority(RESIDENT_ID, kernel, world);
  const executor = new ResidentMaterialPickupExecutor(RUN_ID, OBJECT_ID, knowledge, authority, world, 120);
  return { world, executor };
}

function discoverResidentPickupTick(fixture: ReturnType<typeof createFixture>): number {
  for (let guard = 0; guard < 300; guard += 1) {
    const step = fixture.executor.step();
    if (step.status === "succeeded") return fixture.world.tick;
    if (step.status !== "running") throw new Error(`baseline pickup terminated unexpectedly: ${step.status}`);
    fixture.world.step();
  }
  throw new Error("baseline pickup boundary not reached");
}

function runRace(
  injectionTick: number,
  phase: InjectionPhase,
  expectedResidentBoundaryTick: number,
): RaceOutcome {
  const fixture = createFixture();
  const intent: SpcMaterialActionIntent = { kind: "pickup", objectId: OBJECT_ID };
  let racer: MaterialActionResult | null = null;
  let resident: ResidentMaterialPickupStep = { status: "running", runId: RUN_ID, phase: "approach" };
  let residentTerminalTick: number | null = null;

  for (let guard = 0; guard < 320; guard += 1) {
    if (fixture.world.tick === injectionTick && phase === "before_resident_step") {
      racer = fixture.world.attemptMaterialAction(RACER_ID, intent);
    }

    if (resident.status === "running") {
      resident = fixture.executor.step();
      if (resident.status !== "running") residentTerminalTick = fixture.world.tick;
    }

    if (fixture.world.tick === injectionTick && phase === "after_resident_step") {
      racer = fixture.world.attemptMaterialAction(RACER_ID, intent);
    }

    // For T+1, resident legitimately wins at T; advance one more tick so the late
    // external attempt is still executed and recorded against the already-held object.
    if (fixture.world.tick >= Math.max(injectionTick, expectedResidentBoundaryTick)
      && racer !== null
      && resident.status !== "running") {
      break;
    }

    fixture.world.step();
  }

  if (racer === null) throw new Error("temporal injection never executed");
  const object = fixture.world.materialObject(OBJECT_ID);
  const finalHolder = object?.location.kind === "held" ? object.location.actorId : null;
  return { resident, racer, finalHolder, residentTerminalTick };
}
