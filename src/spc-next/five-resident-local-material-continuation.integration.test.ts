import { describe, expect, it } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";

const JAN = "resident.janek";
const CRATE = "crate.workshop.01";
const MOVER = "player.material-interference";
const MATTER = "matter.janek.initial-accepted-crate";
const PRIOR_RUN = "run.janek.initial-accepted-crate.old-block";
const MOVE_RATE = 48_000;

/**
 * Honest boundary: the resident's CURRENT concern + an earlier blocked episode
 * are authored initial-life context. Player actions below are genuine World
 * pickup/carry/place stimuli. NO autonomous original motive is claimed.
 */
function specimen(withPriorMatter = true) {
  const composition = createFiveResidentRegionComposition();
  const { world } = composition;
  world.addPlayer(MOVER, { x: 2_004, y: 720 }, { maxSpeed: MOVE_RATE });
  const lifeHost = new FiveResidentCausalLifeRuntime(composition);
  const life = lifeHost.life(JAN)!;
  expect(life).not.toBeNull();
  expect(life.materialKnowledge?.observation(CRATE)).toMatchObject({
    currentlyVisible: true, lastKnownPosition: { x: 1_952, y: 720 },
  });

  if (withPriorMatter) {
    const origin = life.kernel.recordEvidence({
      id: "evidence.janek.authored-start-prior-material-concern",
      tick: world.tick,
      kind: "life_context",
      summary: "Authored current starting situation: Janek previously decided to acquire familiar crate.",
    });
    life.kernel.openMatter({
      id: MATTER,
      originEvidenceId: origin.id,
      semanticCourse: "Acquire the familiar material as part of prior personal workshop concern",
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: CRATE,
        goal: "Get the familiar workshop crate",
      },
    });
    life.matterScope.track(MATTER);
    life.kernel.bindRun({
      matterId: MATTER, taskId: "task.janek.initial-accepted-crate.old-block", runId: PRIOR_RUN,
    });
    const blocked = life.kernel.reconcileRunOutcome({
      runId: PRIOR_RUN, tick: world.tick, status: "blocked",
      summary: "the previously recognized material was no longer at the checked known position",
    });
    expect(blocked.status).toBe("recorded");
    if (blocked.status === "recorded") {
      life.outcomeReviewBridge.observe(blocked.evidence, world.tick);
    }
  }
  return { world, lifeHost, life, janek: composition.runtimes[JAN] };
}

/** Deliberate external intervention: same real World action API as ordinary actors. */
function carryOutsideJanekSight(s: ReturnType<typeof specimen>) {
  expect(s.world.attemptMaterialAction(MOVER, {
    kind: "pickup", objectId: CRATE,
  })).toMatchObject({ status: "succeeded", code: "picked_up" });
  s.world.setActorMotionIntent(MOVER, { x: MOVE_RATE, y: 0 });
  const stepped = s.lifeHost.advanceOneWorldTick();
  s.world.setActorMotionIntent(MOVER, { x: 0, y: 0 });
  expect(s.life.materialKnowledge?.observation(CRATE)).toMatchObject({
    currentlyVisible: false,
  });
  expect(stepped.localMaterialResumption[JAN]).toBeUndefined();
  return s.world.publicSnapshot().actors.find(a => a.id === MOVER)!.position;
}

function returnCarriedAndPutFree(s: ReturnType<typeof specimen>) {
  // Independent mover traverses one real physical World tick between the
  // sampling instants. This is test staging, NOT player-feel continuity proof.
  s.world.setActorMotionIntent(MOVER, { x: -MOVE_RATE, y: 0 });
  s.world.step();
  s.world.setActorMotionIntent(MOVER, { x: 0, y: 0 });
  const at = s.world.publicSnapshot().actors.find(a => a.id === MOVER)!.position;
  const dest = { x: at.x + 24, y: at.y };
  expect(s.world.attemptMaterialAction(MOVER, {
    kind: "place", objectId: CRATE, position: dest,
  })).toMatchObject({ status: "succeeded", code: "placed" });
  return dest;
}

