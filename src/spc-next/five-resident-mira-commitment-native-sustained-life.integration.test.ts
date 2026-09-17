import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";
import { ResidentLifeIntentLiveHost } from "./resident-life-intent-live-host";

const WORKSHOP = MIRA_CAUSAL_COMMITMENTS[1]!;
const FIELDS = MIRA_CAUSAL_COMMITMENTS[2]!;
const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_GUARD = 1_200;
const FIELDS_DESTINATION = { x: 2_250, y: 2_450 } as const;

afterEach(() => vi.unstubAllGlobals());

describe("Mira commitment-native sustained life", () => {
  it("keeps A embodied during cognition, creates causal B, finishes A, then returns to and physically completes B", async () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    const acceptedA = slice.acceptPlayerRequest(WORKSHOP);
    expect(acceptedA.focusClaim).toEqual({ status: "acquired", runId: WORKSHOP.runId });

    let guard = 0;
    while (miraPosition(slice).x < 1_080 && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_GUARD);
    const beforeSpeech = miraPosition(slice);

    const occurrence = slice.world.speak(
      PLAYER_ID,
      FIELDS.requestText,
      REQUEST_RADIUS,
      [MIRA_ID],
    );

    let prepared: ReturnType<typeof slice.takeReadyLifeIntentAttempt> = null;
    guard = 0;
    while (!prepared && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      prepared = slice.takeReadyLifeIntentAttempt();
      guard += 1;
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;
    expect(prepared.attempt.context.life.body.focusedRunId).toBe(WORKSHOP.runId);
    expect(prepared.attempt.context.recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: occurrence.id,
      phenomenon: "speech",
      addressed: true,
    }));

    let releaseProvider!: (response: Response) => void;
    const providerGate = new Promise<Response>((resolve) => { releaseProvider = resolve; });
    const upstreamFetch = vi.fn(async () => providerGate);
    vi.stubGlobal("fetch", upstreamFetch);

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

    // A is not paused merely because higher cognition is pending.
    guard = 0;
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
    expect(miraPosition(slice)).not.toEqual(beforeSpeech);

    const proposal = commitmentProposal();
    releaseProvider(openAiResponse(proposal));
    const arrival = await requestPromise;
    expect(arrival.status).toBe("proposal");
    expect(upstreamFetch).toHaveBeenCalledTimes(1);

    const admission = host.admitCommitment(
      arrival,
      slice.world.tick,
      slice.currentLifeView(),
      (admittedProposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
        prepared,
        occurrence,
        FIELDS,
        admittedProposal,
        providerContext,
      ),
    );
    expect(admission.status).toBe("applied");
    if (admission.status !== "applied") return;

    // Admission uses the current Workshop region, not the old provider frame.
    expect(admission.settlement.intent.routeRegionIds).toEqual(["workshop", "fields"]);
    expect(admission.settlement.intent.semanticIntent).toEqual({
      kind: "travel_region",
      goal: FIELDS.semanticCourse,
      targetRegionId: FIELDS.targetRegionId,
    });
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);

    const acceptedB = slice.materializeAdmittedPlayerCommitmentRequest(
      prepared,
      occurrence,
      FIELDS,
      admission.settlement.proposal,
      admission.settlement.intent,
    );
    const matterB = acceptedB.matter.id;
    const runB = acceptedB.runId;
    expect(matterB).toBe(`matter.mira.causal.${occurrence.id}`);
    expect(runB).toBe(`run.mira.causal.${occurrence.id}.semantic-1`);
    expect(matterB).not.toBe(FIELDS.matterId);
    expect(runB).not.toBe(FIELDS.runId);
    expect(acceptedB.focusClaim).toEqual({
      status: "busy",
      runId: runB,
      focusedRunId: WORKSHOP.runId,
    });
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);
    expect(slice.arbitrator.deferredRunIds()).toEqual([runB]);

    // Only factual completion of A frees the body; B then returns from durable life.
    const completedA = slice.completeFocusedMatter(WORKSHOP.matterId);
    expect(completedA.arbitration).toEqual({
      status: "acquired_deferred",
      runId: runB,
    });
    expect(slice.kernel.matter(WORKSHOP.matterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.kernel.matter(matterB)).toMatchObject({
      status: "active",
      activeRunId: runB,
      semanticIntent: {
        kind: "travel_region",
        targetRegionId: "fields",
      },
    });
    expect(slice.focus.focusedRun()).toBe(runB);

    const beforeB = miraPosition(slice);
    const completedB = slice.completeFocusedMatter(matterB);
    const afterB = miraPosition(slice);
    expect(afterB).not.toEqual(beforeB);
    expect(completedB).toMatchObject({
      matterId: matterB,
      runId: runB,
      arbitration: { status: "idle" },
    });
    expect(completedB.outcomeEvidence.summary).toContain("fields");
    expect(slice.kernel.matter(matterB)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.kernel.runBinding(runB)).toBeNull();
    expect(slice.focus.focusedRun()).toBeNull();
    expect(Math.hypot(
      afterB.x - FIELDS_DESTINATION.x,
      afterB.y - FIELDS_DESTINATION.y,
    )).toBeLessThanOrEqual(18);
  });
});

function commitmentProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "accept the addressed fields request as a later continuing commitment",
      intent: {
        kind: "travel",
        goal: FIELDS.semanticCourse,
        targetActorId: null,
        targetRegionId: FIELDS.targetRegionId,
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
    id: "resp_mira_commitment_native_sustained_life",
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
    usage: { input_tokens: 260, output_tokens: 60, total_tokens: 320 },
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
