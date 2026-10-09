import { describe, expect, it } from "vitest";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import {
  createFiveResidentRegionComposition,
  type FiveResidentId,
} from "./five-resident-region";

const RESIDENT_IDS = [
  "resident.mira",
  "resident.janek",
  "resident.ida",
  "resident.oren",
  "resident.nela",
] as const satisfies readonly FiveResidentId[];

const OBSERVATION_TICKS = 1_500;

/**
 * Product-level NEGATIVE controls on the genuine five-resident causal composition.
 *
 * No provider (live or mocked), no seeded life matter, no test-supplied model
 * decision and no resident bypass. These tests characterize existing absence of
 * resident-originated purpose; they must never be reported as autonomous-life PASS.
 *
 * Proximity variant changes only Ida's AUTHORED opening destination. It proves
 * that an actual NPC/NPC private encounter can occur without automatically
 * becoming either an accepted matter or a fabricated social interaction.
 */
describe("R6 five-resident resident-owned purpose origin — negative controls", () => {
  it("starts with a real nearby material affordance but does not originate Janek's own matter without a semantic cause", () => {
    const baseline = observe(false);

    expect(baseline.claimed).toEqual([...RESIDENT_IDS]);
    expect(baseline.recognizedJanekCrate).toBe(true);
    expect(baseline.janekPendingReasonCount).toBe(0);
    expect(baseline.matterCounts).toEqual({
      "resident.mira": 0,
      "resident.janek": 0,
      "resident.ida": 0,
      "resident.oren": 0,
      "resident.nela": 0,
    });
    expect(baseline.materialActions).toBe(0);
    expect(baseline.residentSpeech).toBe(0);
    expect(baseline.janekKnowsIdaNow).toBe(false);

    // Not an inactivity "success": in this control, availability by itself
    // creates no practical life. Not even a local Janek matter is originated.
    console.info("SPC_ORIGIN_CONTROL_BASELINE", JSON.stringify(baseline));
  });

  it("a private NPC-to-NPC sight encounter alone does not become an autonomous relationship or social act", () => {
    const baseline = observe(false);
    const spatialOnly = observe(true);

    expect(baseline.janekKnowsIdaNow).toBe(false);
    expect(spatialOnly.janekKnowsIdaNow).toBe(true);
    expect(spatialOnly.janekIdaDistance).toBeLessThan(520);
    expect(spatialOnly.claimed).toEqual([...RESIDENT_IDS]);
    expect(spatialOnly.matterCounts["resident.janek"]).toBe(0);
    expect(spatialOnly.matterCounts["resident.ida"]).toBe(0);
    expect(spatialOnly.residentSpeech).toBe(0);
    expect(spatialOnly.materialActions).toBe(0);

    // A legitimate negative baseline: two world actors can be physically
    // colocated, privately perceived, and still have no resident-owned
    // reason to interact. Lack of a reason is not an instruction to chatter.
    console.info("SPC_ORIGIN_CONTROL_SPATIAL_ONLY", JSON.stringify(spatialOnly));
  });

  it("a factual player-caused material change updates Janek's private knowledge without automatically creating an owned purpose", () => {
    const composition = createFiveResidentRegionComposition();
    const world = composition.world;
    const runtime = new FiveResidentCausalLifeRuntime(composition);
    const janek = runtime.life("resident.janek");
    if (!janek) throw new Error("Janek was not claimed");
    const crateId = "crate.workshop.01";
    const initial = world.materialObject(crateId);
    if (!initial || initial.location.kind !== "free") throw new Error("Workshop crate missing");

    const mover = "player.material-negative-control";
    world.addPlayer(mover, initial.location.position, { maxSpeed: 100_000 });
    const pickup = world.attemptMaterialAction(mover, { kind: "pickup", objectId: crateId });
    expect(pickup.status).toBe("succeeded");

    // The participant physically carries the object; there is no authored NPC
    // decision, no direct resident action and no synthetic "object changed" event.
    const before = world.publicSnapshot().actors.find((actor) => actor.id === mover);
    if (!before) throw new Error("World participant missing");
    const dt = world.options.fixedDeltaSeconds;
    world.setActorMotionIntent(mover, {
      x: (2_090 - before.position.x) / dt,
      y: (800 - before.position.y) / dt,
    });
    runtime.advanceOneWorldTick();
    world.setActorMotionIntent(mover, { x: 0, y: 0 });
    const current = world.publicSnapshot().actors.find((actor) => actor.id === mover);
    if (!current) throw new Error("World participant disappeared");
    const destination = { x: current.position.x + 32, y: current.position.y };
    const place = world.attemptMaterialAction(mover, {
      kind: "place",
      objectId: crateId,
      position: destination,
    });
    expect(place.status).toBe("succeeded");

    for (let tick = 0; tick < 120; tick += 1) runtime.advanceOneWorldTick();
    const objectAfter = world.materialObject(crateId);
    if (!objectAfter || objectAfter.location.kind !== "free") {
      throw new Error("Material World did not preserve the actual object placement");
    }
    expect(objectAfter.location.position).not.toEqual(initial.location.position);
    expect(janek.materialKnowledge?.observation(crateId)).toMatchObject({
      currentlyVisible: true,
      lastKnownPosition: objectAfter.location.position,
    });
    expect(janek.currentLifeView().matters).toHaveLength(0);
    expect(composition.runtimes["resident.janek"].pendingCognitionReasons()).toEqual([]);

    // Negative test: World changed, the resident knows it changed, and it still
    // does not imply that every familiar object creates a new personal task.
    console.info("SPC_ORIGIN_CONTROL_MATERIAL_ONLY", JSON.stringify({
      materialActionCount: world.diagnostics().recentMaterialActions.length,
      finalWorldPosition: objectAfter.location.position,
      knownPosition: janek.materialKnowledge?.observation(crateId)?.lastKnownPosition,
      janekMatters: janek.currentLifeView().matters.length,
      janekPendingReasons: composition.runtimes["resident.janek"].pendingCognitionReasons().length,
    }));
  });
});

