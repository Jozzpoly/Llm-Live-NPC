import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { createFiveResidentMiraCausalMultiMatterSlice } from "./five-resident-mira-causal-multi-matter-slice";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import { ResidentLifeIntentLiveHost } from "./resident-life-intent-live-host";

const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const PLAYER_POSITION = { x: 700, y: 700 } as const;
const MAX_GUARD = 2_000;

const WORKSHOP_REQUEST =
  "Mira, kiedy będziesz mogła, zajrzyj proszę do znanego ci warsztatu i sprawdź, czy wszystko jest w porządku.";
const WORKSHOP_REASON = "accept the workshop check as a continuing commitment";
const WORKSHOP_GOAL = "inspect the familiar workshop and make sure it is all right";

const HEARTH_REQUEST =
  "Mira, po warsztacie wróć proszę do znajomego paleniska i sprawdź je jeszcze raz.";
const HEARTH_REASON = "accept the later hearth check as a continuing commitment";
const HEARTH_GOAL = "return to the familiar hearth and check it";

afterEach(() => vi.unstubAllGlobals());

describe("Mira fixture-free one-thread sustained life falsifier", () => {
  it("survives causal A -> async causal B -> A completion -> B interruption -> exact B return -> factual B completion", async () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();

    // A itself is born through the commitment-native path from empty resident life.
    const aOrigin = slice.world.speak(
      PLAYER_ID,
      WORKSHOP_REQUEST,
      REQUEST_RADIUS,
      [MIRA_ID],
    );
    slice.world.step();
    let preparedA = slice.takeReadyLifeIntentAttempt();
    for (let step = 0; step < 180 && !preparedA; step += 1) {
      slice.world.step();
      preparedA = slice.takeReadyLifeIntentAttempt();
    }
    expect(preparedA).not.toBeNull();
    if (!preparedA) return;

    const settlementA = slice.lifeIntentOwner.settleCommitmentIntent(
      preparedA.attempt,
      workshopProposal(),
      slice.currentLifeView(),
      slice.world.tick,
      (proposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
        preparedA,
        aOrigin,
        proposal,
        providerContext,
      ),
    );
    expect(settlementA.status).toBe("applied");
    if (settlementA.status !== "applied") return;

    const acceptedA = slice.materializeAdmittedPlayerCommitmentRequest(
      preparedA,
      aOrigin,
      settlementA.proposal,
      settlementA.intent,
    );
    const matterA = acceptedA.matter.id;
    const runA = acceptedA.runId;
    expect(matterA).toBe(`matter.mira.causal.${aOrigin.id}`);
    expect(runA).toBe(`run.mira.causal.${aOrigin.id}.semantic-1`);
    expect(acceptedA.focusClaim).toEqual({ status: "acquired", runId: runA });

    for (let step = 0; step < 6; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        matterId: matterA,
        runId: runA,
      });
    }

    // B arises as a new causal pressure while A is materially in progress.
    const bOrigin = slice.world.speak(
      PLAYER_ID,
      HEARTH_REQUEST,
      REQUEST_RADIUS,
      [MIRA_ID],
    );
    let preparedB: ReturnType<typeof slice.takeReadyLifeIntentAttempt> = null;
    for (let step = 0; step < 180 && !preparedB; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        matterId: matterA,
        runId: runA,
      });
      preparedB = slice.takeReadyLifeIntentAttempt();
    }
    expect(preparedB).not.toBeNull();
    if (!preparedB) return;
    expect(preparedB.attempt.context.currentRegionId).toBe("hearth");
    expect(preparedB.attempt.context.life.body.focusedRunId).toBe(runA);
    expect(preparedB.attempt.context.life.matters).toContainEqual(expect.objectContaining({
      id: matterA,
      status: "active",
      activeRun: expect.objectContaining({
        runId: runA,
        bodyState: "focused",
        canMutateWorld: true,
      }),
    }));

    let releaseProvider!: (response: Response) => void;
    const providerGate = new Promise<Response>((resolve) => { releaseProvider = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => providerGate));

    const limiter = { async limit() { return { success: true }; } };
    const env = {
      AI: { async run() { return {}; } },
      AI_PROBE_LIMITER: limiter,
      HEARTH_COGNITION_LIMITER: limiter,
      OPENAI_API_KEY: "test-key",
      SPC_NEXT_LIFE_INTENT_MODEL: "gpt-5.6-luna",
      SPC_NEXT_LIFE_INTENT_REASONING: "low",
      SPC_NEXT_LIFE_INTENT_MAX_OUTPUT_TOKENS: "1024",
    };
    const host = new ResidentLifeIntentLiveHost(
      slice.lifeIntentOwner,
      "/api/spc-next/life-intent",
      async (input, init) => worker.fetch(
        new Request(new URL(String(input), "https://worker.test"), init),
        env,
      ),
    );

    let providerSettled = false;
    const requestPromise = host.request(preparedB.attempt).then((arrival) => {
      providerSettled = true;
      return arrival;
    });
    await Promise.resolve();
    await Promise.resolve();

    let guard = 0;
    while (slice.privateContext().currentRegionId !== "workshop" && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        matterId: matterA,
        runId: runA,
      });
      expect(slice.focus.focusedRun()).toBe(runA);
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_GUARD);
    expect(providerSettled).toBe(false);

    releaseProvider(openAiResponse(hearthProposal()));
    const arrival = await requestPromise;
    expect(arrival.status).toBe("proposal");

    const admissionB = host.admitCommitment(
      arrival,
      slice.world.tick,
      slice.currentLifeView(),
      (proposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
        preparedB,
        bOrigin,
        proposal,
        providerContext,
      ),
    );
    expect(admissionB.status).toBe("applied");
    if (admissionB.status !== "applied") return;
    expect(admissionB.settlement.intent.routeRegionIds).toEqual(["workshop", "hearth"]);

    const acceptedB = slice.materializeAdmittedPlayerCommitmentRequest(
      preparedB,
      bOrigin,
      admissionB.settlement.proposal,
      admissionB.settlement.intent,
    );
    const matterB = acceptedB.matter.id;
    const runB = acceptedB.runId;
    expect(matterB).toBe(`matter.mira.causal.${bOrigin.id}`);
    expect(runB).toBe(`run.mira.causal.${bOrigin.id}.semantic-1`);
    expect(acceptedB.focusClaim).toEqual({
      status: "busy",
      runId: runB,
      focusedRunId: runA,
    });
    expect(slice.kernel.matter(matterA)).toMatchObject({
      status: "active",
      activeRunId: runA,
      semanticIntent: { kind: "travel_region", targetRegionId: "workshop" },
    });
    expect(slice.kernel.matter(matterB)).toMatchObject({
      status: "active",
      activeRunId: runB,
      semanticIntent: { kind: "travel_region", targetRegionId: "hearth" },
    });

    const completedA = slice.completeFocusedMatter(matterA);
    expect(completedA).toMatchObject({
      matterId: matterA,
      runId: runA,
      arbitration: { status: "acquired_deferred", runId: runB },
    });
    expect(completedA.outcomeEvidence.summary).toContain("workshop");
    expect(slice.focus.focusedRun()).toBe(runB);

    // B becomes embodied and eventually comes back within real hearing range.
    guard = 0;
    while (distance(miraPosition(slice), PLAYER_POSITION) > 280 && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        matterId: matterB,
        runId: runB,
      });
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_GUARD);
    const bindingBeforeInterrupt = slice.kernel.runBinding(runB);
    expect(bindingBeforeInterrupt).not.toBeNull();

    const call = slice.world.speak(
      PLAYER_ID,
      "Mira, chwila!",
      REQUEST_RADIUS,
      [MIRA_ID],
    );
    expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
      status: "running",
      matterId: matterB,
      runId: runB,
    });

    const heldPosition = miraPosition(slice);
    const interruption = slice.beginAddressedInterruption(call);
    expect(interruption).toMatchObject({
      status: "active",
      mainMatterId: matterB,
      mainRunId: runB,
    });
    expect(slice.kernel.matter(matterB)).toMatchObject({
      status: "suspended",
      activeRunId: runB,
      suspendedByMatterId: interruption.interruptMatterId,
    });
    expect(slice.kernel.runBinding(runB)).toEqual(bindingBeforeInterrupt);
    expect(slice.kernel.canRunMutateWorld(runB)).toBe(false);

    const responded = slice.advanceAddressedInterruptionOneWorldTick();
    expect(responded.status).toBe("responded");
    expect(miraPosition(slice)).toEqual(heldPosition);

    let resumed = false;
    guard = 0;
    while (!resumed && guard < 120) {
      const step = slice.advanceAddressedInterruptionOneWorldTick();
      expect(miraPosition(slice)).toEqual(heldPosition);
      resumed = step.status === "resumed";
      guard += 1;
    }
    expect(resumed).toBe(true);
    expect(guard).toBeLessThan(120);

    expect(slice.kernel.matter(matterB)).toMatchObject({
      status: "active",
      activeRunId: runB,
      suspendedByMatterId: null,
    });
    expect(slice.kernel.runBinding(runB)).toEqual(bindingBeforeInterrupt);
    expect(slice.kernel.canRunMutateWorld(runB)).toBe(true);
    expect(slice.focus.focusedRun()).toBe(runB);

    const resumedPosition = miraPosition(slice);
    expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
      status: "running",
      matterId: matterB,
      runId: runB,
    });
    expect(miraPosition(slice)).not.toEqual(resumedPosition);

    const completedB = slice.completeFocusedMatter(matterB);
    expect(completedB.runId).toBe(runB);
    expect(completedB.outcomeEvidence.summary).toContain("hearth");
    expect(completedB.arbitration).toEqual({ status: "idle" });
    expect(slice.kernel.matter(matterB)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.kernel.runBinding(runB)).toBeNull();
    expect(slice.focus.focusedRun()).toBeNull();
  });
});

function workshopProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: WORKSHOP_REASON,
      intent: {
        kind: "travel",
        goal: WORKSHOP_GOAL,
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

function hearthProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: HEARTH_REASON,
      intent: {
        kind: "travel",
        goal: HEARTH_GOAL,
        targetActorId: null,
        targetRegionId: "hearth",
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}

function openAiResponse(proposal: ResidentLifeIntentProposal): Response {
  return new Response(JSON.stringify({
    id: "resp_mira_fixture_free_one_thread",
    status: "completed",
    output: [
      { type: "reasoning" },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(proposal) }],
      },
    ],
    usage: { input_tokens: 300, output_tokens: 68, total_tokens: 368 },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function miraPosition(slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return { ...actor.position };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
