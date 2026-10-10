import { describe, expect, it, vi } from "vitest";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import {
  R5_IDA_ID,
  R5_MIRA_ID,
  createR5MiraSemanticEscalationSlice,
} from "./r5-mira-semantic-escalation-slice";

const PROMISE_TEXT = "Tak, zostanę przy tobie jeszcze chwilę.";
const PROMISE_GOAL = "pozostać dostępną dla Idy jeszcze przez chwilę";
const PROMISE_MEANING = "Zobowiązałam się wobec Idy, że pozostanę z nią jeszcze chwilę.";
const EXECUTION_GUARD = 480;

describe("R6 resident-originated standing social commitment", () => {
  it("materializes only after exact factual self speech, persists without body authority, and can be privately released", async () => {
    const { slice, speechOccurrence, prepared, invalidPrepared, duplicatePrepared } = await runPromisedReply();

    const resolvedSpeechMatter = slice.life.currentLifeView().matters[0];
    expect(resolvedSpeechMatter).toMatchObject({
      status: "resolved",
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: R5_IDA_ID,
        text: PROMISE_TEXT,
      },
      activeRun: null,
    });
    expect(slice.life.currentLifeView().matters).toHaveLength(1);

    // A prepared semantic capability still cannot create history from a fabricated
    // occurrence. The invalid attempt is single-use.
    expect(() => slice.life.originatedSocialCommitments.materializeAfterFactualSpeech(
      invalidPrepared,
      "occurrence:does-not-exist",
    )).toThrow("standing social commitment lacks exact factual resident speech origin");

    const materialized = slice.life.originatedSocialCommitments.materializeAfterFactualSpeech(
      prepared,
      speechOccurrence.id,
    );

    expect(materialized.originEvidence).toMatchObject({
      tick: speechOccurrence.tick,
      kind: "resident_originated_social_commitment",
    });
    expect(materialized.matter).toMatchObject({
      status: "active",
      activeRunId: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: PROMISE_GOAL,
        counterpartyActorId: R5_IDA_ID,
        commitment: PROMISE_MEANING,
      },
    });

    const lifeWithCommitment = slice.life.currentLifeView();
    expect(lifeWithCommitment.matters).toHaveLength(2);
    expect(lifeWithCommitment.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: materialized.matter.id,
        status: "active",
        semanticIntent: {
          kind: "standing_social_commitment",
          goal: PROMISE_GOAL,
          counterpartyActorId: R5_IDA_ID,
          commitment: PROMISE_MEANING,
        },
        activeRun: null,
      }),
    ]));
    expect(lifeWithCommitment.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(slice.life.focus.focusedRun()).toBeNull();
    expect(slice.life.arbitrator.deferredRunIds()).toEqual([]);

    const snapshot = slice.life.snapshotCommittedLife();
    expect(snapshot.execution).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(snapshot.kernel.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: materialized.matter.id,
        status: "active",
        activeRunId: null,
        semanticIntent: {
          kind: "standing_social_commitment",
          goal: PROMISE_GOAL,
          counterpartyActorId: R5_IDA_ID,
          commitment: PROMISE_MEANING,
        },
      }),
    ]));

    expect(() => slice.life.originatedSocialCommitments.materializeAfterFactualSpeech(
      duplicatePrepared,
      speechOccurrence.id,
    )).toThrow("standing social commitment already exists");

    const beforeReleaseOccurrences = slice.world.diagnostics().recentOccurrences.length;
    const released = slice.life.originatedSocialCommitments.release({
      matterId: materialized.matter.id,
      tick: slice.world.tick,
      reason: "Mira no longer treats this standing commitment as open.",
    });

    expect(released.releaseEvidence).toMatchObject({
      kind: "resident_released_social_commitment",
      tick: slice.world.tick,
    });
    expect(released.matter).toMatchObject({
      id: materialized.matter.id,
      status: "resolved",
      activeRunId: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        counterpartyActorId: R5_IDA_ID,
      },
    });
    expect(slice.life.currentLifeView().body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(slice.world.diagnostics().recentOccurrences).toHaveLength(beforeReleaseOccurrences);

    // Private release changes resident continuity only. It does not manufacture a
    // World occurrence claiming that Ida released Mira or that some external promise
    // condition was objectively fulfilled.
    expect(slice.world.diagnostics().recentOccurrences.some(
      (occurrence) => occurrence.tick === released.releaseEvidence.tick
        && occurrence.summary.includes("released"),
    )).toBe(false);
  });

  it("survives committed snapshot reconstruction as private standing history without body authority", async () => {
    const { slice, speechOccurrence, prepared } = await runPromisedReply();
    const materialized = slice.life.originatedSocialCommitments.materializeAfterFactualSpeech(
      prepared,
      speechOccurrence.id,
    );

    const committed = slice.life.snapshotCommittedLife();
    const restoredKernel = new ResidentContinuityKernel({
      committedSnapshot: committed.kernel,
    });
    const restoredFocus = new ResidentExecutionFocusAuthority(restoredKernel);
    const restoredArbitrator = new ResidentExecutionArbitrator(restoredKernel, restoredFocus);
    const restoredLife = captureResidentLifeCognitionView({
      kernel: restoredKernel,
      focus: restoredFocus,
      arbitrator: restoredArbitrator,
      matterIds: committed.matterIds,
    });

    expect(restoredLife.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: materialized.matter.id,
        status: "active",
        semanticIntent: {
          kind: "standing_social_commitment",
          goal: PROMISE_GOAL,
          counterpartyActorId: R5_IDA_ID,
          commitment: PROMISE_MEANING,
        },
        activeRun: null,
      }),
    ]));
    expect(restoredLife.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(restoredKernel.originEvidence(materialized.matter.id)).toMatchObject({
      kind: "resident_originated_social_commitment",
      sourceRunId: prepared.sourceRunId,
    });
  });

  it("rejects preparation that does not match the exact live communicate matter and rejects forged capabilities", async () => {
    const { slice, speechOccurrence, sourceMatterId } = await runPromisedReply();

    // Once factual execution is over the source communicate matter is terminal, so
    // no retrospective semantic capability can be minted from the speech.
    expect(() => slice.life.originatedSocialCommitments.prepareFromCommunicateMatter({
      sourceMatterId,
      expectedSpeechText: PROMISE_TEXT,
      counterpartyActorId: R5_IDA_ID,
      goal: PROMISE_GOAL,
      commitment: PROMISE_MEANING,
    })).toThrow("standing social commitment preparation requires one exact active communicate matter/run");

    expect(() => slice.life.originatedSocialCommitments.materializeAfterFactualSpeech({
      residentId: R5_MIRA_ID,
      sourceMatterId,
      sourceRunId: "run.forged",
      sourceSemanticRevision: 1,
      counterpartyActorId: R5_IDA_ID,
      expectedSpeechText: PROMISE_TEXT,
      goal: PROMISE_GOAL,
      commitment: PROMISE_MEANING,
    }, speechOccurrence.id)).toThrow("standing social commitment lacks exact prepared semantic authority");
  });
});

