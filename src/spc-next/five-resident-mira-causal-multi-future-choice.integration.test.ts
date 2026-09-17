import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { createFiveResidentMiraCausalMultiMatterSlice } from "./five-resident-mira-causal-multi-matter-slice";
import { ResidentLifeChoiceLiveHost } from "./resident-life-choice-live-host";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_PREPARE_STEPS = 180;
const MAX_REVIEW_STEPS = 180;

afterEach(() => vi.unstubAllGlobals());

describe("Mira fully causal multi-future life choice", () => {
  it("creates A/B/C without fixture identities, requires an explicit life choice, then executes the chosen and remaining matters factually", async () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();

    const a = acceptFirstCausalCommitment(
      slice,
      "Mira, kiedy będziesz mogła, zajrzyj do znanego ci warsztatu.",
      proposal("workshop", "inspect the familiar workshop", "accept the workshop matter"),
    );
    const matterA = a.matter.id;
    const runA = a.runId;
    expect(a.focusClaim).toEqual({ status: "acquired", runId: runA });

    const b = acceptCausalCommitmentWhileFocused(
      slice,
      matterA,
      runA,
      "Mira, później wróć proszę do znajomego paleniska.",
      proposal("hearth", "return to the familiar hearth", "accept the later hearth matter"),
    );
    const matterB = b.matter.id;
    const runB = b.runId;
    expect(b.focusClaim).toEqual({ status: "busy", runId: runB, focusedRunId: runA });

    const c = acceptCausalCommitmentWhileFocused(
      slice,
      matterA,
      runA,
      "Mira, sprawdź też później znajome pola.",
      proposal("fields", "inspect the familiar fields", "accept the later fields matter"),
    );
    const matterC = c.matter.id;
    const runC = c.runId;
    expect(c.focusClaim).toEqual({ status: "busy", runId: runC, focusedRunId: runA });

    expect(new Set([matterA, matterB, matterC]).size).toBe(3);
    expect(new Set([runA, runB, runC]).size).toBe(3);
    for (const [matterId, runId] of [[matterA, runA], [matterB, runB], [matterC, runC]] as const) {
      expect(matterId).toContain("matter.mira.causal.occurrence:");
      expect(runId).toContain(`run.mira.causal.${matterId.slice("matter.mira.causal.".length)}.semantic-1`);
      expect(slice.kernel.canRunMutateWorld(runId)).toBe(true);
    }

    const completedA = slice.completeFocusedMatter(matterA);
    const candidates = [runB, runC].sort((left, right) => left.localeCompare(right));
    expect(completedA.arbitration).toEqual({
      status: "choice_required",
      candidateRunIds: candidates,
    });
    expect(completedA.choiceReview).toEqual({
      status: "scheduled",
      candidateRunIds: candidates,
    });
    expect(slice.focus.focusedRun()).toBeNull();

    expect(slice.choiceReviewBridge.activeCandidateRunIds()).toEqual(candidates);
    const batch = waitForChoiceCognitionOpportunity(slice);
    expect(batch.reasons.length).toBeGreaterThan(0);
    const lifeAtChoice = slice.currentLifeView();
    expect(lifeAtChoice.body).toEqual({
      focusedRunId: null,
      deferredRunIds: candidates,
    });
    expect(lifeAtChoice.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: matterB,
        status: "active",
        activeRun: expect.objectContaining({ runId: runB, bodyState: "deferred", canMutateWorld: true }),
      }),
      expect.objectContaining({
        id: matterC,
        status: "active",
        activeRun: expect.objectContaining({ runId: runC, bodyState: "deferred", canMutateWorld: true }),
      }),
    ]));

    const owner = new ResidentLifeChoiceOwner(slice.mira);
    const attempt = owner.prepare(batch, lifeAtChoice);
    expect(attempt).not.toBeNull();
    if (!attempt) return;
    expect(attempt.candidateMatterIds).toEqual([matterB, matterC].sort((left, right) => left.localeCompare(right)));

    const limiter = { async limit() { return { success: true }; } };
    const upstream = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const focusSchema = body.text.format.schema.properties.decision.anyOf[0];
      const matterEnum = focusSchema.properties.matterId.enum;
      expect(matterEnum).toEqual(attempt.candidateMatterIds);
      expect(focusSchema.properties).not.toHaveProperty("runId");
      expect(focusSchema.properties).not.toHaveProperty("taskId");
      return openAiChoiceResponse({
        kind: "focus_matter",
        matterId: matterC,
        reason: "handle the accepted fields matter before the hearth matter",
        reviewAfterSeconds: 20,
      });
    });
    vi.stubGlobal("fetch", upstream);

    const env = {
      AI: { async run() { return {}; } },
      AI_PROBE_LIMITER: limiter,
      HEARTH_COGNITION_LIMITER: limiter,
      OPENAI_API_KEY: "test-key",
      SPC_NEXT_LIFE_CHOICE_MODEL: "gpt-5.6-luna",
      SPC_NEXT_LIFE_CHOICE_REASONING: "low",
      SPC_NEXT_LIFE_CHOICE_MAX_OUTPUT_TOKENS: "512",
    };
    const host = new ResidentLifeChoiceLiveHost(
      owner,
      "/api/spc-next/life-choice",
      async (input, init) => worker.fetch(
        new Request(new URL(String(input), "https://worker.test"), init),
        env,
      ),
    );

    const arrival = await host.request(attempt);
    expect(arrival.status).toBe("proposal");
    expect(upstream).toHaveBeenCalledTimes(1);

    // Provider/network completion has no body authority.
    expect(slice.focus.focusedRun()).toBeNull();
    expect(slice.arbitrator.deferredRunIds()).toEqual(candidates);

    const admitted = host.admit(arrival, slice.world.tick, slice.currentLifeView());
    expect(admitted).toMatchObject({
      status: "applied",
      settlement: { decision: { kind: "focus_matter", matterId: matterC } },
    });
    // Even admitted semantic preference is not execution authority.
    expect(slice.focus.focusedRun()).toBeNull();

    expect(slice.choose(runC)).toEqual({ status: "acquired", runId: runC });
    expect(slice.focus.focusedRun()).toBe(runC);
    expect(slice.arbitrator.deferredRunIds()).toEqual([runB]);

    const completedC = slice.completeFocusedMatter(matterC);
    expect(completedC.outcomeEvidence.summary).toContain("fields");
    expect(completedC.arbitration).toEqual({
      status: "acquired_deferred",
      runId: runB,
    });
    expect(slice.focus.focusedRun()).toBe(runB);

    const completedB = slice.completeFocusedMatter(matterB);
    expect(completedB.outcomeEvidence.summary).toContain("hearth");
    expect(completedB.arbitration).toEqual({ status: "idle" });
    expect(slice.kernel.matter(matterB)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(slice.kernel.matter(matterC)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(slice.focus.focusedRun()).toBeNull();
  });

  it("invalidates an in-flight B/C choice when addressed D becomes a new deferred future without letting D leapfrog", async () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();

    const a = acceptFirstCausalCommitment(
      slice,
      "Mira, zajrzyj do znanego ci warsztatu.",
      proposal("workshop", "inspect the familiar workshop", "accept workshop A"),
    );
    const matterA = a.matter.id;
    const runA = a.runId;

    const b = acceptCausalCommitmentWhileFocused(
      slice,
      matterA,
      runA,
      "Mira, później wróć do znajomego paleniska.",
      proposal("hearth", "return to the familiar hearth", "accept hearth B"),
    );
    const c = acceptCausalCommitmentWhileFocused(
      slice,
      matterA,
      runA,
      "Mira, później sprawdź znajome pola.",
      proposal("fields", "inspect the familiar fields", "accept fields C"),
    );
    const matterB = b.matter.id;
    const matterC = c.matter.id;
    const runB = b.runId;
    const runC = c.runId;

    const completedA = slice.completeFocusedMatter(matterA);
    const oldCandidates = [runB, runC].sort((left, right) => left.localeCompare(right));
    expect(completedA.arbitration).toEqual({
      status: "choice_required",
      candidateRunIds: oldCandidates,
    });
    expect(slice.focus.focusedRun()).toBeNull();

    const choiceBatch = waitForChoiceCognitionOpportunity(slice);
    const choiceOwner = new ResidentLifeChoiceOwner(slice.mira);
    const choiceAttempt = choiceOwner.prepare(choiceBatch, slice.currentLifeView());
    expect(choiceAttempt).not.toBeNull();
    if (!choiceAttempt) return;
    expect(choiceAttempt.candidateMatterIds).toEqual(
      [matterB, matterC].sort((left, right) => left.localeCompare(right)),
    );

    let releaseProvider!: (response: Response) => void;
    const pendingProvider = new Promise<Response>((resolve) => {
      releaseProvider = resolve;
    });
    const upstream = vi.fn(async () => pendingProvider);
    vi.stubGlobal("fetch", upstream);
    const limiter = { async limit() { return { success: true }; } };
    const env = {
      AI: { async run() { return {}; } },
      AI_PROBE_LIMITER: limiter,
      HEARTH_COGNITION_LIMITER: limiter,
      OPENAI_API_KEY: "test-key",
      SPC_NEXT_LIFE_CHOICE_MODEL: "gpt-5.6-luna",
      SPC_NEXT_LIFE_CHOICE_REASONING: "low",
      SPC_NEXT_LIFE_CHOICE_MAX_OUTPUT_TOKENS: "512",
    };
    const choiceHost = new ResidentLifeChoiceLiveHost(
      choiceOwner,
      "/api/spc-next/life-choice",
      async (input, init) => worker.fetch(
        new Request(new URL(String(input), "https://worker.test"), init),
        env,
      ),
    );

    const oldArrivalPromise = choiceHost.request(choiceAttempt);
    for (let step = 0; step < 20 && upstream.mock.calls.length === 0; step += 1) {
      await Promise.resolve();
    }
    expect(upstream).toHaveBeenCalledTimes(1);

    // While B/C choice cognition is genuinely in flight, the player physically
    // approaches Mira at Workshop before creating newer addressed pressure D.
    movePlayerNearMira(slice);
    const d = acceptCausalCommitmentWhileBodyFree(
      slice,
      "Mira, zanim skończysz dzień, wróć też później do znajomego warsztatu.",
      proposal("workshop", "return to the familiar workshop later", "accept newer workshop D"),
    );
    const matterD = d.matter.id;
    const runD = d.runId;
    expect(d.focusClaim).toEqual({ status: "deferred", runId: runD });
    expect(slice.focus.focusedRun()).toBeNull();

    const currentCandidates = [runB, runC, runD].sort((left, right) => left.localeCompare(right));
    expect(slice.arbitrator.deferredRunIds()).toEqual(currentCandidates);
    expect(slice.arbitrator.reconcile()).toEqual({
      status: "choice_required",
      candidateRunIds: currentCandidates,
    });
    expect(slice.choiceReviewBridge.activeCandidateRunIds()).toEqual(currentCandidates);

    releaseProvider(openAiChoiceResponse({
      kind: "focus_matter",
      matterId: matterC,
      reason: "old B/C frame preferred fields C",
      reviewAfterSeconds: 20,
    }));
    const oldArrival = await oldArrivalPromise;
    expect(oldArrival.status).toBe("proposal");

    const staleAdmission = choiceHost.admit(oldArrival, slice.world.tick, slice.currentLifeView());
    expect(staleAdmission).toEqual({
      status: "stale",
      admissionTick: slice.world.tick,
      settlement: { status: "stale", reason: "newer_addressed_attention" },
    });

    // The stale B/C answer must not focus C, D or any other run. Current B/C/D
    // ambiguity survives and requires a fresh current-life choice.
    expect(slice.focus.focusedRun()).toBeNull();
    expect(slice.arbitrator.deferredRunIds()).toEqual(currentCandidates);
    expect(slice.kernel.matter(matterD)).toMatchObject({
      status: "active",
      activeRunId: runD,
    });
  });
});

