import { describe, expect, it, vi } from "vitest";
import {
  CAUSAL_PROVIDER_ERROR_RETRY_TICKS,
} from "./resident-causal-cognition-retry-policy";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  R5_IDA_ID,
  R5_MIRA_ID,
  createR5MiraSemanticEscalationSlice,
} from "./r5-mira-semantic-escalation-slice";

const PROMPT = "Mira, odpowiesz mi teraz?";
const DECLINE_QUIET_TICKS = 600;

describe("R5-C provider failure and explicit semantic outcomes", () => {
  it("requeues provider error pressure and starts no retry before the shared provider-error deadline", async () => {
    let releaseFirst: () => void = () => {
      throw new Error("provider error release not installed");
    };
    let firstReleaseInstalled = false;
    const contexts: any[] = [];

    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body));
      contexts.push(structuredClone(context));

      if (contexts.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
          firstReleaseInstalled = true;
        });
        return new Response(JSON.stringify({
          ok: false,
          code: "global_limit",
          secretDiagnostic: "must-not-cross-client-boundary",
        }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });
      }

      // Keep the exact retry request in flight so the test can inspect dispatch
      // without letting a second outcome affect the boundary under test.
      await new Promise<void>(() => {});
      throw new Error("unreachable");
    });

    const slice = createR5MiraSemanticEscalationSlice(fetcher);
    primeAddressedRequest(slice, PROMPT);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(firstReleaseInstalled).toBe(true);
    const reason = contexts[0].reasons[0];
    expect(reason).toMatchObject({ kind: "heard_speech" });

    for (let index = 0; index < 60; index += 1) slice.advanceOneWorldTick();
    releaseFirst();
    await flushMicrotasks();

    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 1,
      providerInFlightRequestId: null,
      providerInboxCount: 1,
      matterIds: [],
      focusedRunId: null,
    });

    const admissionTick = slice.advanceOneWorldTick();
    expect(admissionTick.admissions).toHaveLength(1);
    expect(admissionTick.admissions[0]).toMatchObject({
      status: "provider_error",
      residentId: R5_MIRA_ID,
      code: "http",
      detail: "HTTP 429: global_limit",
      abandonment: true,
    });
    expect(JSON.stringify(admissionTick.admissions[0])).not.toContain("secretDiagnostic");

    const deadline = slice.world.tick + CAUSAL_PROVIDER_ERROR_RETRY_TICKS;
    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 1,
      providerRetryNotBeforeTick: deadline,
      pendingReasonIds: [reason.id],
      matterIds: [],
      focusedRunId: null,
    });
    expect(pressure(slice, reason.id)).toMatchObject({
      status: "pending",
      detail: "cognition batch returned unresolved",
    });

    for (let index = 0; index < CAUSAL_PROVIDER_ERROR_RETRY_TICKS - 1; index += 1) {
      slice.advanceOneWorldTick();
      expect(slice.diagnostics().providerRequestCount).toBe(1);
    }

    slice.advanceOneWorldTick();
    expect(slice.world.tick).toBe(deadline);
    expect(slice.diagnostics().providerRequestCount).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(contexts[1].reasons.map((entry: any) => entry.id)).toContain(reason.id);
    expect(slice.life.matterScope.matterIds()).toEqual([]);
  });

  it("decline settles only the exact origin and remains quiet without manufacturing a matter or another request", async () => {
    const contexts: any[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body));
      contexts.push(structuredClone(context));
      const originReasonId = context.reasons[0]?.id;
      return proposalResponse({
        version: 1,
        commitmentDecision: {
          kind: "decline",
          reason: "I heard Ida, but I choose not to take on a continuing commitment.",
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      }, originReasonId);
    });

    const slice = createR5MiraSemanticEscalationSlice(fetcher);
    primeAddressedRequest(slice, PROMPT);
    await flushMicrotasks();

    expect(slice.diagnostics().providerInboxCount).toBe(1);
    const reason = contexts[0].reasons[0];
    const admitted = slice.advanceOneWorldTick();
    expect(admitted.admissions[0]).toMatchObject({
      status: "applied",
      residentId: R5_MIRA_ID,
      decision: "decline",
      commitment: null,
    });
    expect(slice.mira.pendingCognitionReasons()).toEqual([]);
    expect(pressure(slice, reason.id)).toMatchObject({ status: "settled" });
    expect(slice.life.matterScope.matterIds()).toEqual([]);
    expect(miraSpeech(slice)).toEqual([]);

    for (let index = 0; index < DECLINE_QUIET_TICKS; index += 1) {
      slice.advanceOneWorldTick();
    }

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 1,
      providerInFlightRequestId: null,
      providerInboxCount: 0,
      pendingReasonIds: [],
      matterIds: [],
      focusedRunId: null,
    });
    expect(miraSpeech(slice)).toEqual([]);
  });

  it("defer retains the exact origin until reviewAfterSeconds and retries exactly at its semantic deadline", async () => {
    const REVIEW_SECONDS = 1;
    const REVIEW_TICKS = 60;
    const contexts: any[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body));
      contexts.push(structuredClone(context));
      if (contexts.length === 1) {
        return proposalResponse({
          version: 1,
          commitmentDecision: {
            kind: "defer",
            reason: "Keep this unresolved until a later semantic review.",
          },
          beliefs: [],
          concerns: [],
          reviewAfterSeconds: REVIEW_SECONDS,
        }, context.reasons[0]?.id);
      }
      await new Promise<void>(() => {});
      throw new Error("unreachable");
    });

    const slice = createR5MiraSemanticEscalationSlice(fetcher);
    primeAddressedRequest(slice, PROMPT);
    await flushMicrotasks();

    const reason = contexts[0].reasons[0];
    const admission = slice.advanceOneWorldTick();
    expect(admission.admissions[0]).toMatchObject({
      status: "applied",
      decision: "defer",
      commitment: null,
    });

    const retained = pressure(slice, reason.id);
    expect(retained).toMatchObject({
      status: "pending",
      detail: "defer keeps selected semantic pressure unresolved",
      notBeforeTick: slice.world.tick + REVIEW_TICKS,
    });
    expect(slice.life.matterScope.matterIds()).toEqual([]);
    expect(miraSpeech(slice)).toEqual([]);

    for (let index = 0; index < REVIEW_TICKS - 1; index += 1) {
      slice.advanceOneWorldTick();
      expect(slice.diagnostics().providerRequestCount).toBe(1);
    }
    slice.advanceOneWorldTick();

    expect(slice.diagnostics().providerRequestCount).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(contexts[1].reasons.map((entry: any) => entry.id)).toContain(reason.id);
    expect(slice.life.matterScope.matterIds()).toEqual([]);
  });

  it("clarify retains pressure until its review deadline without pretending the provider question was spoken", async () => {
    const REVIEW_SECONDS = 0.5;
    const REVIEW_TICKS = 30;
    const QUESTION = "Ida, co dokładnie masz na myśli?";
    const contexts: any[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body));
      contexts.push(structuredClone(context));
      if (contexts.length === 1) {
        return proposalResponse({
          version: 1,
          commitmentDecision: {
            kind: "clarify",
            reason: "The semantic content is not yet specific enough to accept or decline.",
            question: QUESTION,
          },
          beliefs: [],
          concerns: [],
          reviewAfterSeconds: REVIEW_SECONDS,
        }, context.reasons[0]?.id);
      }
      await new Promise<void>(() => {});
      throw new Error("unreachable");
    });

    const slice = createR5MiraSemanticEscalationSlice(fetcher);
    primeAddressedRequest(slice, PROMPT);
    await flushMicrotasks();

    const reason = contexts[0].reasons[0];
    const admission = slice.advanceOneWorldTick();
    expect(admission.admissions[0]).toMatchObject({
      status: "applied",
      decision: "clarify",
      commitment: null,
    });

    expect(pressure(slice, reason.id)).toMatchObject({
      status: "pending",
      detail: "clarify keeps selected semantic pressure unresolved",
      notBeforeTick: slice.world.tick + REVIEW_TICKS,
    });
    expect(slice.world.diagnostics().recentOccurrences.some(
      (occurrence) => occurrence.kind === "speech"
        && occurrence.actorId === R5_MIRA_ID
        && occurrence.text === QUESTION,
    )).toBe(false);
    expect(slice.life.matterScope.matterIds()).toEqual([]);

    for (let index = 0; index < REVIEW_TICKS - 1; index += 1) {
      slice.advanceOneWorldTick();
      expect(slice.diagnostics().providerRequestCount).toBe(1);
    }
    slice.advanceOneWorldTick();

    expect(slice.diagnostics().providerRequestCount).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(contexts[1].reasons.map((entry: any) => entry.id)).toContain(reason.id);
    expect(slice.world.diagnostics().recentOccurrences.some(
      (occurrence) => occurrence.kind === "speech"
        && occurrence.actorId === R5_MIRA_ID
        && occurrence.text === QUESTION,
    )).toBe(false);
  });

  it("declining one selected reason does not accidentally settle a sibling reason from the same batch", async () => {
    const contexts: any[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body));
      contexts.push(structuredClone(context));
      return proposalResponse({
        version: 1,
        commitmentDecision: {
          kind: "decline",
          reason: "Decline only the first selected semantic pressure.",
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      }, context.reasons[0]?.id);
    });

    const slice = createR5MiraSemanticEscalationSlice(fetcher);
    slice.advanceOneWorldTick();

    // Two legal addressed occurrences enter before one World delivery boundary,
    // allowing one cognition batch to carry two independent causal reasons.
    slice.idaAddressMira("Mira, pierwsza sprawa?");
    slice.idaAddressMira("Mira, druga niezależna sprawa?");
    slice.advanceOneWorldTick();
    await flushMicrotasks();

    expect(contexts).toHaveLength(1);
    expect(contexts[0].reasons).toHaveLength(2);
    const selected = contexts[0].reasons[0];
    const sibling = contexts[0].reasons[1];

    const admission = slice.advanceOneWorldTick();
    expect(admission.admissions[0]).toMatchObject({
      status: "applied",
      decision: "decline",
      commitment: null,
    });

    expect(pressure(slice, selected.id)).toMatchObject({ status: "settled" });
    expect(pressure(slice, sibling.id)).toMatchObject({
      status: "pending",
      detail: expect.stringContaining("batch sibling retained"),
    });
    expect(slice.mira.pendingCognitionReasons().map((reason) => reason.id))
      .toEqual([sibling.id]);
    expect(slice.life.matterScope.matterIds()).toEqual([]);
  });
});

function primeAddressedRequest(
  slice: ReturnType<typeof createR5MiraSemanticEscalationSlice>,
  text: string,
): void {
  slice.advanceOneWorldTick();
  slice.idaAddressMira(text);
  slice.advanceOneWorldTick();
}

function proposalResponse(proposal: ResidentLifeIntentProposal, originReasonId: string): Response {
  if (typeof originReasonId !== "string") throw new Error("fixture lacks origin reason");
  return new Response(JSON.stringify({
    ok: true,
    originReasonId,
    proposal,
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function pressure(
  slice: ReturnType<typeof createR5MiraSemanticEscalationSlice>,
  reasonId: string,
) {
  return slice.mira.semanticPressureLifecycleSnapshot()
    .find((entry) => entry.reason.id === reasonId);
}

function miraSpeech(
  slice: ReturnType<typeof createR5MiraSemanticEscalationSlice>,
) {
  return slice.world.diagnostics().recentOccurrences.filter(
    (occurrence) => occurrence.kind === "speech" && occurrence.actorId === R5_MIRA_ID,
  );
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}
