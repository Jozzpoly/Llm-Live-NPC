import { describe, expect, it, vi } from "vitest";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  R5_IDA_ID,
  R5_MIRA_ID,
  createR5MiraSemanticEscalationSlice,
} from "./r5-mira-semantic-escalation-slice";

const PROMISE_TEXT = "Tak, zostanę przy tobie jeszcze chwilę.";
const PROMISE_GOAL = "pozostać dostępną dla Idy jeszcze przez chwilę";
const PROMISE_MEANING = "Zobowiązałam się wobec Idy, że pozostanę z nią jeszcze chwilę.";
const EXECUTION_GUARD = 600;

describe("R6-B native life-intent standing social continuation", () => {
  it("carries declared future social meaning through normal admission and materializes it only after factual self speech", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body));
      const originReasonId = context?.reasons?.[0]?.id;
      if (typeof originReasonId !== "string") {
        throw new Error("R6-B provider fixture received no exact origin reason");
      }

      const proposal: ResidentLifeIntentProposal = {
        version: 1,
        commitmentDecision: {
          kind: "accept",
          reason: "Ida addressed me directly and I deliberately make one future social commitment.",
          intent: {
            kind: "communicate",
            goal: "tell Ida that I will remain with her for a while",
            targetActorId: R5_IDA_ID,
            targetRegionId: null,
            targetPosition: null,
            text: PROMISE_TEXT,
          },
          standingSocialCommitment: {
            goal: PROMISE_GOAL,
            commitment: PROMISE_MEANING,
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
    expect(slice.diagnostics().providerInboxCount).toBe(1);

    const admitted = slice.advanceOneWorldTick().admissions[0];
    expect(admitted).toMatchObject({
      status: "applied",
      residentId: R5_MIRA_ID,
      decision: "accept",
      commitment: {
        matterId: expect.any(String),
        runId: expect.any(String),
      },
    });
    if (!admitted || admitted.status !== "applied" || !admitted.commitment) {
      throw new Error("R6-B expected admitted communicate commitment");
    }

    const sourceMatter = slice.life.kernel.matter(admitted.commitment.matterId);
    expect(sourceMatter).toMatchObject({
      status: "active",
      activeRunId: admitted.commitment.runId,
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: R5_IDA_ID,
        text: PROMISE_TEXT,
        standingSocialCommitment: {
          goal: PROMISE_GOAL,
          commitment: PROMISE_MEANING,
        },
      },
    });

    // The declaration is resident-owned before speech, but no standing history exists
    // merely because provider output was admitted.
    expect(slice.life.currentLifeView().matters.filter(
      (matter) => matter.semanticIntent?.kind === "standing_social_commitment",
    )).toEqual([]);

    for (let index = 0; index < EXECUTION_GUARD; index += 1) {
      slice.advanceOneWorldTick();
      if (slice.life.kernel.matter(admitted.commitment.matterId)?.status === "resolved") break;
    }

    expect(slice.life.kernel.matter(admitted.commitment.matterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });

    const speeches = slice.world.diagnostics().recentOccurrences.filter(
      (occurrence) => occurrence.kind === "speech"
        && occurrence.actorId === R5_MIRA_ID
        && occurrence.text === PROMISE_TEXT
        && occurrence.addressedActorIds.includes(R5_IDA_ID),
    );
    expect(speeches).toHaveLength(1);

    const standing = slice.life.currentLifeView().matters.filter(
      (matter) => matter.semanticIntent?.kind === "standing_social_commitment",
    );
    expect(standing).toHaveLength(1);
    expect(standing[0]).toMatchObject({
      status: "active",
      activeRun: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: PROMISE_GOAL,
        counterpartyActorId: R5_IDA_ID,
        commitment: PROMISE_MEANING,
      },
      originEvidence: {
        kind: "resident_originated_social_commitment",
        sourceRunId: admitted.commitment.runId,
      },
    });
    expect(slice.life.currentLifeView().body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    await Promise.resolve();
  }
}
