import { describe, expect, it } from "vitest";
import { FiveResidentCausalCognitionHost } from "./five-resident-causal-cognition-host";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

const MIRA_ID = "resident.mira";
const PLAYER_ID = "player.jozz";

describe("five-resident generic addressed interruption", () => {
  it("suspends one exact causal run, acknowledges locally, then restores the same binding", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 700, y: 700 },
    });
    const runtime = new FiveResidentCausalLifeRuntime(composition);
    const cognition = new FiveResidentCausalCognitionHost(runtime, 5);

    let guard = 0;
    while (runtime.claimedResidentIds().length < 5 && guard < 1_500) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(1_500);
    while (runtime.world.tick < 2_400) runtime.advanceOneWorldTick();

    cognition.collectReadyBatches();
    const requests = cognition.startReadyRequests();
    const request = requests.find((candidate) => candidate.residentId === MIRA_ID);
    expect(request).toBeDefined();
    if (!request) return;

    const origin = request.batch.reasons.find((reason) => reason.kind === "activity_completed")
      ?? request.batch.reasons.find((reason) => reason.kind !== "heard_speech");
    expect(origin).toBeDefined();
    if (!origin) return;

    const settlement = cognition.settleCommitment(
      request,
      workshopProposal(),
      origin.id,
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied" || !settlement.commitment) return;

    for (const other of requests) {
      if (other === request) continue;
      cognition.abandon(other, 1_000);
    }

    const life = runtime.life(MIRA_ID);
    expect(life).not.toBeNull();
    if (!life) return;

    const mainMatterId = settlement.commitment.matterId;
    const mainRunId = settlement.commitment.runId;
    const bindingBefore = life.kernel.runBinding(mainRunId);
    expect(bindingBefore).not.toBeNull();
    expect(life.focus.focusedRun()).toBe(mainRunId);

    // Let the ordinary run physically own several frames before contact.
    for (let step = 0; step < 6; step += 1) {
      expect(runtime.advanceOneWorldTick().execution[MIRA_ID]).toMatchObject({
        status: "running",
        matterId: mainMatterId,
        runId: mainRunId,
      });
    }

    const player = runtime.world.publicSnapshot().actors.find((actor) => actor.id === PLAYER_ID);
    const mira = runtime.world.publicSnapshot().actors.find((actor) => actor.id === MIRA_ID);
    expect(player).toBeDefined();
    expect(mira).toBeDefined();
    if (!player || !mira) return;
    expect(Math.hypot(mira.position.x - player.position.x, mira.position.y - player.position.y))
      .toBeLessThanOrEqual(420);

    const speech = runtime.world.speak(
      PLAYER_ID,
      "Mira, chwila!",
      420,
      [MIRA_ID],
    );

    // One shared World boundary delivers the private percept and starts the local
    // interruption for the next execution frame.
    runtime.advanceOneWorldTick();
    const percept = runtime.world.residentDiagnostics(MIRA_ID).recentPercepts.find(
      (candidate) => candidate.occurrenceId === speech.id
        && candidate.phenomenon === "speech"
        && candidate.addressed,
    );
    expect(percept).toBeDefined();

    const active = runtime.interruption(MIRA_ID)?.current();
    expect(active).toMatchObject({
      status: "active",
      mainMatterId,
      mainRunId,
      responseOccurrenceId: null,
    });
    if (!active) return;

    expect(life.kernel.matter(mainMatterId)).toMatchObject({
      status: "suspended",
      activeRunId: mainRunId,
      suspendedByMatterId: active.interruptMatterId,
    });
    expect(life.kernel.runBinding(mainRunId)).toEqual(bindingBefore);
    expect(life.kernel.canRunMutateWorld(mainRunId)).toBe(false);
    expect(life.focus.focusedRun()).toBe(active.interruptRunId);

    const responded = runtime.advanceOneWorldTick();
    expect(responded.interruptions[MIRA_ID]).toMatchObject({
      status: "responded",
      interruption: {
        mainRunId,
        interruptRunId: active.interruptRunId,
      },
    });
    const responseOccurrence = runtime.world.diagnostics().recentOccurrences.find(
      (occurrence) => occurrence.kind === "speech"
        && occurrence.actorId === MIRA_ID
        && occurrence.text === "Tak?",
    );
    expect(responseOccurrence).toBeDefined();

    guard = 0;
    while (runtime.interruption(MIRA_ID)?.current() && guard < 40) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(40);
    expect(runtime.interruption(MIRA_ID)?.current()).toBeNull();

    expect(life.kernel.matter(active.interruptMatterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(life.kernel.matter(mainMatterId)).toMatchObject({
      status: "active",
      activeRunId: mainRunId,
      suspendedByMatterId: null,
    });
    expect(life.kernel.runBinding(mainRunId)).toEqual(bindingBefore);
    expect(life.kernel.canRunMutateWorld(mainRunId)).toBe(true);
    expect(life.focus.focusedRun()).toBe(mainRunId);

    const beforeResume = runtime.world.publicSnapshot().actors.find(
      (actor) => actor.id === MIRA_ID,
    )!.position;
    expect(runtime.advanceOneWorldTick().execution[MIRA_ID]).toMatchObject({
      status: "running",
      matterId: mainMatterId,
      runId: mainRunId,
    });
    const afterResume = runtime.world.publicSnapshot().actors.find(
      (actor) => actor.id === MIRA_ID,
    )!.position;
    expect(afterResume).not.toEqual(beforeResume);
  });
});

function workshopProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "continue settlement continuity at the familiar workshop",
      intent: {
        kind: "travel",
        goal: "go to the familiar workshop",
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
}
