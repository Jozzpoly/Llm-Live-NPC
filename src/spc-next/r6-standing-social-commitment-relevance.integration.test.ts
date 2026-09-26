import { describe, expect, it, vi } from "vitest";
import type { ResidentPercept } from "./contracts";
import { ResidentMatterRelevanceBridge } from "./resident-matter-relevance-bridge";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentRuntime } from "./resident-runtime";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  R5_IDA_ID,
  R5_MIRA_ID,
  createR5MiraSemanticEscalationSlice,
} from "./r5-mira-semantic-escalation-slice";

const PROMISE_TEXT = "Tak, zostanę przy tobie jeszcze chwilę.";
const PROMISE_GOAL = "pozostać dostępną dla Idy jeszcze przez chwilę";
const PROMISE_MEANING = "Zobowiązałam się wobec Idy, że pozostanę z nią jeszcze chwilę.";
const EXECUTION_GUARD = 480;

describe("R6 standing social commitment resident-relative significance", () => {
  it("makes the same later Ida sight meaningful only for the resident carrying the open commitment, then stops after release", async () => {
    const withHistory = await createSpecimen(true);
    const withoutHistory = await createSpecimen(false);

    const sameCurrentEvidence = sightEnter("percept:r6:ida-return:1", 300);
    withHistory.slice.mira.ingestPercepts([sameCurrentEvidence]);
    withoutHistory.slice.mira.ingestPercepts([sameCurrentEvidence]);

    const withBridge = new ResidentMatterRelevanceBridge(withHistory.slice.mira);
    const withoutBridge = new ResidentMatterRelevanceBridge(withoutHistory.slice.mira);

    const withResult = withBridge.observe(
      sameCurrentEvidence,
      withHistory.slice.life.currentLifeView(),
    );
    const withoutResult = withoutBridge.observe(
      sameCurrentEvidence,
      withoutHistory.slice.life.currentLifeView(),
    );

    expect(withResult).toMatchObject({
      status: "promoted",
      matterId: withHistory.standingMatterId,
      evidenceId: sameCurrentEvidence.id,
    });
    expect(withoutResult).toEqual({
      status: "not_relevant",
      evidenceId: sameCurrentEvidence.id,
    });

    expect(withHistory.slice.mira.pendingCognitionReasons()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "uncertainty",
        evidenceIds: expect.arrayContaining([
          sameCurrentEvidence.id,
          withHistory.standingMatterId,
        ]),
      }),
    ]));
    expect(withoutHistory.slice.mira.pendingCognitionReasons()).toEqual([]);

    if (!withHistory.standingMatterId) {
      throw new Error("R6 relevance specimen lost standing matter id");
    }
    withHistory.slice.life.originatedSocialCommitments.release({
      matterId: withHistory.standingMatterId,
      tick: 301,
      reason: "Mira privately releases the standing commitment.",
    });
    const reconciled = withBridge.reconcile(
      withHistory.slice.life.currentLifeView(),
      301,
    );
    expect(reconciled.invalidatedReasonIds).toHaveLength(1);
    expect(withHistory.slice.mira.pendingCognitionReasons()).toEqual([]);

    const laterEquivalentEvidence = sightEnter("percept:r6:ida-return:2", 302);
    withHistory.slice.mira.ingestPercepts([laterEquivalentEvidence]);
    expect(withBridge.observe(
      laterEquivalentEvidence,
      withHistory.slice.life.currentLifeView(),
    )).toEqual({
      status: "not_relevant",
      evidenceId: laterEquivalentEvidence.id,
    });
  });
  it("fails closed when two different open resident matters make the same actor relevant", () => {
    const resident = new ResidentRuntime({
      id: R5_MIRA_ID,
      name: "Mira",
      hearingRadius: 420,
      sightRadius: 520,
      maxSpeed: 115,
      brainIntervalTicks: 3,
      memoryLimit: 128,
      traceLimit: 256,
    });
    const kernel = new ResidentContinuityKernel();

    for (const suffix of ["a", "b"]) {
      const origin = kernel.recordEvidence({
        id: `evidence:r6:standing-ambiguity:${suffix}`,
        tick: suffix === "a" ? 1 : 2,
        kind: "resident_originated_social_commitment",
        summary: `Distinct resident-owned standing commitment ${suffix} toward Ida.`,
      });
      kernel.openMatter({
        id: `matter.mira.r6.standing-ambiguity.${suffix}`,
        originEvidenceId: origin.id,
        semanticCourse: `standing relation ${suffix} toward Ida`,
        semanticIntent: {
          kind: "standing_social_commitment",
          goal: `keep commitment ${suffix} in mind`,
          counterpartyActorId: R5_IDA_ID,
          commitment: `distinct commitment ${suffix}`,
        },
      });
    }

    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const life = captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: [
        "matter.mira.r6.standing-ambiguity.a",
        "matter.mira.r6.standing-ambiguity.b",
      ],
    });

    const percept = sightEnter("percept:r6:ida-ambiguous", 30);
    resident.ingestPercepts([percept]);
    const bridge = new ResidentMatterRelevanceBridge(resident);

    expect(bridge.observe(percept, life)).toEqual({
      status: "not_relevant",
      evidenceId: percept.id,
    });
    expect(bridge.activeMatterIds()).toEqual([]);
    expect(resident.pendingCognitionReasons()).toEqual([]);
  });
});