function acceptFirstCausalCommitment(
  slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>,
  text: string,
  cognition: ResidentLifeIntentProposal,
) {
  const occurrence = slice.world.speak(PLAYER_ID, text, REQUEST_RADIUS, [MIRA_ID]);
  slice.world.step();
  let prepared = slice.takeReadyLifeIntentAttempt();
  for (let step = 0; step < MAX_PREPARE_STEPS && !prepared; step += 1) {
    slice.world.step();
    prepared = slice.takeReadyLifeIntentAttempt();
  }
  if (!prepared) throw new Error("first causal commitment never reached cognition");

  const settlement = slice.lifeIntentOwner.settleCommitmentIntent(
    prepared.attempt,
    cognition,
    slice.currentLifeView(),
    slice.world.tick,
    (admittedProposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
      prepared,
      occurrence,
      admittedProposal,
      providerContext,
    ),
  );
  if (settlement.status !== "applied") {
    throw new Error(`first causal commitment settlement failed: ${settlement.status}`);
  }
  return slice.materializeAdmittedPlayerCommitmentRequest(
    prepared,
    occurrence,
    settlement.proposal,
    settlement.intent,
  );
}

function acceptCausalCommitmentWhileFocused(
  slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>,
  focusedMatterId: string,
  focusedRunId: string,
  text: string,
  cognition: ResidentLifeIntentProposal,
) {
  const occurrence = slice.world.speak(PLAYER_ID, text, REQUEST_RADIUS, [MIRA_ID]);
  let prepared: ReturnType<typeof slice.takeReadyLifeIntentAttempt> = null;
  for (let step = 0; step < MAX_PREPARE_STEPS && !prepared; step += 1) {
    const execution = slice.advanceFocusedMatterOneWorldTick();
    expect(execution).toMatchObject({ status: "running", matterId: focusedMatterId, runId: focusedRunId });
    prepared = slice.takeReadyLifeIntentAttempt();
  }
  if (!prepared) throw new Error("deferred causal commitment never reached cognition");

  const settlement = slice.lifeIntentOwner.settleCommitmentIntent(
    prepared.attempt,
    cognition,
    slice.currentLifeView(),
    slice.world.tick,
    (admittedProposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
      prepared,
      occurrence,
      admittedProposal,
      providerContext,
    ),
  );
  if (settlement.status !== "applied") {
    throw new Error(`deferred causal commitment settlement failed: ${settlement.status}`);
  }
  return slice.materializeAdmittedPlayerCommitmentRequest(
    prepared,
    occurrence,
    settlement.proposal,
    settlement.intent,
  );
}

