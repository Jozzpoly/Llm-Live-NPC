import { describe, expect, it, vi } from "vitest";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { createFiveResidentRegionComposition } from "./five-resident-region";

const ORIGINAL = "crate.workshop.01";
const UNRELATED = "crate.workshop.tools";
const MOVER = "player.workshop-private-experience";

function fixture(withAuthoredRelation: boolean, moverStart = { x: 2_004, y: 720 }) {
  const composition = createFiveResidentRegionComposition({ materialBodyCollision: true });
  const world = composition.world;
  world.addPlayer(MOVER, moverStart, { maxSpeed: 150 });
  const runtime = new FiveResidentCausalLifeRuntime(composition,
    withAuthoredRelation ? { materialStewardships: { "resident.janek": [ORIGINAL] } } : {});
  const janek = runtime.life("resident.janek");
  if (!janek) throw new Error("Janek must be in the real recovered five-resident World");
  const mover = () => {
    const actor = world.publicSnapshot().actors.find((a) => a.id === MOVER);
    if (!actor) throw new Error("missing real participant");
    return actor.position;
  };
  function physicallyMove(to: { x: number; y: number }) {
    const detectedTransitions: string[] = [];
    // Legitimate bounded 60 Hz movement: the World owns max speed, free-object
    // collision and the real carrying load (0.68). Never teleport the actor or
    // compensate for carrying burden with a fabricated high-speed input.
    for (let step = 0; step < 360; step += 1) {
      const now = mover();
      const dx = to.x - now.x;
      const dy = to.y - now.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1.8) break;
      const speed = Math.min(150, distance / world.options.fixedDeltaSeconds);
      world.setActorMotionIntent(MOVER, {
        x: dx / distance * speed, y: dy / distance * speed,
      });
      const tick = runtime.advanceOneWorldTick();
      for (const observation of tick.stewardshipRelevance["resident.janek"] ?? []) {
        detectedTransitions.push(observation.status);
      }
    }
    world.setActorMotionIntent(MOVER, { x: 0, y: 0 });
    expect(Math.hypot(mover().x - to.x, mover().y - to.y)).toBeLessThan(1.8);
    return detectedTransitions;
  }
  function moveCrateOut() {
    expect(world.attemptMaterialAction(MOVER, { kind: "pickup", objectId: ORIGINAL }))
      .toMatchObject({ status: "succeeded", code: "picked_up" });
    const inTransitTransitions = physicallyMove({ x: 2_135, y: 760 });
    const destination = { x: 2_182, y: 760 };
    expect(world.attemptMaterialAction(MOVER, {
      kind: "place", objectId: ORIGINAL, position: destination,
    })).toMatchObject({ status: "succeeded", code: "placed" });
    const afterPlacement = runtime.advanceOneWorldTick();
    return { inTransitTransitions, afterPlacement };
  }
  return { world, runtime, janek, mover, physicallyMove, moveCrateOut };
}