async function runPromisedReply() {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const context = JSON.parse(String(init?.body));
    const originReasonId = context?.reasons?.[0]?.id;
    if (typeof originReasonId !== "string") {
      throw new Error("R6 promise fixture provider received no exact origin reason");
    }

    const proposal: ResidentLifeIntentProposal = {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "Ida addressed me directly and I choose to make one explicit social commitment.",
        intent: {
          kind: "communicate",
          goal: "tell Ida that I will remain with her for a while",
          targetActorId: R5_IDA_ID,
          targetRegionId: null,
          targetPosition: null,
          text: PROMISE_TEXT,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };

    return new Response(JSON.stringify({
      ok: true,
      originReasonId,
      proposal,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const slice = createR5MiraSemanticEscalationSlice(fetcher);
  slice.advanceOneWorldTick();
  slice.idaAddressMira();
  slice.advanceOneWorldTick();
  await flushMicrotasks();
  expect(fetcher).toHaveBeenCalledTimes(1);

  const admission = slice.advanceOneWorldTick().admissions[0];
  if (!admission || admission.status !== "applied" || !admission.commitment) {
    throw new Error("R6 promise fixture did not admit communicate matter");
  }

  const sourceMatterId = admission.commitment.matterId;
  const prepare = () => slice.life.originatedSocialCommitments.prepareFromCommunicateMatter({
    sourceMatterId,
    expectedSpeechText: PROMISE_TEXT,
    counterpartyActorId: R5_IDA_ID,
    goal: PROMISE_GOAL,
    commitment: PROMISE_MEANING,
  });
  const prepared = prepare();
  const invalidPrepared = prepare();
  const duplicatePrepared = prepare();

  for (let index = 0; index < EXECUTION_GUARD; index += 1) {
    slice.advanceOneWorldTick();
    if (slice.life.kernel.matter(admission.commitment.matterId)?.status === "resolved") break;
  }
  expect(slice.life.kernel.matter(admission.commitment.matterId)?.status).toBe("resolved");

  const occurrences = slice.world.diagnostics().recentOccurrences.filter(
    (occurrence) => occurrence.kind === "speech"
      && occurrence.actorId === R5_MIRA_ID
      && occurrence.text === PROMISE_TEXT
      && occurrence.addressedActorIds.includes(R5_IDA_ID),
  );
  expect(occurrences).toHaveLength(1);

  return {
    slice,
    speechOccurrence: occurrences[0]!,
    sourceMatterId,
    prepared,
    invalidPrepared,
    duplicatePrepared,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    await Promise.resolve();
  }
}
