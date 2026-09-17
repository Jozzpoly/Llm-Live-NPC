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
const MAX_GUARD = 600;

afterEach(() => vi.unstubAllGlobals());

describe("Mira resident-life live intent vertical", () => {
  it("keeps A embodied during provider latency, accepts B as a later commitment, re-grounds from current life and materializes only the exact admitted capability", async () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(WORKSHOP);

    let guard = 0;
    while (miraPosition(slice).x < 1_080 && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({ status: "running", runId: WORKSHOP.runId });
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_GUARD);
    expect(slice.privateContext().currentRegionId).toBe("hearth");

    const occurrence = slice.world.speak(PLAYER_ID, FIELDS.requestText, REQUEST_RADIUS, [MIRA_ID]);
    let prepared = null as ReturnType<typeof slice.takeReadyLifeIntentAttempt>;
    guard = 0;
    while (!prepared && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({ status: "running", runId: WORKSHOP.runId });
      prepared = slice.takeReadyLifeIntentAttempt();
      guard += 1;
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;
    expect(prepared.attempt.context.currentRegionId).toBe("hearth");
    expect(prepared.attempt.context.life.body.focusedRunId).toBe(WORKSHOP.runId);

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

    let requestSettled = false;
    const requestPromise = host.request(prepared.attempt).then((arrival) => {
      requestSettled = true;
      return arrival;
    });
    await Promise.resolve();
    await Promise.resolve();

    // Higher cognition is in flight, but A remains factual resident execution.
    guard = 0;
    while (slice.privateContext().currentRegionId !== "workshop" && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({ status: "running", runId: WORKSHOP.runId });
      expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);
      expect(slice.kernel.canRunMutateWorld(WORKSHOP.runId)).toBe(true);
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_GUARD);
    expect(requestSettled).toBe(false);
    expect(host.pendingArrivals()).toBe(0);
    expect(slice.kernel.matter(FIELDS.matterId)).toBeNull();

    const providerProposal = commitmentProposal(FIELDS);
    releaseProvider(openAiResponse(providerProposal));
    const arrival = await requestPromise;
    expect(arrival).toMatchObject({
      status: "proposal",
      attemptId: prepared.attempt.id,
      residentId: MIRA_ID,
    });
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    expect(host.pendingArrivals()).toBe(1);

    // Arrival itself remains inert. A keeps exact body authority even for a later tick.
    expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({ status: "running", runId: WORKSHOP.runId });
    expect(slice.kernel.matter(FIELDS.matterId)).toBeNull();
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);

    const admission = host.admitCommitment(
      arrival,
      slice.world.tick,
      slice.currentLifeView(),
      (proposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
        prepared,
        occurrence,
        proposal,
        providerContext,
      ),
    );
    expect(admission.status).toBe("applied");
    if (admission.status !== "applied") return;

    // Accept is still semantic only: B does not exist until local materialization.
    expect(admission.settlement.proposal.commitmentDecision).toMatchObject({
      kind: "accept",
      intent: { kind: "travel", targetRegionId: FIELDS.targetRegionId },
    });
    expect(admission.settlement.intent.routeRegionIds).toEqual(["workshop", "fields"]);
    expect(admission.settlement.intent.semanticIntent).toEqual({
      kind: "travel_region",
      goal: FIELDS.semanticCourse,
      targetRegionId: FIELDS.targetRegionId,
    });
    expect(slice.kernel.matter(FIELDS.matterId)).toBeNull();
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);

    // Grounded intent identity is a capability. A structural clone must not create life.
    expect(() => slice.materializeAdmittedPlayerCommitmentRequest(
      prepared,
      occurrence,
      admission.settlement.proposal,
      structuredClone(admission.settlement.intent),
    )).toThrow(/exact admitted grounding authority/u);
    expect(slice.kernel.matter(FIELDS.matterId)).toBeNull();

    const acceptedB = slice.materializeAdmittedPlayerCommitmentRequest(
      prepared,
      occurrence,
      admission.settlement.proposal,
      admission.settlement.intent,
    );
    const localMatterId = `matter.mira.causal.${occurrence.id}`;
    const localRunId = `run.mira.causal.${occurrence.id}.semantic-1`;
    expect(acceptedB.context.currentRegionId).toBe("hearth");
    expect(acceptedB.routeRegionIds).toEqual(["workshop", "fields"]);
    expect(acceptedB.matter.id).toBe(localMatterId);
    expect(acceptedB.runId).toBe(localRunId);
    expect(acceptedB.focusClaim).toEqual({
      status: "busy",
      runId: localRunId,
      focusedRunId: WORKSHOP.runId,
    });
    expect(slice.kernel.matter(FIELDS.matterId)).toBeNull();
    expect(slice.kernel.runBinding(FIELDS.runId)).toBeNull();
    const matter = slice.kernel.matter(localMatterId);
    expect(matter).toMatchObject({
      status: "active",
      activeRunId: localRunId,
      semanticCourse: admittedSemanticCourse(providerProposal),
      semanticIntent: {
        kind: "travel_region",
        goal: FIELDS.semanticCourse,
        targetRegionId: FIELDS.targetRegionId,
      },
    });
    expect(matter?.semanticIntent).not.toHaveProperty("routeRegionIds");
    expect(matter?.semanticIntent).not.toHaveProperty("destination");
    expect(slice.arbitrator.deferredRunIds()).toEqual([localRunId]);
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);

    // Exact capability is one-shot; replay cannot duplicate the matter/run.
    expect(() => slice.materializeAdmittedPlayerCommitmentRequest(
      prepared,
      occurrence,
      admission.settlement.proposal,
      admission.settlement.intent,
    )).toThrow(/exact admitted grounding authority/u);
  });
});

function commitmentProposal(spec: typeof FIELDS): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: `accept the addressed ${spec.key} request as a later continuing commitment`,
      intent: {
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

function admittedSemanticCourse(proposal: ResidentLifeIntentProposal): string {
  const decision = proposal.commitmentDecision;
  if (decision.kind !== "accept") throw new Error("expected accepted commitment proposal");
  return `${decision.reason} · ${decision.intent.goal}`;
}

function openAiResponse(proposal: ResidentLifeIntentProposal): Response {
  return new Response(JSON.stringify({
    id: "resp_mira_life_intent_vertical",
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
    usage: { input_tokens: 240, output_tokens: 56, total_tokens: 296 },
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