function movePlayerNearMira(
  slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>,
) {
  for (let step = 0; step < 1_200; step += 1) {
    const snapshot = slice.world.publicSnapshot();
    const player = snapshot.actors.find((actor) => actor.id === PLAYER_ID);
    const mira = snapshot.actors.find((actor) => actor.id === MIRA_ID);
    if (!player || !mira) throw new Error("player/Mira body missing while approaching");

    const dx = mira.position.x - player.position.x;
    const dy = mira.position.y - player.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 180) {
      slice.world.setActorMotionIntent(PLAYER_ID, { x: 0, y: 0 });
      slice.world.step();
      return;
    }

    slice.world.setActorMotionIntent(PLAYER_ID, {
      x: (dx / distance) * 140,
      y: (dy / distance) * 140,
    });
    slice.world.step();
  }
  throw new Error("player never physically approached Mira for addressed D");
}

function acceptCausalCommitmentWhileBodyFree(
  slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>,
  text: string,
  cognition: ResidentLifeIntentProposal,
) {
  expect(slice.focus.focusedRun()).toBeNull();
  const occurrence = slice.world.speak(PLAYER_ID, text, REQUEST_RADIUS, [MIRA_ID]);
  let prepared: ReturnType<typeof slice.takeReadyLifeIntentAttempt> = null;
  for (let step = 0; step < MAX_PREPARE_STEPS && !prepared; step += 1) {
    slice.world.step();
    prepared = slice.takeReadyLifeIntentAttempt();
  }
  if (!prepared) throw new Error("free-body causal commitment never reached cognition");

  const settlement = slice.lifeIntentOwner.settleCommitmentIntent(
    prepared.attempt,
    cognition,
    slice.currentLifeView(),
    slice.world.tick,
    (admittedProposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
      prepared,
      occurrence,
      admittedProposal,
      providerContext,
    ),
  );
  if (settlement.status !== "applied") {
    throw new Error(`free-body causal commitment settlement failed: ${settlement.status}`);
  }
  return slice.materializeAdmittedPlayerCommitmentRequest(
    prepared,
    occurrence,
    settlement.proposal,
    settlement.intent,
  );
}

function waitForChoiceCognitionOpportunity(slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>) {
  // choice_required schedules a near-term quiet review as a fallback, but any earlier
  // truthful cognition pressure may carry the same higher-life decision. Do not throw
  // away real World-change reasons merely to wait for a synthetic quiet_review label.
  for (let step = 0; step < MAX_REVIEW_STEPS; step += 1) {
    const batch = slice.mira.takeCognitionBatch(slice.world.tick);
    if (batch) return batch;
    slice.world.step();
  }
  throw new Error("causal life ambiguity never reached a resident cognition opportunity");
}

function proposal(
  targetRegionId: "hearth" | "workshop" | "fields",
  goal: string,
  reason: string,
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
    reviewAfterSeconds: 30,
  };
}

function openAiChoiceResponse(decision: {
  kind: "focus_matter";
  matterId: string;
  reason: string;
  reviewAfterSeconds: number;
}) {
  return new Response(JSON.stringify({
    id: "resp_mira_causal_multi_future_choice",
    status: "completed",
    output: [
      { type: "reasoning" },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify({ version: 1, decision }) }],
      },
    ],
    usage: { input_tokens: 420, output_tokens: 42, total_tokens: 462 },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
