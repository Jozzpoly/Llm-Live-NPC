import { describe, expect, it } from "vitest";
import { distanceSquared, type ResidentActivity, type Vec2 } from "./contracts";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalCommunicateCommitmentAuthority } from "./resident-causal-communicate-commitment";
import { ResidentCausalTravelCommitmentAuthority } from "./resident-causal-travel-commitment";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";

const IDA_ID = "resident.ida";
const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const MAX_STEPS = 1_500;

describe("resident life matter scope across heterogeneous causal authorities", () => {
  it("lets one Ida life view discover both travel and social matters without manual authority unions", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];

    establishJanekIdentityAndReturn(world, ida);
    movePlayerNear(world, actorPosition(world, IDA_ID));

    const kernel = new ResidentContinuityKernel();
    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const worldAuthority = new ResidentWorldExecutionAuthority(IDA_ID, arbitrator, world);
    const owner = new ResidentLifeIntentOwner(ida);
    const scope = new ResidentLifeMatterScope(kernel);
    const travel = new ResidentCausalTravelCommitmentAuthority({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation: createFiveResidentNavigationGraph(),
      kernel,
      arbitrator,
      authority: worldAuthority,
      matterScope: scope,
    });
    const communicate = new ResidentCausalCommunicateCommitmentAuthority({
      residentId: IDA_ID,
      resident: ida,
      world,
      kernel,
      arbitrator,
      authority: worldAuthority,
      matterScope: scope,
    });

    const travelOccurrence = world.speak(
      PLAYER_ID,
      "Ida, zajrzyj później do znajomego warsztatu.",
      420,
      [IDA_ID],
    );
    world.step();
    const travelAttempt = prepare(owner, ida, world.tick, currentLife(kernel, focus, arbitrator, scope));
    const travelProposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "accept a bounded workshop visit",
        intent: {
          kind: "travel" as const,
          goal: "visit the familiar workshop",
          targetActorId: null,
          targetRegionId: "workshop",
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };
    const travelSettlement = owner.settleCommitmentIntent(
      travelAttempt,
      travelProposal,
      currentLife(kernel, focus, arbitrator, scope),
      world.tick,
      (proposal, providerContext) => travel.groundPrivateSpeechCommitment({
        attempt: travelAttempt,
        occurrence: travelOccurrence,
        proposal,
        providerContext,
        groundingContext: ida.cognitionContext(travelAttempt.batch),
      }),
    );
    expect(travelSettlement.status).toBe("applied");
    if (travelSettlement.status !== "applied") return;
    const acceptedTravel = travel.materializePrivateSpeechCommitment({
      attempt: travelAttempt,
      occurrence: travelOccurrence,
      proposal: travelSettlement.proposal,
      intent: travelSettlement.intent,
    });
    expect(scope.matterIds()).toEqual([acceptedTravel.matter.id]);
    expect(acceptedTravel.focusClaim).toEqual({
      status: "acquired",
      runId: acceptedTravel.runId,
    });

    const message = "Please check the field well before dusk.";
    const socialOccurrence = world.speak(
      PLAYER_ID,
      `Ida, tell Janek exactly: "${message}"`,
      420,
      [IDA_ID],
    );
    world.step();
    const socialAttempt = prepare(owner, ida, world.tick, currentLife(kernel, focus, arbitrator, scope));
    expect(socialAttempt.context.life.matters.map((matter) => matter.id)).toEqual([
      acceptedTravel.matter.id,
    ]);

    const socialProposal = {
      version: 1 as const,
      commitmentDecision: {
        kind: "accept" as const,
        reason: "accept responsibility for the exact message",
        intent: {
          kind: "communicate" as const,
          goal: "deliver the accepted message to Janek",
          targetActorId: JANEK_ID,
          targetRegionId: null,
          targetPosition: null,
          text: message,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };
    const socialSettlement = owner.settleCommitmentIntent(
      socialAttempt,
      socialProposal,
      currentLife(kernel, focus, arbitrator, scope),
      world.tick,
      (proposal, providerContext) => communicate.groundPrivateSpeechCommitment({
        attempt: socialAttempt,
        occurrence: socialOccurrence,
        proposal,
        providerContext,
        groundingContext: ida.cognitionContext(socialAttempt.batch),
      }),
    );
    expect(socialSettlement.status).toBe("applied");
    if (socialSettlement.status !== "applied") return;
    const acceptedSocial = communicate.materializePrivateSpeechCommitment({
      attempt: socialAttempt,
      occurrence: socialOccurrence,
      proposal: socialSettlement.proposal,
      intent: socialSettlement.intent,
    });

    const expectedMatterIds = [acceptedTravel.matter.id, acceptedSocial.matter.id]
      .sort((left, right) => left.localeCompare(right));
    expect(scope.matterIds()).toEqual(expectedMatterIds);
    expect(travel.acceptedMatterIds()).toEqual(expectedMatterIds);
    expect(communicate.acceptedMatterIds()).toEqual(expectedMatterIds);

    const life = currentLife(kernel, focus, arbitrator, scope);
    expect(life.matters.map((matter) => matter.id)).toEqual(expectedMatterIds);
    expect(life.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: acceptedTravel.matter.id,
        semanticIntent: expect.objectContaining({ kind: "travel_region" }),
      }),
      expect.objectContaining({
        id: acceptedSocial.matter.id,
        semanticIntent: expect.objectContaining({ kind: "communicate_actor" }),
      }),
    ]));
    expect(life.body.focusedRunId).toBe(acceptedTravel.runId);
    expect(life.body.deferredRunIds).toEqual([acceptedSocial.runId]);
  });
});