describe("five-resident R6 — material continuation from private changed reality, NO Luna", () => {
  it("locally resumes exactly the resident's EXISTING blocked matter after witnessed free-state return", () => {
    const s = specimen();
    carryOutsideJanekSight(s);
    const destination = returnCarriedAndPutFree(s);
    const observed = s.lifeHost.advanceOneWorldTick();
    expect(observed.materialRelevance[JAN]).toContainEqual(expect.objectContaining({
      status: "reactivatable", matterId: MATTER, objectId: CRATE,
    }));
    expect(observed.localMaterialResumption[JAN]).toContainEqual(expect.objectContaining({
      status: "acquired", matterId: MATTER,
    }));
    const runId = observed.localMaterialResumption[JAN]![0]!.runId;
    expect(runId).not.toBe(PRIOR_RUN);
    expect(s.life.focus.focusedRun()).toBe(runId);
    expect(s.life.kernel.matter(MATTER)).toMatchObject({
      status: "active", activeRunId: runId, semanticRevision: 2,
    });
    expect(s.janek.pendingCognitionReasons().filter(r =>
      r.kind === "activity_completed" && r.evidenceIds.includes(
        s.life.kernel.lastOutcomeEvidence(MATTER)!.id,
      ),
    )).toHaveLength(0);

    let completed = false;
    let repeats = 0;
    for (let i = 0; i < 450; i += 1) {
      const tick = s.lifeHost.advanceOneWorldTick();
      repeats += tick.localMaterialResumption[JAN]?.length ?? 0;
      if (tick.execution[JAN]?.status === "completed") {
        completed = true; break;
      }
    }
    expect(completed).toBe(true);
    expect(repeats).toBe(0);
    expect(s.world.materialObject(CRATE)?.location).toEqual({
      kind: "held", actorId: JAN,
    });
    expect(s.life.kernel.matter(MATTER)?.status).toBe("resolved");
    expect(s.life.matterScope.matterIds()).toContain(MATTER);
    expect(Math.hypot(destination.x - 1_900, destination.y - 720)).toBeGreaterThan(56);
    expect(s.world.diagnostics().recentMaterialActions.some(a =>
      a.actorId === JAN && a.code === "picked_up",
    )).toBe(true);
    console.info("SPC_LOCAL_CONTINUATION_ONLY", JSON.stringify({
      status: "factual_world_pickup", authoredInitialMatter: true,
      automaticNewGoal: false, localReacquisition: true,
      providerCalls: 0, resident:JAN,
    }));
  });

  it("does not create a resident matter or movement from the SAME observed item without prior concern", () => {
    const s = specimen(false);
    carryOutsideJanekSight(s);
    returnCarriedAndPutFree(s);
    const observed = s.lifeHost.advanceOneWorldTick();
    expect(observed.localMaterialResumption[JAN]).toBeUndefined();
    expect(s.life.currentLifeView().matters).toHaveLength(0);
    const here = s.world.publicSnapshot().actors.find(a=>a.id===JAN)!.position;
    for(let i=0; i<180; i++) s.lifeHost.advanceOneWorldTick();
    expect(s.world.publicSnapshot().actors.find(a=>a.id===JAN)!.position).toEqual(here);
    expect(s.janek.pendingCognitionReasons()).toEqual([]);
  });

  it("does not treat a newly visible HELD object as an available free pickup", () => {
    const s=specimen();
    carryOutsideJanekSight(s);
    s.world.setActorMotionIntent(MOVER,{x:-MOVE_RATE,y:0});
    s.world.step();
    s.world.setActorMotionIntent(MOVER,{x:0,y:0});
    const observed=s.lifeHost.advanceOneWorldTick();
    expect(observed.localMaterialResumption[JAN]).toBeUndefined();
    expect(s.life.focus.focusedRun()).toBeNull();
    expect(s.world.materialObject(CRATE)?.location).toEqual({kind:"held",actorId:MOVER});
  });

  it("never repeats a renewed run merely because free material remains in view", () => {
    const s=specimen();
    carryOutsideJanekSight(s);
    returnCarriedAndPutFree(s);
    const resumed=s.lifeHost.advanceOneWorldTick();
    expect(resumed.localMaterialResumption[JAN]).toHaveLength(1);
    let repeats=0;
    for(let i=0;i<200;i++){
      repeats += s.lifeHost.advanceOneWorldTick().localMaterialResumption[JAN]?.length??0;
    }
    expect(repeats).toBe(0);
  });
});
