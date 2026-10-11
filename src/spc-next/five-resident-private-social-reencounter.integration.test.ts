import { describe, expect, it, vi } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";

const JAN = "resident.janek";
const PLAYER = "player.jozz";
const PROMISE = "Wrócę do naszej sprawy, kiedy się znowu spotkamy.";
const MATTER = "matter.janek.authored-initial-social-promise";
const RUN = "run.janek.authored-initial-social-promise";
const GOAL = "Pamiętać własną obietnicę wobec rozmówcy";

function specimen(optIn = true) {
  // One ordinary five-resident World, one actual physical player.
  const composition = createFiveResidentRegionComposition({ playerStart: { x: 1_750, y: 720 } });
  const host = new FiveResidentCausalLifeRuntime(composition, { socialReencounter: optIn });
  const life = host.life(JAN);
  if (!life) throw new Error("Janek must own recovered R6 life at start");
  // Initial visibility acquires genuine private identity, but is not a re-encounter
  // and is not allowed to create a social reason without prior history.
  host.advanceOneWorldTick();
  expect(life.resident.perceptionSnapshot().recentPercepts.some(p =>
    p.phenomenon === "actor_sight_enter" && p.actorId === PLAYER,
  )).toBe(true);
  return { world: composition.world, host, life };
}

/**
 * The *choice to say this* is authored at episode opening. However,
 * commitment history is NOT injected straight into the matter store:
 * normal R6 execution must factually speak to an independently present player.
 */
function establishActualSpokenCommitment(s: ReturnType<typeof specimen>) {
  const e = s.life.kernel.recordEvidence({
    id: "evidence.janek.authored-initial-social-intention",
    tick: s.world.tick,
    kind: "authored_initial_context",
    summary: "Author-supplied accepted *initial* communication, not a resident-generated decision",
  });
  s.life.kernel.openMatter({
    id: MATTER, originEvidenceId: e.id,
    semanticCourse: "Communicate the already accepted personal pledge",
    semanticIntent: {
      kind: "communicate_actor", goal: "State the accepted prior promise",
      targetActorId: PLAYER, text: PROMISE,
      standingSocialCommitment: { goal: GOAL },
    },
  });
  s.life.matterScope.track(MATTER);
  s.life.kernel.bindRun({ matterId: MATTER, taskId: "task.janek.authored-initial-social-promise", runId: RUN });
  expect(s.life.arbitrator.request(RUN)).toEqual({ status: "acquired", runId: RUN });

  let standing = s.life.currentLifeView().matters.find(m =>
    m.semanticIntent?.kind === "standing_social_commitment",
  );
  for (let i = 0; !standing && i < 250; i += 1) {
    s.host.advanceOneWorldTick();
    standing = s.life.currentLifeView().matters.find(m =>
      m.semanticIntent?.kind === "standing_social_commitment",
    );
  }
  if (!standing) throw new Error("R6 normal execution never completed factual social pledge");
  expect(s.world.diagnostics().recentOccurrences.some(o =>
    o.kind === "speech" && o.actorId === JAN && o.text === PROMISE
    && o.addressedActorIds.includes(PLAYER),
  )).toBe(true);
  expect(s.life.kernel.matter(MATTER)?.status).toBe("resolved");
  expect(standing.status).toBe("active");
  expect(standing.originEvidence?.kind).toBe("resident_originated_social_commitment");
  return standing.id;
}

function movePlayerUntil(
  s: ReturnType<typeof specimen>, targetX: number,
) {
  const initial = s.world.publicSnapshot().actors.find(a => a.id === PLAYER)!.position.x;
  s.world.setActorMotionIntent(PLAYER, {
    x: targetX < initial ? -150 : 150,
    y: 0,
  });
  const promoted: Array<{ residentId: string; matterId: string }> = [];
  for(let i=0;i<350;i++){
    const t=s.host.advanceOneWorldTick();
    for (const entry of t.socialRelevance[JAN] ?? []) {
      if(entry.status === "promoted") promoted.push({residentId:JAN,matterId:entry.matterId});
    }
    const x=s.world.publicSnapshot().actors.find(a=>a.id===PLAYER)!.position.x;
    if(Math.abs(x-targetX) <= 2.5) break;
    if(i===349) throw new Error("actual player motion did not reach target");
  }
  s.world.setActorMotionIntent(PLAYER,{x:0,y:0});
  return promoted;
}

