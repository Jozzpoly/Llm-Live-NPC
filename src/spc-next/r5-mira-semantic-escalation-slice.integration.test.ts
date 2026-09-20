import { describe, expect, it, vi } from "vitest";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  R5_IDA_ID,
  R5_IDA_PROMPT,
  R5_MIRA_ID,
  R5_MIRA_SEMANTIC_REPLY,
  createR5MiraSemanticEscalationSlice,
} from "./r5-mira-semantic-escalation-slice";

const PRE_EVENT_QUIET_TICKS = 120;
const PROVIDER_LATENCY_WORLD_TICKS = 600;
const POST_SETTLEMENT_QUIET_TICKS = 600;
const EXECUTION_GUARD = 600;

describe("R5-A Mira semantic escalation", () => {
  it("turns one addressed speech reason into one inert-latency provider request, one grounded reply commitment, and quiet", async () => {
    let providerReleaseInstalled = false;
    let releaseProvider: () => void = () => {
      throw new Error("R5 fixture provider release was not installed");
    };
    let frozenContext: any = null;

    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      frozenContext = JSON.parse(String(init?.body));
      await new Promise<void>((resolve) => {
        releaseProvider = resolve;
        providerReleaseInstalled = true;
      });

      const originReasonId = frozenContext?.reasons?.[0]?.id;
      if (typeof originReasonId !== "string") {
        throw new Error("R5 fixture provider received no exact cognition reason");
      }

      const proposal: ResidentLifeIntentProposal = {
        version: 1,
        commitmentDecision: {
          kind: "accept",
          reason: "Ida addressed me directly and I choose to answer her once.",
          intent: {
            kind: "communicate",
            goal: "answer Ida's direct question with one bounded reply",
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
    const initialActors = slice.world.publicSnapshot().actors;
    expect(initialActors.map((actor) => actor.id).sort()).toEqual(
      [R5_IDA_ID, R5_MIRA_ID].sort(),
    );
    expect(initialActors.some((actor) => actor.kind === "player")).toBe(false);
    expect(slice.life.matterScope.matterIds()).toEqual([]);
    expect(slice.mira.pendingCognitionReasons()).toEqual([]);
    expect(slice.diagnostics().providerRequestCount).toBe(0);

    // One ordinary World tick establishes legal private sight/identity before speech.
    slice.advanceOneWorldTick();
    const knownIda = slice.mira.cognitionContext({
      residentId: R5_MIRA_ID,
      requestedAtTick: slice.world.tick,
      reasons: [],
    }).knownActors.find((actor) => actor.id === R5_IDA_ID);
    expect(knownIda).toMatchObject({
      id: R5_IDA_ID,
      currentlyVisible: true,
    });
    expect(knownIda?.lastKnownPosition).not.toBeNull();

    const initialMiraPosition = positionOf(slice, R5_MIRA_ID);
    for (let index = 0; index < PRE_EVENT_QUIET_TICKS; index += 1) {
      slice.advanceOneWorldTick();
    }
    expect(positionOf(slice, R5_MIRA_ID)).toEqual(initialMiraPosition);
    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 0,
      providerInFlightRequestId: null,
      providerInboxCount: 0,
      pendingReasonIds: [],
      matterIds: [],
      focusedRunId: null,
    });

    const idaSpeech = slice.idaAddressMira();
    expect(idaSpeech).toMatchObject({
      kind: "speech",
      actorId: R5_IDA_ID,
      text: R5_IDA_PROMPT,
      addressedActorIds: [R5_MIRA_ID],
    });

    // This World boundary delivers the exact private percept, creates semantic
    // pressure and allows the scheduler-ready urgent reason to start one request.
    slice.advanceOneWorldTick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(slice.diagnostics().providerRequestCount).toBe(1);
    expect(slice.diagnostics().providerInFlightRequestId).not.toBeNull();
    expect(slice.diagnostics().providerInboxCount).toBe(0);
    expect(slice.life.matterScope.matterIds()).toEqual([]);
    expect(slice.life.focus.focusedRun()).toBeNull();

    expect(frozenContext).toMatchObject({
      contract: "resident_life_cognition_v1",
      resident: { id: R5_MIRA_ID, name: "Mira" },
      life: {
        matters: [],
        body: {
          focusedRunId: null,
          deferredRunIds: [],
        },
      },
    });
    expect(frozenContext.reasons).toHaveLength(1);
    expect(frozenContext.reasons[0]).toMatchObject({
      kind: "heard_speech",
      salience: 1,
    });
    const originReasonId = frozenContext.reasons[0].id;
    const originEvidenceId = frozenContext.reasons[0].evidenceIds[0];
    expect(originEvidenceId).toBeTruthy();

    const speechPercept = frozenContext.recentPercepts.find(
      (percept: any) => percept.id === originEvidenceId,
    );
    expect(speechPercept).toMatchObject({
      phenomenon: "speech",
      modality: "hearing",
      actorId: R5_IDA_ID,
      text: R5_IDA_PROMPT,
      addressed: true,
    });
    expect(frozenContext.knownActors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: R5_IDA_ID }),
    ]));

    // The batch is dispatched into one exact in-flight attempt. Repeated World
    // boundaries continue normally and must not create another request or matter.
    for (let index = 0; index < PROVIDER_LATENCY_WORLD_TICKS; index += 1) {
      slice.advanceOneWorldTick();
    }
    expect(slice.world.tick).toBeGreaterThan(PRE_EVENT_QUIET_TICKS + PROVIDER_LATENCY_WORLD_TICKS);
    expect(positionOf(slice, R5_MIRA_ID)).toEqual(initialMiraPosition);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 1,
      providerInboxCount: 0,
      matterIds: [],
      focusedRunId: null,
    });
    expect(slice.mira.semanticPressureLifecycleSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: expect.objectContaining({ id: originReasonId }),
        status: "dispatched",
      }),
    ]));

    expect(providerReleaseInstalled).toBe(true);
    releaseProvider();
    await flushMicrotasks();

    // Wall-clock completion alone is inert.
    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 1,
      providerInFlightRequestId: null,
      providerInboxCount: 1,
      matterIds: [],
      focusedRunId: null,
    });
    expect(slice.life.matterScope.matterIds()).toEqual([]);
    expect(slice.life.focus.focusedRun()).toBeNull();
    expect(positionOf(slice, R5_MIRA_ID)).toEqual(initialMiraPosition);

    // Exact next World boundary admits the arrival. Only now may local grounding
    // materialize one durable communication commitment.
    const admissionTick = slice.advanceOneWorldTick();
    expect(admissionTick.admissions).toHaveLength(1);
    expect(admissionTick.admissions[0]).toMatchObject({
      status: "applied",
      residentId: R5_MIRA_ID,
      decision: "accept",
      commitment: {
        matterId: expect.any(String),
        runId: expect.any(String),
      },
    });

    const applied = admissionTick.admissions[0];
    if (applied.status !== "applied" || !applied.commitment) {
      throw new Error("R5-A expected one admitted communicate commitment");
    }
    const commitment = applied.commitment;
    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 1,
      providerInFlightRequestId: null,
      providerInboxCount: 0,
      pendingReasonIds: [],
      matterIds: [commitment.matterId],
      focusedRunId: commitment.runId,
    });
    expect(slice.life.kernel.matter(commitment.matterId)).toMatchObject({
      status: "active",
      activeRunId: commitment.runId,
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: R5_IDA_ID,
        text: R5_MIRA_SEMANTIC_REPLY,
      },
    });
    expect(slice.mira.semanticPressureLifecycleSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: expect.objectContaining({ id: originReasonId }),
        status: "settled",
      }),
    ]));

    let resolved = false;
    for (let index = 0; index < EXECUTION_GUARD && !resolved; index += 1) {
      slice.advanceOneWorldTick();
      resolved = slice.life.kernel.matter(commitment.matterId)?.status === "resolved";
    }
    expect(resolved).toBe(true);
    expect(slice.life.kernel.matter(commitment.matterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.life.focus.focusedRun()).toBeNull();

    const semanticReplies = slice.world.diagnostics().recentOccurrences.filter(
      (occurrence) => occurrence.kind === "speech"
        && occurrence.actorId === R5_MIRA_ID
        && occurrence.text === R5_MIRA_SEMANTIC_REPLY
        && occurrence.addressedActorIds.includes(R5_IDA_ID),
    );
    expect(semanticReplies).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const matterIdsAfterResolution = slice.life.matterScope.matterIds();
    const replyOccurrenceId = semanticReplies[0]!.id;

    // Keep running the real request-start boundary. Quiet is earned only if no
    // scheduler/provider/matter echo appears when the organism keeps ticking.
    for (let index = 0; index < POST_SETTLEMENT_QUIET_TICKS; index += 1) {
      slice.advanceOneWorldTick();
    }

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(slice.diagnostics()).toMatchObject({
      providerRequestCount: 1,
      providerInFlightRequestId: null,
      providerInboxCount: 0,
      pendingReasonIds: [],
      matterIds: matterIdsAfterResolution,
      focusedRunId: null,
    });
    expect(slice.life.matterScope.matterIds()).toEqual(matterIdsAfterResolution);
    expect(slice.world.diagnostics().recentOccurrences.filter(
      (occurrence) => occurrence.id === replyOccurrenceId,
    )).toHaveLength(1);
    expect(slice.world.diagnostics().recentOccurrences.filter(
      (occurrence) => occurrence.kind === "speech"
        && occurrence.actorId === R5_MIRA_ID
        && occurrence.text === R5_MIRA_SEMANTIC_REPLY,
    )).toHaveLength(1);
    expect(slice.mira.semanticPressureLifecycleSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: expect.objectContaining({ id: originReasonId }),
        status: "settled",
      }),
    ]));
  });
});

function positionOf(
  slice: ReturnType<typeof createR5MiraSemanticEscalationSlice>,
  actorId: string,
) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error("R5 test actor missing: " + actorId);
  return structuredClone(actor.position);
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}