function observe(spatialOnly: boolean) {
  const composition = createFiveResidentRegionComposition();

  if (spatialOnly) {
    // Experimental change of starting circumstance, NOT Ida's live decision.
    // Do not cite this authored travel as autonomous NPC social initiative.
    composition.world.setResidentActivity("resident.ida", {
      id: "activity:ida:spatial-only-negative-control",
      kind: "travel",
      targetActorId: null,
      targetPosition: { x: 2_080, y: 790 },
      text: null,
      speed: 95,
      reason: "research counterfactual: physical proximity with Janek only",
    });
  }

  const runtime = new FiveResidentCausalLifeRuntime(composition);
  while (composition.world.tick < OBSERVATION_TICKS) {
    runtime.advanceOneWorldTick();
  }

  const snapshot = composition.world.publicSnapshot();
  const actors = Object.fromEntries(
    snapshot.actors
      .filter((actor) => actor.kind === "resident")
      .map((actor) => [actor.id, actor.position]),
  ) as Record<FiveResidentId, { x: number; y: number }>;
  const janek = runtime.life("resident.janek");
  if (!janek) throw new Error("Janek was not claimed by recovered causal life");

  const knownActors = composition.runtimes["resident.janek"].cognitionContext({
    residentId: "resident.janek",
    requestedAtTick: composition.world.tick,
    reasons: [],
  }).knownActors;

  const ida = knownActors.find((actor) => actor.id === "resident.ida");
  const material = janek.materialKnowledge?.observation("crate.workshop.01");
  const worldEvents = composition.world.diagnostics();

  return {
    tick: composition.world.tick,
    claimed: runtime.claimedResidentIds(),
    recognizedJanekCrate: material?.currentlyVisible ?? false,
    janekPendingReasonCount:
      composition.runtimes["resident.janek"].pendingCognitionReasons().length,
    janekKnowsIdaNow: ida?.currentlyVisible === true,
    janekIdaDistance: Math.hypot(
      actors["resident.janek"].x - actors["resident.ida"].x,
      actors["resident.janek"].y - actors["resident.ida"].y,
    ),
    matterCounts: Object.fromEntries(RESIDENT_IDS.map((residentId) => [
      residentId,
      runtime.life(residentId)?.currentLifeView().matters.length ?? -1,
    ])) as Record<FiveResidentId, number>,
    residentSpeech: worldEvents.recentOccurrences.filter((event) =>
      event.kind === "speech" && RESIDENT_IDS.some((id) => id === event.actorId)
    ).length,
    materialActions: worldEvents.recentMaterialActions.length,
  };
}
