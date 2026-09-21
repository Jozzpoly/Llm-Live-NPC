import { describe, expect, it, vi } from "vitest";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  R5_IDA_ID,
  R5_MIRA_ID,
  createR5MiraSemanticEscalationSlice,
} from "./r5-mira-semantic-escalation-slice";

const ORDINARY_REPLY = "Dobrze, słyszę cię.";
const FUTURE_PROMISE_REPLY = "Tak, zostanę przy stole przez chwilę.";
const EXECUTION_GUARD = 480;

describe("R6-A current future-social-meaning gap characterization", () => {
  it("shows that ordinary acknowledgement and a future promise share the same durable lifecycle semantics after factual delivery", async () => {
    const ordinary = await runCommunicateOutcome(ORDINARY_REPLY);
    const promise = await runCommunicateOutcome(FUTURE_PROMISE_REPLY);

    // Both utterances are factually different World events.
    expect(ordinary.replyOccurrence.text).toBe(ORDINARY_REPLY);
    expect(promise.replyOccurrence.text).toBe(FUTURE_PROMISE_REPLY);
    expect(ordinary.replyOccurrence.text).not.toBe(promise.replyOccurrence.text);

    // But the resident continuity machine classifies both identically:
    // one communicate_actor matter whose run succeeds when the sentence is delivered.
    expect(structuralMatterShape(ordinary.matter)).toEqual(
      structuralMatterShape(promise.matter),
    );
    expect(structuralMatterShape(promise.matter)).toEqual({
      status: "resolved",
      semanticRevision: 1,
      semanticIntentKind: "communicate_actor",
      targetActorId: R5_IDA_ID,
      suspendedByMatterId: null,
      activeRunId: null,
      lastOutcomeSemanticRevision: 1,
    });

    // The promise survives only as opaque natural-language fields inside the already
    // resolved communicate matter/evidence. There is no second structured continuing
    // matter, run or lifecycle state representing "stay by the table".
    expect(ordinary.snapshot.matters).toHaveLength(1);
    expect(promise.snapshot.matters).toHaveLength(1);
    expect(promise.snapshot.runBindings).toEqual([]);
    expect(promise.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(promise.life.matters).toHaveLength(1);
    expect(promise.life.matters[0]).toMatchObject({
      status: "resolved",
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: R5_IDA_ID,
        text: FUTURE_PROMISE_REPLY,
      },
      activeRun: null,
    });

    // Terminal communicate responsibility is no longer open personhood pressure.
    // Exact source pressure was settled in both twins.
    expect(ordinary.semanticPressure.map(pressureShape)).toEqual(
      promise.semanticPressure.map(pressureShape),
    );
    expect(promise.semanticPressure).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: expect.objectContaining({ kind: "heard_speech" }),
        status: "settled",
      }),
    ]));

    // The committed-state schema has no promise/stay/social-contract primitive.
    // Its durable semantic category remains communicate_actor for both twins.
    expect(Object.keys(promise.snapshot).sort()).toEqual(
      Object.keys(ordinary.snapshot).sort(),
    );
    expect(promise.snapshot.matters.some((matter) => (
      matter.semanticIntent?.kind !== "communicate_actor"
    ))).toBe(false);
    expect(promise.snapshot.matters.some((matter) => (
      matter.status === "active" || matter.status === "suspended"
    ))).toBe(false);

    // The only semantically meaningful difference in the resident-owned committed
    // matter is provider-authored prose/text. No structured lifecycle field records
    // that the second sentence makes a future behavioral commitment.
    expect(ordinary.matter.semanticIntent?.kind).toBe("communicate_actor");
    expect(promise.matter.semanticIntent?.kind).toBe("communicate_actor");
    expect(ordinary.matter.semanticIntent?.text).toBe(ORDINARY_REPLY);
    expect(promise.matter.semanticIntent?.text).toBe(FUTURE_PROMISE_REPLY);
    expect(ordinary.matter.semanticCourse).not.toBe(promise.matter.semanticCourse);

    expect(ordinary.providerCalls).toBe(1);
    expect(promise.providerCalls).toBe(1);
  });
});

async function runCommunicateOutcome(replyText: string) {
  let originReasonId: string | null = null;

  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const context = JSON.parse(String(init?.body));
    originReasonId = context?.reasons?.[0]?.id ?? null;
    if (typeof originReasonId !== "string") {
      throw new Error("R6 characterization provider received no exact origin reason");
    }

    const proposal: ResidentLifeIntentProposal = {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "Ida addressed me directly and I choose to answer her.",
        intent: {
          kind: "communicate",
          goal: replyText === FUTURE_PROMISE_REPLY
            ? "tell Ida that I will stay by the table for a while"
            : "acknowledge Ida once",
          targetActorId: R5_IDA_ID,
          targetRegionId: null,
          targetPosition: null,
          text: replyText,
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

  const admission = slice.advanceOneWorldTick().admissions[0];
  expect(admission).toMatchObject({
    status: "applied",
    residentId: R5_MIRA_ID,
    decision: "accept",
    commitment: {
      matterId: expect.any(String),
      runId: expect.any(String),
    },
  });
  if (!admission || admission.status !== "applied" || !admission.commitment) {
    throw new Error("R6 characterization expected admitted communicate commitment");
  }

  const matterId = admission.commitment.matterId;
  let resolved = false;
  for (let index = 0; index < EXECUTION_GUARD && !resolved; index += 1) {
    slice.advanceOneWorldTick();
    resolved = slice.life.kernel.matter(matterId)?.status === "resolved";
  }
  expect(resolved).toBe(true);

  const matter = slice.life.kernel.matter(matterId);
  if (!matter) throw new Error("R6 characterization lost communicate matter");

  const replyOccurrences = slice.world.diagnostics().recentOccurrences.filter(
    (occurrence) => occurrence.kind === "speech"
      && occurrence.actorId === R5_MIRA_ID
      && occurrence.addressedActorIds.includes(R5_IDA_ID)
      && occurrence.text === replyText,
  );
  expect(replyOccurrences).toHaveLength(1);

  return {
    matter,
    life: slice.life.currentLifeView(),
    snapshot: slice.life.kernel.snapshotCommittedState(),
    semanticPressure: slice.mira.semanticPressureLifecycleSnapshot(),
    replyOccurrence: replyOccurrences[0]!,
    providerCalls: fetcher.mock.calls.length,
    originReasonId,
  };
}

function structuralMatterShape(matter: {
  status: string;
  semanticRevision: number;
  semanticIntent: { kind: string; targetActorId?: string } | null;
  suspendedByMatterId: string | null;
  activeRunId: string | null;
  lastOutcomeSemanticRevision: number | null;
}) {
  return {
    status: matter.status,
    semanticRevision: matter.semanticRevision,
    semanticIntentKind: matter.semanticIntent?.kind ?? null,
    targetActorId: matter.semanticIntent?.targetActorId ?? null,
    suspendedByMatterId: matter.suspendedByMatterId,
    activeRunId: matter.activeRunId,
    lastOutcomeSemanticRevision: matter.lastOutcomeSemanticRevision,
  };
}

function pressureShape(entry: {
  reason: { kind: string };
  status: string;
  detail: string;
}) {
  return {
    kind: entry.reason.kind,
    status: entry.status,
    detail: entry.detail,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    await Promise.resolve();
  }
}