async function createSpecimen(withStandingHistory: boolean) {
  let standingMatterId: string | null = null;
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const context = JSON.parse(String(init?.body));
    const originReasonId = context?.reasons?.[0]?.id;
    if (typeof originReasonId !== "string") {
      throw new Error("R6 significance fixture provider received no exact origin reason");
    }

    const proposal: ResidentLifeIntentProposal = {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "Ida addressed me directly and I choose to answer once.",
        intent: {
          kind: "communicate",
          goal: "answer Ida once",
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

  const admission = slice.advanceOneWorldTick().admissions[0];
  if (!admission || admission.status !== "applied" || !admission.commitment) {
    throw new Error("R6 significance fixture did not admit communicate matter");
  }

  const prepared = withStandingHistory
    ? slice.life.originatedSocialCommitments.prepareFromCommunicateMatter({
        sourceMatterId: admission.commitment.matterId,
        expectedSpeechText: PROMISE_TEXT,
        counterpartyActorId: R5_IDA_ID,
        goal: PROMISE_GOAL,
        commitment: PROMISE_MEANING,
      })
    : null;

  for (let index = 0; index < EXECUTION_GUARD; index += 1) {
    slice.advanceOneWorldTick();
    if (slice.life.kernel.matter(admission.commitment.matterId)?.status === "resolved") break;
  }

  const speech = slice.world.diagnostics().recentOccurrences.find(
    (occurrence) => occurrence.kind === "speech"
      && occurrence.actorId === R5_MIRA_ID
      && occurrence.text === PROMISE_TEXT
      && occurrence.addressedActorIds.includes(R5_IDA_ID),
  );
  if (!speech) throw new Error("R6 significance fixture produced no factual Mira speech");

  if (withStandingHistory) {
    if (!prepared) throw new Error("R6 significance fixture lost prepared commitment authority");
    standingMatterId = slice.life.originatedSocialCommitments.materializeAfterFactualSpeech(
      prepared,
      speech.id,
    ).matter.id;
  }

  // The current observation presented to the relevance boundary is intentionally
  // identical. Only private causal history differs.
  return { slice, standingMatterId };
}

function sightEnter(id: string, tick: number): ResidentPercept {
  return {
    id,
    occurrenceId: `occurrence:${id}`,
    tick,
    phenomenon: "actor_sight_enter",
    modality: "sight",
    actorId: R5_IDA_ID,
    subjectId: null,
    spatial: {
      kind: "exact",
      position: { x: 900, y: 500 },
    },
    summary: "Ida enters Mira's sight.",
    text: null,
    addressed: false,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    await Promise.resolve();
  }
}