describe("real pre-Luna physical workshop × resident-private significance (PR151 donor)", () => {
  it("does not manufacture purpose from an ordinary World displacement when no relation exists", () => {
    const { world, runtime, janek, moveCrateOut } = fixture(false);
    const outcome = moveCrateOut();
    expect(outcome.inTransitTransitions).toEqual([]);
    expect(outcome.afterPlacement.stewardshipRelevance["resident.janek"]).toBeUndefined();
    expect(janek.materialKnowledge?.observation(ORIGINAL)).toMatchObject({
      currentlyVisible: true,
      lastKnownPosition: { x: 2_182, y: 760 },
      observedLocationKind: "free",
    });
    expect(janek.resident.pendingCognitionReasons()).toEqual([]);
    expect(runtime.takeReadyLifeIntentAttempts()).toEqual([]);
    expect(janek.currentLifeView().matters).toEqual([]);
    expect(world.materialObjects()).toHaveLength(4);
  });

  it("starts one bounded, private and undecided concern from witnessed disruption of a specifically assigned relation", () => {
    const upstream = vi.fn(() => { throw new Error("provider must never be called by this World-only experiment"); });
    vi.stubGlobal("fetch", upstream);
    try {
      const { world, runtime, janek, moveCrateOut, physicallyMove } = fixture(true);
      expect(janek.resident.pendingCognitionReasons()).toEqual([]);
      const outcome = moveCrateOut();
      // A genuinely visible displacement may be noticed while held IN TRANSIT,
      // not only after placement. Preserve the actual World/perception boundary.
      const transitions = [
        ...outcome.inTransitTransitions,
        ...(outcome.afterPlacement.stewardshipRelevance["resident.janek"] ?? [])
          .map((observation) => observation.status),
      ];
      expect(transitions).toEqual(["needs_judgement"]);
      const [reason] = janek.resident.pendingCognitionReasons();
      expect(reason).toMatchObject({
        kind: "uncertainty",
        evidenceIds: expect.arrayContaining([
          expect.stringMatching(/^evidence_stewardship_origin:/),
          expect.stringMatching(/^evidence_stewardship_displacement:/),
        ]),
      });
      expect(janek.currentLifeView().matters).toEqual([]);
      // Repeated looking and four other real material affordances must not
      // schedule a perpetual LLM treadmill or fake an automatic errand.
      for (let i = 0; i < 80; i += 1) {
        const tick = runtime.advanceOneWorldTick();
        expect(tick.stewardshipRelevance["resident.janek"]).toBeUndefined();
      }
      expect(janek.resident.pendingCognitionReasons()).toHaveLength(1);
      expect(janek.materialKnowledge?.snapshot().map((o) => o.objectId)).toEqual([ORIGINAL]);

      // Return only via ordinary World pickup, embodied travel and placement.
      // No resident decision or run is inserted at any point.
      expect(world.attemptMaterialAction(MOVER, { kind: "pickup", objectId: ORIGINAL }))
        .toMatchObject({ status: "succeeded", code: "picked_up" });
      physicallyMove({ x: 2_004, y: 720 });
      expect(world.attemptMaterialAction(MOVER, {
        kind: "place", objectId: ORIGINAL, position: { x: 1_952, y: 720 },
      })).toMatchObject({ status: "succeeded", code: "placed" });
      const restored = runtime.advanceOneWorldTick();
      expect(restored.stewardshipRelevance["resident.janek"]).toEqual([
        expect.objectContaining({ status: "restored", settled: true }),
      ]);
      expect(janek.materialKnowledge?.observation(ORIGINAL)).toMatchObject({
        observedLocationKind: "free", lastKnownPosition: { x: 1_952, y: 720 },
      });
      expect(janek.resident.pendingCognitionReasons()).toEqual([]);
      expect(runtime.takeReadyLifeIntentAttempts()).toEqual([]);
      expect(janek.currentLifeView().matters).toEqual([]);
      expect(world.diagnostics().recentMaterialActions.filter((a) => a.actorId === "resident.janek"))
        .toEqual([]);
      expect(upstream).not.toHaveBeenCalled();
      console.info("SPC_PRE_LUNA_PRIVATE_SIGNIFICANCE_MECHANIC_ONLY", JSON.stringify({
        fiveResidents: runtime.claimedResidentIds().length,
        actualPlayerMaterialActions: world.diagnostics().recentMaterialActions
          .filter((action) => action.actorId === MOVER && action.status === "succeeded").length,
        concernsCreated: 1, settledOnWorldRestoration: true,
        residentOwnedMatters: janek.currentLifeView().matters.length,
        upstreamCalls: upstream.mock.calls.length,
        origin: "authored_existing_relation_not_self_earned",
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not promote unrelated workshop objects into Janek's private concern", () => {
    const { world, runtime, janek, physicallyMove } = fixture(true, { x: 1_820, y: 800 });
    expect(world.attemptMaterialAction(MOVER, { kind: "pickup", objectId: UNRELATED }))
      .toMatchObject({ status: "succeeded", code: "picked_up" });
    physicallyMove({ x: 1_770, y: 785 });
    expect(world.attemptMaterialAction(MOVER, {
      kind: "place", objectId: UNRELATED, position: { x: 1_728, y: 785 },
    })).toMatchObject({ status: "succeeded", code: "placed" });
    const outcome = runtime.advanceOneWorldTick();
    expect(outcome.stewardshipRelevance["resident.janek"]).toBeUndefined();
    expect(janek.materialKnowledge?.snapshot().map((o) => o.objectId)).toEqual([ORIGINAL]);
    expect(janek.resident.pendingCognitionReasons()).toEqual([]);
    expect(janek.currentLifeView().matters).toEqual([]);
  });
});
