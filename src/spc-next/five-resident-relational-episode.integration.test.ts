import { describe, expect, it } from "vitest";
import { FiveResidentCausalCognitionHost } from "./five-resident-causal-cognition-host";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import type { ResidentMatterIntent } from "./resident-continuity-kernel";

const JAN = "resident.janek";
const IDA = "resident.ida";
const PROMISE = "Ida, gdy wrócisz, chcę z tobą wrócić do naszej rozmowy.";
const ACKNOWLEDGEMENT = "Ida, pamiętam naszą rozmowę. Dobrze, że wróciłaś.";
const SOURCE_PROMISE = "matter.janek.episode.test-authored-initial-promise";
const TEST_EXECUTION_GUARD = 2_700;

/**
 * This is NOT an authored gameplay script, an LLM test, or autonomous agent
 * personhood. The test author supplies three *clearly marked* initial acts:
 * Ida's travel to workshop, Janek's decision to make the first promise, and
 * Ida's departure/return. It MUST NOT credit these choices to the residents.
 *
 * Everything after that is ordinary shared five-resident World truth:
 * - both residents move/speak through their recovered matter -> run -> World
 *   execution authority, not direct resident setActorMotionIntent/speak;
 * - Janek can recognize Ida only through his own actual sight;
 * - a private open standing relation gives the re-encounter significance;
 * - local cognition can choose a response only from its exact pending reason;
 * - accepted follow-through must be a physically delivered World utterance.
 *
 * No browser, Cloudflare, GitHub secret, network or provider is ever used.
 */
function specimen() {
  const composition = createFiveResidentRegionComposition();
  const host = new FiveResidentCausalLifeRuntime(composition, { socialReencounter: true });
  for (let i = 0; host.claimedResidentIds().length < 5 && i < 1_600; i += 1) {
    host.advanceOneWorldTick();
  }
  expect(host.claimedResidentIds()).toHaveLength(5);
  return { host, world: composition.world };
}

type Episode = ReturnType<typeof specimen>;

function authoredResidentAct(
  s: Episode,
  residentId: typeof IDA | typeof JAN,
  stem: string,
  intent: ResidentMatterIntent,
) {
  const life = s.host.life(residentId);
  if (!life) throw new Error("actual five-resident World never claimed " + residentId);
  const matterId = `matter.${residentId.split(".").at(-1)}.${stem}`;
  const runId = `run.${residentId}.${stem}`;
  const origin = life.kernel.recordEvidence({
    id: `evidence.${residentId}.${stem}.authored-initial-choice`,
    tick: s.world.tick,
    kind: "authored_initial_context",
    summary: "The TEST AUTHOR selected this act. It is not an autonomous resident motive.",
  });
  life.kernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: "TEST-AUTHORED prior situation: " + stem,
    semanticIntent: intent,
  });
  life.matterScope.track(matterId);
  life.kernel.bindRun({ matterId, taskId: `task.${residentId}.${stem}`, runId });
  expect(life.arbitrator.request(runId)).toEqual({ status: "acquired", runId });
  return { matterId, runId, life };
}

function travel(s: Episode, stem: string, targetRegionId: string) {
  const { matterId, runId, life } = authoredResidentAct(s, IDA, stem, {
    kind: "travel_region",
    goal: "fixture-controlled physical journey, no inferred Ida intention",
    targetRegionId,
  });
  const observedRelevance: Array<{ matterId: string; reasonId: string }> = [];
  let completed = false;
  for (let i = 0; i < TEST_EXECUTION_GUARD; i += 1) {
    const tick = s.host.advanceOneWorldTick();
    for (const relevance of tick.socialRelevance[JAN] ?? []) {
      if (relevance.status === "promoted") {
        observedRelevance.push({ matterId: relevance.matterId, reasonId: relevance.reasonId });
      }
    }
    if (tick.execution[IDA]?.status === "completed"
      && tick.execution[IDA].runId === runId) {
      completed = true;
      break;
    }
  }
  expect(completed).toBe(true);
  expect(life.kernel.matter(matterId)?.status).toBe("resolved");
  return observedRelevance;
}

function actualOpeningPromise(s: Episode): string {
  const { matterId, runId, life } = authoredResidentAct(s, JAN, "episode.test-authored-initial-promise", {
    kind: "communicate_actor",
    goal: "Say an already selected, explicitly test-authored initial promise",
    targetActorId: IDA,
    text: PROMISE,
    standingSocialCommitment: { goal: "Remember the factual promise to Ida" },
  });
  expect(matterId).toBe(SOURCE_PROMISE);
  let standingId: string | null = null;
  for (let i = 0; i < 350; i += 1) {
    const tick = s.host.advanceOneWorldTick();
    const standing = life.currentLifeView().matters.find(m =>
      m.status === "active" && m.semanticIntent?.kind === "standing_social_commitment"
        && m.semanticIntent.counterpartyActorId === IDA
    );
    if (!standing) continue;
    expect(tick.execution[JAN]).toMatchObject({ status: "completed", runId });
    expect(life.kernel.matter(matterId)?.status).toBe("resolved");
    expect(standing.originEvidence?.kind).toBe("resident_originated_social_commitment");
    standingId = standing.id;
    break;
  }
  expect(standingId).not.toBeNull();
  expect(s.world.diagnostics().recentOccurrences.some(o =>
    o.kind === "speech" && o.actorId === JAN && o.text === PROMISE
      && o.addressedActorIds.includes(IDA)
  )).toBe(true);
  return standingId!;
}

