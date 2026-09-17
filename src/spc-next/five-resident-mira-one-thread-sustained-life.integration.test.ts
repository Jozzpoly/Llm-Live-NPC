import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";
import { ResidentLifeIntentLiveHost } from "./resident-life-intent-live-host";

const HEARTH = MIRA_CAUSAL_COMMITMENTS[0]!;
const WORKSHOP = MIRA_CAUSAL_COMMITMENTS[1]!;
const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const PLAYER_POSITION = { x: 700, y: 700 } as const;
const MAX_GUARD = 2_000;

afterEach(() => vi.unstubAllGlobals());

describe("Mira one-thread sustained life falsifier", () => {
  it("survives A execution -> async B cognition -> causal B -> A completion -> B interruption -> exact B return -> factual B completion", async () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(WORKSHOP);

    for (let step = 0; step < 6; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
    }

    const bOrigin = slice.world.speak(
      PLAYER_ID,
      HEARTH.requestText,
      REQUEST_RADIUS,
      [MIRA_ID],
    );
    let prepared: ReturnType<typeof slice.takeReadyLifeIntentAttempt> = null;
    for (let step = 0; step < 180 && !prepared; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      prepared = slice.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;
    expect(prepared.attempt.context.currentRegionId).toBe("hearth");
    expect(prepared.attempt.context.life.body.focusedRunId).toBe(WORKSHOP.runId);

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
    const requestPromise = host.request(prepared.attempt).then((arrival) => {
      providerSettled = true;
      return arrival;
    });
    await Promise.resolve();
    await Promise.resolve();

    let guard = 0;
    while (slice.privateContext().currentRegionId !== "workshop" && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_GUARD);
    expect(providerSettled).toBe(false);

    releaseProvider(openAiResponse(commitmentProposal()));
    const arrival = await requestPromise;
    expect(arrival.status).toBe("proposal");

    const admission = host.admitCommitment(
      arrival,
      slice.world.tick,
      slice.currentLifeView(),
      (proposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
        prepared,
        bOrigin,
        proposal,
        providerContext,
      ),
    );
    expect(admission.status).toBe("applied");
    if (admission.status !== "applied") return;
    expect(admission.settlement.intent.routeRegionIds).toEqual(["workshop", "hearth"]);

    const acceptedB = slice.materializeAdmittedPlayerCommitmentRequest(
      prepared,
      bOrigin,
      admission.settlement.proposal,
      admission.settlement.intent,
    );
    const matterB = acceptedB.matter.id;
    const runB = acceptedB.runId;
    expect(matterB).toBe(`matter.mira.causal.${bOrigin.id}`);
    expect(runB).toBe(`run.mira.causal.${bOrigin.id}.semantic-1`);
    expect(acceptedB.focusClaim).toEqual({
      status: "busy",
      runId: runB,
      focusedRunId: WORKSHOP.runId,
    });

    const completedA = slice.completeFocusedMatter(WORKSHOP.matterId);
    expect(completedA.arbitration).toEqual({ status: "acquired_deferred", runId: runB });
    expect(slice.focus.focusedRun()).toBe(runB);

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

function commitmentProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "accept the addressed hearth request as a later continuing commitment",
      intent: {
        kind: "travel",
        goal: HEARTH.semanticCourse,
        targetActorId: null,
        targetRegionId: HEARTH.targetRegionId,
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
    id: "resp_mira_one_thread_sustained_life",
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
    usage: { input_tokens: 280, output_tokens: 64, total_tokens: 344 },
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
