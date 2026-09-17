import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { createFiveResidentMiraCausalMultiMatterSlice } from "./five-resident-mira-causal-multi-matter-slice";
import { ResidentLifeIntentLiveHost } from "./resident-life-intent-live-host";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_REVIEW_STEPS = 300;

afterEach(() => vi.unstubAllGlobals());

describe("Mira self-origin outcome through live intent transport", () => {
  it("carries factual A outcome through Worker/provider transport while arrival and admission stay inert until local B materialization", async () => {
    const fixture = prepareCompletedWorkshopMatter();
    const { slice, acceptedA, completedA, preparedB } = fixture;
    const expectedMatterB = `matter.mira.causal.outcome:${completedA.outcomeEvidence.id}`;

    expect(preparedB.attempt.context.life.matters.find(
      (matter) => matter.id === acceptedA.matter.id,
    )).toMatchObject({
      status: "resolved",
      lastOutcomeEvidence: {
        id: completedA.outcomeEvidence.id,
        kind: "task_outcome",
        summary: completedA.outcomeEvidence.summary,
      },
    });

    const providerProposal = acceptTravel(
      "hearth",
      "return to the familiar hearth after completing the workshop visit",
      "the completed workshop outcome supports a bounded self-origin follow-up",
      30,
    );

    const upstream = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-5.6-luna");
      expect(body.store).toBe(false);
      const submitted = JSON.parse(body.input[0].content);
      const sourceMatter = submitted.life.matters.find(
        (matter: { id: string }) => matter.id === acceptedA.matter.id,
      );
      expect(sourceMatter).toMatchObject({
        status: "resolved",
        activeRun: null,
        lastOutcomeEvidence: {
          id: completedA.outcomeEvidence.id,
          kind: "task_outcome",
          summary: completedA.outcomeEvidence.summary,
        },
      });
      expect(submitted.life.body).toEqual({ focusedRunId: null, deferredRunIds: [] });
      return openAiLifeIntentResponse(providerProposal);
    });
    vi.stubGlobal("fetch", upstream);

    const limiter = { async limit() { return { success: true }; } };
    const env = {
      AI: { async run() { return {}; } },
      AI_PROBE_LIMITER: limiter,
      HEARTH_COGNITION_LIMITER: limiter,
      OPENAI_API_KEY: "test-key",
      SPC_NEXT_LIFE_INTENT_MODEL: "gpt-5.6-luna",
      SPC_NEXT_LIFE_INTENT_REASONING: "low",
      SPC_NEXT_LIFE_INTENT_MAX_OUTPUT_TOKENS: "512",
    };
    const host = new ResidentLifeIntentLiveHost(
      slice.lifeIntentOwner,
      "/api/spc-next/life-intent",
      async (input, init) => worker.fetch(
        new Request(new URL(String(input), "https://worker.test"), init),
        env,
      ),
    );

    expect(slice.kernel.matter(expectedMatterB)).toBeNull();
    expect(slice.focus.focusedRun()).toBeNull();

    const arrival = await host.request(preparedB.attempt);
    expect(arrival.status).toBe("proposal");
    expect(upstream).toHaveBeenCalledTimes(1);

    // Wall-clock/provider completion is inert.
    expect(slice.kernel.matter(expectedMatterB)).toBeNull();
    expect(slice.focus.focusedRun()).toBeNull();

    const admission = host.admitCommitment(
      arrival,
      slice.world.tick,
      slice.currentLifeView(),
      (proposal, providerContext) => slice.groundPreparedLifeOutcomeCommitment(
        preparedB,
        acceptedA.matter.id,
        proposal,
        providerContext,
      ),
    );
    expect(admission.status).toBe("applied");
    if (admission.status !== "applied") return;

    // Even admitted semantic meaning is not continuity/body authority.
    expect(slice.kernel.matter(expectedMatterB)).toBeNull();
    expect(slice.focus.focusedRun()).toBeNull();

    const acceptedB = slice.materializeAdmittedLifeOutcomeCommitment(
      preparedB,
      acceptedA.matter.id,
      admission.settlement.proposal,
      admission.settlement.intent,
    );
    expect(acceptedB.matter.id).toBe(expectedMatterB);
    expect(acceptedB.focusClaim).toEqual({ status: "acquired", runId: acceptedB.runId });
    expect(slice.focus.focusedRun()).toBe(acceptedB.runId);

    const completedB = slice.completeFocusedMatter(acceptedB.matter.id);
    expect(completedB.outcomeEvidence.summary).toContain("hearth");
    expect(slice.kernel.matter(expectedMatterB)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });
});

function prepareCompletedWorkshopMatter() {
  const slice = createFiveResidentMiraCausalMultiMatterSlice();
  const occurrence = slice.world.speak(
    PLAYER_ID,
    "Mira, zajrzyj proszę do znanego ci warsztatu.",
    REQUEST_RADIUS,
    [MIRA_ID],
  );
  slice.world.step();

  const preparedA = waitForLifeIntent(slice);
  const proposalA = acceptTravel(
    "workshop",
    "inspect the familiar workshop",
    "accept the workshop visit",
    1,
  );
  const settlementA = slice.lifeIntentOwner.settleCommitmentIntent(
    preparedA.attempt,
    proposalA,
    slice.currentLifeView(),
    slice.world.tick,
    (proposal, providerContext) => slice.groundPreparedPrivateSpeechCommitment(
      preparedA,
      occurrence,
      proposal,
      providerContext,
    ),
  );
  if (settlementA.status !== "applied") {
    throw new Error(`failed to establish source matter: ${settlementA.status}`);
  }
  const acceptedA = slice.materializeAdmittedPrivateSpeechCommitment(
    preparedA,
    occurrence,
    settlementA.proposal,
    settlementA.intent,
  );
  const completedA = slice.completeFocusedMatter(acceptedA.matter.id);
  const preparedB = waitForLifeIntent(slice);
  return { slice, acceptedA, completedA, preparedB };
}

function waitForLifeIntent(slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>) {
  for (let step = 0; step < MAX_REVIEW_STEPS; step += 1) {
    const prepared = slice.takeReadyLifeIntentAttempt();
    if (prepared) return prepared;
    slice.world.step();
  }
  throw new Error("Mira never reached a life cognition opportunity");
}

function acceptTravel(
  targetRegionId: "hearth" | "workshop" | "fields",
  goal: string,
  reason: string,
  reviewAfterSeconds: number,
): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason,
      intent: {
        kind: "travel",
        goal,
        targetActorId: null,
        targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds,
  };
}

function openAiLifeIntentResponse(proposal: ResidentLifeIntentProposal) {
  return new Response(JSON.stringify({
    id: "resp_mira_outcome_origin_followup",
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
    usage: { input_tokens: 640, output_tokens: 92, total_tokens: 732 },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
