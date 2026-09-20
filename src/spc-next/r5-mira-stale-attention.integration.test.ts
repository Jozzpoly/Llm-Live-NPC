import { describe, expect, it, vi } from "vitest";
import { CAUSAL_STALE_RETRY_TICKS } from "./resident-causal-cognition-retry-policy";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  R5_IDA_ID,
  R5_MIRA_ID,
  R5_MIRA_SEMANTIC_REPLY,
  createR5MiraSemanticEscalationSlice,
} from "./r5-mira-semantic-escalation-slice";

const SPEECH_A = "Mira, odpowiesz mi, czy zostaniesz chwilę przy stole?";
const SPEECH_B = "Mira, jednak chwila — najpierw odpowiedz, czy słyszysz zmianę.";
const PROVIDER_LATENCY_BEFORE_NEW_ATTENTION = 60;
const STALE_RETRY_DELAY_TICKS = CAUSAL_STALE_RETRY_TICKS;

describe("R5-B stale provider answer after newer addressed attention", () => {
  it("rejects the old proposal, preserves both causal pressures and does not retry before the bounded stale window", async () => {
    const releases: Array<() => void> = [];
    const contexts: any[] = [];

    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body));
      contexts.push(structuredClone(context));
      await new Promise<void>((resolve) => releases.push(resolve));

      const originReasonId = context?.reasons?.[0]?.id;
      if (typeof originReasonId !== "string") {
        throw new Error("R5-B fixture provider received no exact cognition origin");
      }

      const proposal: ResidentLifeIntentProposal = {
        version: 1,
        commitmentDecision: {
          kind: "accept",
          reason: "answer the exact frozen addressed speech once",
          intent: {
            kind: "communicate",
            goal: "answer Ida once from the frozen provider frame",
            targetActorId: R5_IDA_ID,
            targetRegionId: null,
            targetPosition: null,
            text: R5_MIRA_SEMANTIC_REPLY,
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

    // A becomes the exact first in-flight semantic frame.
    slice.idaAddressMira(SPEECH_A);
    slice.advanceOneWorldTick();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.reasons).toHaveLength(1);
    const reasonA = contexts[0].reasons[0];
    expect(reasonA).toMatchObject({ kind: "heard_speech" });
    const attentionA = slice.mira.cognitionRevision().attention;

    for (let index = 0; index < PROVIDER_LATENCY_BEFORE_NEW_ATTENTION; index += 1) {
      slice.advanceOneWorldTick();
    }
    expect(slice.diagnostics().providerRequestCount).toBe(1);
    expect(slice.life.matterScope.matterIds()).toEqual([]);

    // B arrives while provider A is still in flight. This must make A's semantic
    // judgement stale without itself being lost.
    slice.idaAddressMira(SPEECH_B);
    slice.advanceOneWorldTick();

    const attentionB = slice.mira.cognitionRevision().attention;
    expect(attentionB).toBe(attentionA + 1);
    const pendingBeforeACompletes = slice.mira.pendingCognitionReasons();
    expect(pendingBeforeACompletes).toHaveLength(1);
    const reasonB = pendingBeforeACompletes[0]!;
    expect(reasonB).toMatchObject({
      kind: "heard_speech",
      summary: expect.stringContaining(SPEECH_B),
    });
    expect(reasonB.id).not.toBe(reasonA.id);
    expect(slice.life.matterScope.matterIds()).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Let A complete. Arrival remains inert until the next World boundary.
    expect(releases).toHaveLength(1);
    releases[0]!();
    await flushMicrotasks();

    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 1,
      providerInFlightRequestId: null,
      providerInboxCount: 1,
      matterIds: [],
      focusedRunId: null,
    });

    const staleBoundary = slice.advanceOneWorldTick();
    expect(staleBoundary.admissions).toHaveLength(1);
    expect(staleBoundary.admissions[0]).toMatchObject({
      status: "stale",
      residentId: R5_MIRA_ID,
      reason: "newer_addressed_attention",
    });

    // The frozen A proposal must have created no commitment or World reply.
    expect(slice.life.matterScope.matterIds()).toEqual([]);
    expect(slice.life.focus.focusedRun()).toBeNull();
    expect(slice.world.diagnostics().recentOccurrences.filter(
      (occurrence) => occurrence.kind === "speech"
        && occurrence.actorId === R5_MIRA_ID
        && occurrence.text === R5_MIRA_SEMANTIC_REPLY,
    )).toHaveLength(0);

    // Stale A is requeued and B remains independently unresolved.
    const pendingAfterStale = slice.mira.pendingCognitionReasons();
    expect(pendingAfterStale.map((reason) => reason.id).sort()).toEqual(
      [reasonA.id, reasonB.id].sort(),
    );
    expect(slice.mira.semanticPressureLifecycleSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: expect.objectContaining({ id: reasonA.id }),
        status: "pending",
        detail: "cognition batch returned unresolved",
      }),
      expect.objectContaining({
        reason: expect.objectContaining({ id: reasonB.id }),
        status: "pending",
      }),
    ]));

    // Important anti-hot-loop boundary. Provider A had already been in flight longer
    // than the scheduler's urgent min interval, so scheduler cadence alone cannot
    // protect this edge. A stale admission needs a fresh retry-not-before window.
    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 1,
      providerRetryNotBeforeTick: slice.world.tick + STALE_RETRY_DELAY_TICKS,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    for (let index = 0; index < STALE_RETRY_DELAY_TICKS - 1; index += 1) {
      slice.advanceOneWorldTick();
      expect(slice.diagnostics().providerRequestCount).toBe(1);
    }

    slice.advanceOneWorldTick();
    expect(slice.diagnostics().providerRequestCount).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(contexts).toHaveLength(2);

    const retryReasonIds = contexts[1].reasons.map((reason: any) => reason.id).sort();
    expect(retryReasonIds).toEqual([reasonA.id, reasonB.id].sort());
    expect(slice.life.matterScope.matterIds()).toEqual([]);
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}