function travelToFirstMeeting(s: Episode) {
  // Original five authored openings run to completion first. Ida then travels
  // as an explicitly test-authorized, ordinary R6 run, not a magic teleport.
  expect(travel(s, "episode.first-meeting", "workshop")).toHaveLength(0);
  const janek = s.host.life(JAN)!;
  expect(janek.resident.cognitionContext({
    residentId: JAN,
    requestedAtTick: s.world.tick,
    reasons: [],
  }).knownActors.some(a => a.id === IDA)).toBe(true);
  const actors = s.world.publicSnapshot().actors;
  const j = actors.find(a => a.id === JAN)!.position;
  const i = actors.find(a => a.id === IDA)!.position;
  expect(Math.hypot(j.x - i.x, j.y - i.y)).toBeLessThan(520);
}

describe("R6 five-resident ordinary-history episode / no external model calls", () => {
  it("takes a private resident-to-resident re-encounter through local cognition admission into actual World speech", () => {
    const s = specimen();
    travelToFirstMeeting(s);
    const standingId = actualOpeningPromise(s);
    // One factual speech is heard from TWO private viewpoints, but social
    // ownership is NOT copied to the listener. Ida heard Janek's declaration;
    // she did not thereby promise him anything in return.
    const idaLife = s.host.life(IDA)!;
    const idaHeard = idaLife.resident.pendingCognitionReasons().filter(r => r.kind === "heard_speech");
    expect(idaHeard).toHaveLength(1);
    expect(idaHeard[0]!.evidenceIds.length).toBeGreaterThan(0);
    expect(idaLife.currentLifeView().matters.some(m =>
      m.semanticIntent?.kind === "standing_social_commitment"
    )).toBe(false);
    expect(idaLife.focus.focusedRun()).toBeNull();

    expect(travel(s, "episode.ida-leaves", "crossroads")).toHaveLength(0);
    const returnObservations = travel(s, "episode.ida-returns", "workshop");
    expect(returnObservations).toEqual([{
      matterId: standingId,
      reasonId: expect.any(String),
    }]);
    const janek = s.host.life(JAN)!;
    const pending = janek.resident.pendingCognitionReasons();
    const relevant = pending.filter(r => r.id === returnObservations[0]!.reasonId);
    expect(relevant).toHaveLength(1);
    expect(relevant[0]!.kind).toBe("uncertainty");
    expect(relevant[0]!.evidenceIds).toContain(standingId);
    expect(janek.focus.focusedRun()).toBeNull();

    // No model or actor auto-speaks simply because the cue exists.
    expect(s.world.diagnostics().recentOccurrences.some(o =>
      o.kind === "speech" && o.actorId === JAN && o.text === ACKNOWLEDGEMENT
    )).toBe(false);

    // Exercise the production resident-generic scheduler and semantic authority.
    // The actual judgement BELOW is intentionally provided by the test, NOT Luna.
    const scheduler = new FiveResidentCausalCognitionHost(s.host, 1);
    let request: ReturnType<typeof scheduler.startReadyRequests>[number] | undefined;
    for (let i = 0; i < 300 && !request; i += 1) {
      scheduler.collectReadyBatches([JAN]);
      request = scheduler.startReadyRequests([JAN])[0];
      if (!request) s.host.advanceOneWorldTick();
    }
    expect(request).toBeDefined();
    if (!request) return;
    const origin = request.batch.reasons.find(r => r.id === relevant[0]!.id);
    expect(origin).toBeDefined();
    expect(request.context.resident.id).toBe(JAN);

    const applied = scheduler.settleCommitment(request, {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "TEST-INJECTED semantic choice grounded in this one private re-encounter",
        intent: {
          kind: "communicate",
          goal: "Respond to Ida's return in accordance with own previously spoken promise",
          targetActorId: IDA,
          targetRegionId: null,
          targetPosition: null,
          text: ACKNOWLEDGEMENT,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 60,
    }, origin!.id);
    expect(applied).toMatchObject({
      status: "applied", residentId: JAN, decision: "accept",
      commitment: { matterId: expect.any(String), runId: expect.any(String) },
    });

    let actualSpeech = false;
    for (let i = 0; i < 350; i += 1) {
      s.host.advanceOneWorldTick();
      actualSpeech = s.world.diagnostics().recentOccurrences.some(o =>
        o.kind === "speech" && o.actorId === JAN
          && o.text === ACKNOWLEDGEMENT && o.addressedActorIds.includes(IDA));
      if (actualSpeech) break;
    }
    expect(actualSpeech).toBe(true);
    if (applied.status === "applied" && applied.commitment) {
      expect(janek.kernel.matter(applied.commitment.matterId)?.status).toBe("resolved");
    }
    expect(janek.currentLifeView().matters.find(m => m.id === standingId)?.status)
      .toBe("active");
    // One already reviewed relation cannot generate another cognition pressure
    // when Ida repeats the SAME physical leave-and-return (Sept stress control).
    expect(travel(s, "episode.ida-repeat-leaves", "crossroads")).toHaveLength(0);
    expect(travel(s, "episode.ida-repeat-returns", "workshop")).toHaveLength(0);
    expect(janek.resident.pendingCognitionReasons()
      .filter(r => r.id === relevant[0]!.id)).toHaveLength(0);
    // One fixture-chosen response is NOT endogenous personhood. It establishes
    // that the missing decision can be admitted and enacted on the actual World.
    console.info("SPC_FIVE_RESIDENT_RELATIONAL_EPISODE", JSON.stringify({
      actualFiveResidentWorld: true,
      playerIssuedNoCommand: true,
      initialSpeechChoice: "test_authored",
      idaJourneyChoices: "test_authored",
      historyGroundedReturnQuestion: true,
      semanticAnswer: "test_injected_not_Luna",
      physicalResidentToResidentAfterstate: actualSpeech,
      actualProviderCalls: 0,
      ownerProductQualified: false,
    }));
  }, 30_000);

  it("does NOT invent the same personal question or follow-up without Janek's earlier standing promise", () => {
    const s = specimen();
    travelToFirstMeeting(s);
    expect(s.host.life(JAN)!.currentLifeView().matters).toHaveLength(0);
    expect(travel(s, "episode.ida-leaves-control", "crossroads")).toHaveLength(0);
    expect(travel(s, "episode.ida-returns-control", "workshop")).toHaveLength(0);
    const janek = s.host.life(JAN)!;
    expect(janek.currentLifeView().matters).toHaveLength(0);
    expect(janek.resident.pendingCognitionReasons()).toEqual([]);

    const scheduler = new FiveResidentCausalCognitionHost(s.host, 1);
    for (let i = 0; i < 360; i += 1) {
      s.host.advanceOneWorldTick();
      expect(scheduler.collectReadyBatches([JAN])).toBe(0);
      expect(scheduler.startReadyRequests([JAN])).toEqual([]);
    }
    expect(s.world.diagnostics().recentOccurrences.some(o =>
      o.kind === "speech" && o.actorId === JAN
    )).toBe(false);
  }, 30_000);

  it("accepts meaningful DEFER on a personally grounded encounter without fabricating speech or body work", () => {
    const s = specimen();
    travelToFirstMeeting(s);
    const standingId = actualOpeningPromise(s);
    travel(s, "episode.defer-ida-leaves", "crossroads");
    const [relevance] = travel(s, "episode.defer-ida-returns", "workshop");
    expect(relevance).toMatchObject({ matterId: standingId });

    const janek = s.host.life(JAN)!;
    const scheduler = new FiveResidentCausalCognitionHost(s.host, 1);
    let request: ReturnType<typeof scheduler.startReadyRequests>[number] | undefined;
    for (let i = 0; i < 300 && !request; i += 1) {
      scheduler.collectReadyBatches([JAN]);
      request = scheduler.startReadyRequests([JAN])[0];
      if (!request) s.host.advanceOneWorldTick();
    }
    expect(request).toBeDefined();
    if (!request) return;
    expect(request.batch.reasons.some(r => r.id === relevance!.reasonId)).toBe(true);
    const response = scheduler.settleCommitment(request, {
      version: 1,
      commitmentDecision: {
        kind: "defer",
        reason: "TEST-INJECTED: Ida returned, but I choose not to interrupt our lives now.",
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 120,
    }, relevance!.reasonId);
    expect(response).toMatchObject({
      status: "applied", residentId: JAN, decision: "defer", commitment: null,
    });
    expect(janek.focus.focusedRun()).toBeNull();
    expect(janek.currentLifeView().matters.find(m => m.id === standingId)?.status)
      .toBe("active");
    for (let i = 0; i < 300; i += 1) s.host.advanceOneWorldTick();
    expect(s.world.diagnostics().recentOccurrences.some(o =>
      o.kind === "speech" && o.actorId === JAN && o.text === ACKNOWLEDGEMENT
    )).toBe(false);
    expect(janek.currentLifeView().matters.filter(m =>
      m.semanticIntent?.kind === "communicate_actor" && m.status === "active"
    )).toHaveLength(0);
  }, 30_000);
});