function currentLife(
  kernel: ResidentContinuityKernel,
  focus: ResidentExecutionFocusAuthority,
  arbitrator: ResidentExecutionArbitrator,
  scope: ResidentLifeMatterScope,
) {
  return captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: scope.matterIds(),
  });
}

function prepare(
  owner: ResidentLifeIntentOwner,
  resident: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
  tick: number,
  life: ReturnType<typeof currentLife>,
) {
  let batch = resident.takeCognitionBatch(tick);
  let currentTick = tick;
  for (let step = 0; step < 240 && !batch; step += 1) {
    currentTick += 1;
    batch = resident.takeCognitionBatch(currentTick);
  }
  if (!batch) throw new Error("Ida cognition never became ready");
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("Ida life intent attempt was not prepared");
  return attempt;
}

function establishJanekIdentityAndReturn(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  ida: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
) {
  world.setResidentActivity(
    IDA_ID,
    travelActivity("scope-contact", actorPosition(world, JANEK_ID), "legally meet Janek"),
  );
  for (let step = 0; step < MAX_STEPS; step += 1) {
    world.step();
    if (knownJanek(ida, world.tick)?.currentlyVisible) break;
    if (step === MAX_STEPS - 1) throw new Error("Ida never acquired Janek identity");
  }

  const home = { x: 3_050, y: 880 };
  world.setResidentActivity(
    IDA_ID,
    travelActivity("scope-return", home, "return to crossroads after contact"),
  );
  for (let step = 0; step < MAX_STEPS; step += 1) {
    world.step();
    if (distanceSquared(actorPosition(world, IDA_ID), home) <= 20 ** 2) {
      world.setResidentActivity(IDA_ID, idleActivity("scope-idle"));
      world.step();
      return;
    }
  }
  throw new Error("Ida never returned after contact");
}

function knownJanek(
  ida: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.ida"],
  tick: number,
) {
  return ida.cognitionContext({
    residentId: IDA_ID,
    requestedAtTick: tick,
    reasons: [],
  }).knownActors.find((actor) => actor.id === JANEK_ID) ?? null;
}

function movePlayerNear(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  target: Vec2,
) {
  for (let step = 0; step < 900; step += 1) {
    const current = actorPosition(world, PLAYER_ID);
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 120) {
      world.setActorMotionIntent(PLAYER_ID, { x: 0, y: 0 });
      world.step();
      return;
    }
    world.setActorMotionIntent(PLAYER_ID, {
      x: (dx / distance) * 150,
      y: (dy / distance) * 150,
    });
    world.step();
  }
  throw new Error("player never physically reached Ida");
}

function actorPosition(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  actorId: string,
): Vec2 {
  const actor = world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`missing actor ${actorId}`);
  return { ...actor.position };
}

function travelActivity(id: string, targetPosition: Vec2, reason: string): ResidentActivity {
  return {
    id: `activity:${id}`,
    kind: "travel",
    targetActorId: null,
    targetPosition: { ...targetPosition },
    text: null,
    speed: 110,
    reason,
  };
}

function idleActivity(id: string): ResidentActivity {
  return {
    id: `activity:${id}`,
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "hold resident near player",
  };
}
