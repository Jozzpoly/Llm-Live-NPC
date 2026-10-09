import { describe, expect, it } from "vitest";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { FiveResidentCausalCognitionHost } from "./five-resident-causal-cognition-host";
import { createFiveResidentRegionComposition } from "./five-resident-region";

const CRATE = "crate.workshop.01";
const MOVER = "player.stale-arrival-material-mover";

describe("R6 resident-private material purpose versus delayed higher-cognition arrival", () => {
  it("rejects a valid-but-obsolete proposal after factual restoration of its only initiating reason", () => {
    const composition = createFiveResidentRegionComposition();
    const world = composition.world;
    const crate = world.materialObject(CRATE);
    if (!crate || crate.location.kind !== "free") throw new Error("crate missing");
    world.addPlayer(MOVER, crate.location.position, { maxSpeed: 100_000 });
    const runtime = new FiveResidentCausalLifeRuntime(composition, {
      materialStewardships: { "resident.janek": [CRATE] },
    });
    const host = new FiveResidentCausalCognitionHost(runtime);
    const janek = runtime.life("resident.janek");
    if (!janek) throw new Error("Janek was not claimed");

    expect(world.attemptMaterialAction(MOVER, { kind: "pickup", objectId: CRATE }).status)
      .toBe("succeeded");
    move(runtime, world, { x: 2_090, y: 800 });
    expect(world.attemptMaterialAction(MOVER, {
      kind: "place", objectId: CRATE, position: { x: 2_122, y: 800 },
    }).status).toBe("succeeded");
    runtime.advanceOneWorldTick();

    const activeReason = janek.resident.pendingCognitionReasons();
    expect(activeReason).toHaveLength(1);
    for (let i = 0; i < 30; i += 1) runtime.advanceOneWorldTick();
    host.collectReadyBatches();
    const request = host.startReadyRequests().find((r) => r.residentId === "resident.janek");
    expect(request).toBeDefined();
    if (!request) throw new Error("no dispatched Janek request");
    expect(request.batch.reasons.some((r) => r.id === activeReason[0]!.id)).toBe(true);

    // Actual World state changes while external model is "thinking".
    // The returned proposal is intentionally a TEST-SUPPLIED stale candidate,
    // NEVER presented as a real model or autonomous resident choice.
    expect(world.attemptMaterialAction(MOVER, { kind: "pickup", objectId: CRATE }).status)
      .toBe("succeeded");
    move(runtime, world, { x: 1_952, y: 720 });
    expect(world.attemptMaterialAction(MOVER, {
      kind: "place", objectId: CRATE, position: { x: 1_952, y: 720 },
    }).status).toBe("succeeded");
    const restored = runtime.advanceOneWorldTick().stewardshipRelevance["resident.janek"];
    expect(restored).toEqual([expect.objectContaining({
      status: "restored", reasonId: activeReason[0]!.id, settled: true,
    })]);
    expect(janek.resident.pendingCognitionReasons()).toEqual([]);

    // Would otherwise be syntactically and privately grounded: hearth is
    // familiar, but the selected pressure is now known to be settled.
    const staleDecision = {
      version: 1,
      commitmentDecision: { kind: "accept", reason: "go check the workshop", intent: {
        kind: "travel",
        goal: "visit known hearth",
        targetActorId: null,
        targetRegionId: "hearth",
        targetPosition: null,
        text: null,
      } },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };
    const result = host.settleCommitment(request, staleDecision, activeReason[0]!.id);
    expect(result).toMatchObject({
      status: "stale",
      residentId: "resident.janek",
      reason: "semantic_pressure_changed_during_request",
    });
    expect(janek.resident.pendingCognitionReasons()).toEqual([]);
    expect(janek.currentLifeView().matters).toEqual([]);
    expect(host.state().inFlightResidents).toEqual([]);
    expect(world.diagnostics().recentMaterialActions.filter((a) => a.actorId === "resident.janek"))
      .toEqual([]);
  });
});

function move(runtime: FiveResidentCausalLifeRuntime, world: FiveResidentCausalLifeRuntime["world"], to: {x:number;y:number}) {
  const actor = world.publicSnapshot().actors.find((a) => a.id === MOVER);
  if (!actor) throw new Error("mover missing");
  const dt = world.options.fixedDeltaSeconds;
  world.setActorMotionIntent(MOVER, { x: (to.x-actor.position.x)/dt, y: (to.y-actor.position.y)/dt });
  runtime.advanceOneWorldTick();
  world.setActorMotionIntent(MOVER, { x: 0, y: 0 });
  const reached = world.publicSnapshot().actors.find((a) => a.id === MOVER);
  expect(reached?.position).toEqual(to);
}
