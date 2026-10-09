import { describe, expect, it } from "vitest";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentMaterialStewardshipRelevance } from "./resident-material-stewardship-relevance";

const CRATE = "crate.workshop.01";
const MOVER = "player.authored-circumstance";
const AWAY = { x: 2_090, y: 800 };
const RETURN = { x: 1_952, y: 720 };

describe("R6 situated lived-stake research — authored conditions, not authored resident decisions", () => {
  it("the same factual displacement is inert without a personal stake, but yields exactly one private semantic question with one", () => {
    const without = setup(false);
    displaceByActualPlayerActions(without);
    expect(without.life.materialKnowledge?.observation(CRATE)).toMatchObject({
      currentlyVisible: true, lastKnownPosition: { x: 2_122, y: 800 },
    });
    expect(without.life.resident.pendingCognitionReasons()).toEqual([]);

    const withStake = setup(true);
    displaceByActualPlayerActions(withStake);
    const observed = withStake.stewardship!.observePrivateAfterWorldTick();
    expect(observed.status).toBe("needs_judgement");
    if (observed.status !== "needs_judgement") throw new Error("expected private stake significance");
    const reasons = withStake.life.resident.pendingCognitionReasons();
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      id: observed.reasonId,
      kind: "uncertainty",
      evidenceIds: expect.arrayContaining([observed.evidenceId]),
    });
    expect(reasons[0]!.evidenceIds).toHaveLength(2); // authored relation + observed displacement
    expect(withStake.life.kernel.recentEvidenceSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: observed.evidenceId, kind: "private_material_displacement" }),
    ]));

    // Repeated private sight is NOT repeated semantic pressure or a cognition treadmill.
    for (let tick = 0; tick < 120; tick += 1) {
      withStake.runtime.advanceOneWorldTick();
      expect(withStake.stewardship!.observePrivateAfterWorldTick().status).toBe("unchanged");
    }
    expect(withStake.life.resident.pendingCognitionReasons()).toHaveLength(1);
    expect(withStake.life.currentLifeView().matters).toHaveLength(0);
    expect(without.life.currentLifeView().matters).toHaveLength(0);

    // Real runtime cognition authority can now receive the exact event-based
    // question. No mock model answer is attributed to Janek; no body action.
    const request = withStake.runtime.takeReadyLifeIntentAttempts()
      .find((entry) => entry.residentId === "resident.janek");
    expect(request).toBeDefined();
    expect(request?.batch.reasons.some((reason) => reason.id === observed.reasonId)).toBe(true);
    expect(request?.prepared.attempt.context.reasons.some((reason) => reason.id === observed.reasonId)).toBe(true);
    expect(withStake.world.materialObject(CRATE)).toMatchObject({
      location: { kind: "free", position: { x: 2_122, y: 800 } },
    });
    expect(withStake.world.diagnostics().recentOccurrences.filter((event) =>
      event.actorId === "resident.janek" && event.kind === "speech",
    )).toEqual([]);
    console.info("SPC_LIVED_STAKE_CONTRAST", JSON.stringify({
      actualWorldActions: withStake.world.diagnostics().recentMaterialActions.length,
      withoutStakeReasons: without.life.resident.pendingCognitionReasons().length,
      withStakeReasonId: observed.reasonId,
      residentMatterCount: withStake.life.currentLifeView().matters.length,
      modelCalls: 0,
    }));
  });

  it("a witnessed return to the remembered workstation place settles the unresolved question without semantic polling", () => {
    const fixture = setup(true);
    displaceByActualPlayerActions(fixture);
    const question = fixture.stewardship!.observePrivateAfterWorldTick();
    expect(question.status).toBe("needs_judgement");
    if (question.status !== "needs_judgement") throw new Error("initial question missing");

    expect(fixture.world.attemptMaterialAction(MOVER, { kind: "pickup", objectId: CRATE }).status)
      .toBe("succeeded");
    movePlayerOneTick(fixture, RETURN);
    const movedPosition = playerPosition(fixture);
    expect(fixture.world.attemptMaterialAction(MOVER, {
      kind: "place",
      objectId: CRATE,
      position: movedPosition,
    }).status).toBe("succeeded");
    fixture.runtime.advanceOneWorldTick();
    const resolved = fixture.stewardship!.observePrivateAfterWorldTick();
    expect(resolved).toMatchObject({ status: "restored", reasonId: question.reasonId, settled: true });
    expect(fixture.life.resident.pendingCognitionReasons()).toEqual([]);
    expect(fixture.life.currentLifeView().matters).toEqual([]);
    expect(fixture.world.materialObject(CRATE)?.location).toMatchObject({
      kind: "free", position: RETURN,
    });
  });

  it("does not infer hidden material change from omniscient World state", () => {
    const fixture = setup(true);
    const pickup = fixture.world.attemptMaterialAction(MOVER, { kind: "pickup", objectId: CRATE });
    expect(pickup.status).toBe("succeeded");
    movePlayerOneTick(fixture, { x: 3_000, y: 720 });
    const farPosition = playerPosition(fixture);
    expect(fixture.world.attemptMaterialAction(MOVER, {
      kind: "place", objectId: CRATE, position: farPosition,
    }).status).toBe("succeeded");
    fixture.runtime.advanceOneWorldTick();
    expect(fixture.life.materialKnowledge?.observation(CRATE)?.currentlyVisible).toBe(false);
    expect(fixture.stewardship!.observePrivateAfterWorldTick()).toEqual({
      status: "unseen", reasonId: null,
    });
    expect(fixture.life.resident.pendingCognitionReasons()).toEqual([]);
  });
});

function setup(withStewardship: boolean) {
  const composition = createFiveResidentRegionComposition();
  const world = composition.world;
  const first = world.materialObject(CRATE);
  if (!first || first.location.kind !== "free") throw new Error("factual crate missing");
  world.addPlayer(MOVER, first.location.position, { maxSpeed: 100_000 });
  const runtime = new FiveResidentCausalLifeRuntime(composition);
  const life = runtime.life("resident.janek");
  if (!life) throw new Error("Janek must be claimed at construction");
  const stewardship = withStewardship
    ? new ResidentMaterialStewardshipRelevance(life, CRATE) : null;
  stewardship?.primeFromPrivateSight();
  return { world, runtime, life, stewardship };
}

function displaceByActualPlayerActions(fixture: ReturnType<typeof setup>) {
  expect(fixture.world.attemptMaterialAction(MOVER, { kind: "pickup", objectId: CRATE }).status)
    .toBe("succeeded");
  movePlayerOneTick(fixture, AWAY);
  const newPosition = playerPosition(fixture);
  expect(fixture.world.attemptMaterialAction(MOVER, {
    kind: "place", objectId: CRATE, position: { x: newPosition.x + 32, y: newPosition.y },
  }).status).toBe("succeeded");
  fixture.runtime.advanceOneWorldTick();
}

function playerPosition(fixture: ReturnType<typeof setup>) {
  const actor = fixture.world.publicSnapshot().actors.find((a) => a.id === MOVER);
  if (!actor) throw new Error("physical player missing");
  return actor.position;
}

function movePlayerOneTick(fixture: ReturnType<typeof setup>, target: { x: number; y: number }) {
  const before = playerPosition(fixture);
  const dt = fixture.world.options.fixedDeltaSeconds;
  fixture.world.setActorMotionIntent(MOVER, {
    x: (target.x - before.x) / dt, y: (target.y - before.y) / dt,
  });
  fixture.runtime.advanceOneWorldTick();
  fixture.world.setActorMotionIntent(MOVER, { x: 0, y: 0 });
  expect(playerPosition(fixture)).toEqual(target);
}