describe("real five-resident R6: encounter gains meaning ONLY from personal existing history", () => {
  it("feeds a factually re-encountered private standing question to exactly one manually dispatched resident request", async () => {
    const composition = createFiveResidentRegionComposition({ playerStart: { x: 1_750, y: 720 } });
    const outbound: unknown[] = [];
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      outbound.push(JSON.parse(String(init?.body)));
      // Deliberate local error fixture, never an upstream provider or model choice.
      return Response.json({ ok: false, code: "test_no_provider" }, { status: 503 });
    });
    const living = new FiveResidentUnifiedLivingRuntime({
      composition, providerDispatchMode: "manual",
      socialReencounter: true, fetcher, maxUpstreamRequests: 1,
      maxConcurrentCognition: 1,
    });
    const life = living.life(JAN);
    if (!life) throw new Error("missing resident");
    const s = { world: living.world, host: living.lifeRuntime, life };
    s.host.advanceOneWorldTick();
    const standingId = establishActualSpokenCommitment(s);
    expect(movePlayerUntil(s, 1_050)).toHaveLength(0);
    expect(movePlayerUntil(s, 1_750)).toEqual([{ residentId: JAN, matterId: standingId }]);

    const privateQuestion = life.resident.pendingCognitionReasons().find(r =>
      r.kind === "uncertainty" && r.summary.includes(standingId));
    expect(privateQuestion?.id).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
    expect(living.diagnostics().providerRequestCount).toBe(0);
    expect(living.requestOneResidentCognition(JAN)).toBe("started");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const posted = outbound[0] as {
      resident: { id: string };
      reasons: Array<{ id: string; kind: string; summary: string }>;
    };
    expect(posted.resident.id).toBe(JAN);
    expect(posted.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: privateQuestion!.id, kind: "uncertainty",
        summary: expect.stringContaining(standingId),
      }),
    ]));
    for (let i = 0; i < 60 && living.diagnostics().providerInboxCount === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(living.diagnostics().providerInboxCount).toBe(1);
    living.advanceOneWorldTick();
    expect(living.diagnostics().providerHardBudget.upstreamRequestsStarted).toBe(1);
    for (let i = 0; i < 90; i++) living.advanceOneWorldTick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(life.currentLifeView().matters.filter(m =>
      m.status === "active" && m.semanticIntent?.kind === "standing_social_commitment",
    )).toHaveLength(1);
    // A real private question was delivered. This fixture chose no future.
    expect(life.body.focusedRunId).toBeNull();
  });

  it("recognizes real private re-encounter with a factual self-spoken standing promise", () => {
    const s=specimen();
    const standingId=establishActualSpokenCommitment(s);
    const whileAway=movePlayerUntil(s, 1_050);
    expect(whileAway).toHaveLength(0);
    const pendingBefore=s.life.resident.pendingCognitionReasons();
    expect(pendingBefore.some(r=>r.summary.includes(standingId))).toBe(false);
    const returning=movePlayerUntil(s, 1_750);
    expect(returning).toEqual([{residentId:JAN,matterId:standingId}]);
    const socialReasons=s.life.resident.pendingCognitionReasons().filter(r=>
      r.kind==="uncertainty" && r.summary.includes(standingId)
    );
    expect(socialReasons).toHaveLength(1);
    expect(socialReasons[0]!.evidenceIds).toContain(standingId);
    expect(s.life.focus.focusedRun()).toBeNull();
    // A question becomes relevant; no choice, World action or model request is
    // fabricated. Real-Luna judgement remains a separate bounded future gate.
    expect(s.life.currentLifeView().matters.filter(m=>
      m.status==="active" && m.semanticIntent?.kind==="standing_social_commitment",
    )).toHaveLength(1);

    // A second ordinary leave/return adds NO new semantic pressure for the
    // exact unchanged matter. The first review/question already exists.
    expect(movePlayerUntil(s, 1_050)).toHaveLength(0);
    expect(movePlayerUntil(s, 1_750)).toHaveLength(0);
    expect(s.life.resident.pendingCognitionReasons().filter(r=>
      r.id===socialReasons[0]!.id,
    )).toHaveLength(1);

    // Explicit TEST-SUPPLIED release: local relevance must settle, and cannot
    // revive solely from seeing the same actor later with no remaining promise.
    s.life.originatedSocialCommitments.release({
      matterId: standingId, tick:s.world.tick,
      reason: "The external test authority explicitly closes the prior concern",
    });
    const reconciled=s.host.advanceOneWorldTick();
    expect(reconciled.settledSocialReasons[JAN]).toContain(socialReasons[0]!.id);
    expect(s.life.resident.pendingCognitionReasons().some(r=>
      r.id===socialReasons[0]!.id,
    )).toBe(false);
    movePlayerUntil(s, 1_050);
    expect(movePlayerUntil(s, 1_750)).toHaveLength(0);
    console.info("SPC_SOCIAL_REENCOUNTER_GROUNDING_ONLY",JSON.stringify({
      resident: JAN, initialChoiceAuthored: true,
      promiseActuallySpoken:true, personallyRelevantContact:true,
      autonomousNextDecision:false, providerCalls:0,
    }));
  });

  it("keeps the same actual return neutral when no resident standing history exists",()=>{
    const s=specimen();
    expect(movePlayerUntil(s,1_050)).toHaveLength(0);
    expect(movePlayerUntil(s,1_750)).toHaveLength(0);
    expect(s.life.resident.pendingCognitionReasons()).toEqual([]);
    expect(s.life.currentLifeView().matters).toHaveLength(0);
  });

  it("keeps existing host behavior when the integration is opt-out",()=>{
    const s=specimen(false);
    const standingId=establishActualSpokenCommitment(s);
    movePlayerUntil(s,1_050);
    expect(movePlayerUntil(s,1_750)).toHaveLength(0);
    expect(s.life.resident.pendingCognitionReasons().some(r=>
      r.summary.includes(standingId) && r.kind==="uncertainty",
    )).toBe(false);
  });
});
