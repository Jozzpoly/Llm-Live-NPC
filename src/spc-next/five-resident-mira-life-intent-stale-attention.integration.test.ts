import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import type { ResidentCognitionProposal } from "./cognition-contract";
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
const MAX_TO_COGNITION = 120;

afterEach(() => vi.unstubAllGlobals());

describe("Mira resident-life intent stale attention", () => {
  it("cannot turn an arrived old provider answer into grounding or a matter after newer addressed attention", async () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(WORKSHOP);

    for (let step = 0; step < 6; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
    }

    const firstSpeech = slice.world.speak(PLAYER_ID, FIELDS.requestText, REQUEST_RADIUS, [MIRA_ID]);
    let prepared = null as ReturnType<typeof slice.takeReadyLifeIntentAttempt>;
    for (let step = 0; step < MAX_TO_COGNITION && !prepared; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      prepared = slice.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;
    expect(prepared.attempt.context.recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: firstSpeech.id,
      addressed: true,
    }));

    vi.stubGlobal("fetch", vi.fn(async () => openAiResponse(commitmentProposal(FIELDS))));
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

    const arrival = await host.request(prepared.attempt);
    expect(arrival).toMatchObject({
      status: "proposal",
      attemptId: prepared.attempt.id,
      residentId: MIRA_ID,
    });
    expect(slice.kernel.matter(FIELDS.matterId)).toBeNull();
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);

    // A newer addressed event changes private attention after the old provider answer
    // arrived but before explicit admission. The arrived semantic answer must now die
    // before local grounding and must never create a continuity capability.
    const newerSpeech = slice.world.speak(
      PLAYER_ID,
      "Mira, jednak moment — mam nową informację.",
      REQUEST_RADIUS,
      [MIRA_ID],
    );
    expect(newerSpeech.addressedActorIds).toContain(MIRA_ID);
    expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
      status: "running",
      runId: WORKSHOP.runId,
    });

    const grounding = vi.fn((proposal, providerContext) => slice.groundPreparedPlayerRequest(
      prepared,
      firstSpeech,
      FIELDS,
      proposal,
      providerContext,
    ));
    const admission = host.admit(
      arrival,
      slice.world.tick,
      slice.currentLifeView(),
      grounding,
    );

    expect(admission).toEqual({
      status: "stale",
      admissionTick: slice.world.tick,
      settlement: {
        status: "stale",
        reason: "newer_addressed_attention",
      },
    });
    expect(grounding).not.toHaveBeenCalled();
    expect(slice.kernel.matter(FIELDS.matterId)).toBeNull();
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);
    expect(slice.kernel.canRunMutateWorld(WORKSHOP.runId)).toBe(true);
    expect(slice.lifeIntentOwner.state().activeAttemptId).toBeNull();
    expect(host.pendingArrivals()).toBe(0);
    expect(host.recentAdmissions().at(-1)).toMatchObject({
      outcomeStatus: "stale",
      detail: "newer_addressed_attention",
    });
    expect(slice.mira.publicState().pendingCognitionReasonCount).toBeGreaterThan(0);
  });
});

function commitmentProposal(spec: typeof FIELDS): ResidentCognitionProposal {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: `accept the addressed ${spec.key} request as a continuing commitment`,
      activity: {
        kind: "travel",
        goal: spec.semanticCourse,
        targetActorId: null,
        targetRegionId: spec.targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}

function openAiResponse(proposal: ResidentCognitionProposal): Response {
  return new Response(JSON.stringify({
    id: "resp_mira_life_intent_stale_attention",
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
    usage: { input_tokens: 220, output_tokens: 54, total_tokens: 274 },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
