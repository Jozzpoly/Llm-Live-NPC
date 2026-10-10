import { describe, expect, it } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";

const JAN = "resident.janek";
const PLAYER = "player.jozz";
const SOURCE = "matter.janek.authored-initial-timed-statement";
const RUN = "run.janek.authored-initial-timed-statement";
const SENTENCE = "Wrócę do tej sprawy po krótkim czasie.";

function specimen(enabled = true) {
  const composition = createFiveResidentRegionComposition({
    playerStart: { x: 1_750, y: 720 },
  });
  const host = new FiveResidentCausalLifeRuntime(composition, {
    temporalStandingReview: enabled,
  });
  const life = host.life(JAN);
  if (!life) throw new Error("Janek must own R6 private recovered life");
  return { world: composition.world, host, life };
}

function actuallyMakePromise(s: ReturnType<typeof specimen>, revisitAfterWorldTicks?: number) {
  const evidence = s.life.kernel.recordEvidence({
    id: "evidence.janek.test-authored-initial-promise",
    tick: s.world.tick,
    kind: "authored_initial_context",
    summary: "Initial permission to SAY the promise is authored, NOT autonomous",
  });
  s.life.kernel.openMatter({
    id: SOURCE,
    originEvidenceId: evidence.id,
    semanticCourse: "One already accepted initial spoken promise",
    semanticIntent: {
      kind: "communicate_actor", goal: "Say my previous acceptance out loud",
      targetActorId: PLAYER, text: SENTENCE,
      standingSocialCommitment: {
        goal: "Retain personal social responsibility to the actual hearer",
        ...(revisitAfterWorldTicks !== undefined ? { revisitAfterWorldTicks } : {}),
      },
    },
  });
  s.life.matterScope.track(SOURCE);
  s.life.kernel.bindRun({ matterId: SOURCE, taskId: "task.janek.initial-statement", runId: RUN });
  expect(s.life.arbitrator.request(RUN).status).toBe("acquired");
  for (let i=0;i<350;i++) {
    s.host.advanceOneWorldTick();
    const standing = s.life.currentLifeView().matters.find(m=>
      m.semanticIntent?.kind === "standing_social_commitment" && m.status === "active",
    );
    if (!standing) continue;
    const occurrence = s.world.diagnostics().recentOccurrences.find(e=>
      e.kind === "speech" && e.actorId === JAN && e.text === SENTENCE
        && e.addressedActorIds.includes(PLAYER),
    );
    expect(occurrence).toBeDefined();
    expect(standing.originEvidence?.kind).toBe("resident_originated_social_commitment");
    expect(s.life.kernel.matter(SOURCE)?.status).toBe("resolved");
    return standing;
  }
  throw new Error("actual World speech never produced a standing commitment");
}

function dueReasons(s: ReturnType<typeof specimen>, matterId: string) {
  return s.life.resident.pendingCognitionReasons().filter(r=>
    r.kind === "uncertainty" && r.summary.includes(matterId)
      && r.summary.includes("revisit moment"),
  );
}

describe("R6 explicit temporal standing meaning after factual, self-spoken World commitment", () => {
  it("matures ONE private review question at declared World tick, without new action/provider treadmill", () => {
    const s = specimen();
    const matter = actuallyMakePromise(s, 25);
    const intent = matter.semanticIntent;
    if (intent?.kind !== "standing_social_commitment") throw Error("wrong standing intent");
    const dueAt = intent.revisitAtWorldTick;
    expect(dueAt).toBe(matter.originEvidence!.tick + 25);
    expect(dueAt).toBeGreaterThan(s.world.tick);
    while (s.world.tick < dueAt! - 1) {
      const frame = s.host.advanceOneWorldTick();
      expect(frame.temporalStanding?.[JAN]).toBeUndefined();
    }
    expect(dueReasons(s, matter.id)).toHaveLength(0);
    const due = s.host.advanceOneWorldTick();
    expect(due.tick).toBe(dueAt);
    expect(due.temporalStanding?.[JAN]).toEqual([{
      status: "promoted", matterId: matter.id,
      reasonId: expect.any(String), declaredWorldTick: dueAt,
    }]);
    const reasons = dueReasons(s, matter.id);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]!.evidenceIds).toContain(matter.originEvidence!.id);
    expect(s.life.focus.focusedRun()).toBeNull();
    for (let i=0;i<240;i++) expect(s.host.advanceOneWorldTick().temporalStanding?.[JAN])
      .toBeUndefined();
    expect(dueReasons(s, matter.id)).toEqual(reasons);
    expect(s.life.currentLifeView().matters.filter(m=>
      m.status==="active" && m.semanticIntent?.kind==="standing_social_commitment",
    )).toHaveLength(1);
    console.info("SPC_TIMED_STANDING_REVISIT", JSON.stringify({
      honestFactualSpeech: true, initialPromiseDecision: "test_authored",
      standingDueWorldTick: dueAt, exactlyOneNewQuestion: true,
      newResidentChoice: false, automaticAction: false, upstreamCalls: 0,
    }));
  });

  it("does not treat an ordinary no-time promise as periodic thinking", () => {
    const s=specimen();
    const matter=actuallyMakePromise(s);
    expect(matter.semanticIntent?.kind).toBe("standing_social_commitment");
    for(let i=0;i<300;i++) {
      expect(s.host.advanceOneWorldTick().temporalStanding?.[JAN]).toBeUndefined();
    }
    expect(dueReasons(s,matter.id)).toEqual([]);
    expect(s.life.focus.focusedRun()).toBeNull();
  });

  it("release before due forbids a synthetic due reminder", () => {
    const s=specimen();
    const matter=actuallyMakePromise(s,30);
    s.life.originatedSocialCommitments.release({
      matterId:matter.id, tick:s.world.tick,
      reason:"Test-only external closure, not an autonomously achieved outcome",
    });
    for(let i=0;i<100;i++) {
      expect(s.host.advanceOneWorldTick().temporalStanding?.[JAN]).toBeUndefined();
    }
    expect(dueReasons(s,matter.id)).toEqual([]);
  });

  it("release after due invalidates the ONE already pending reason",()=>{
    const s=specimen();
    const matter=actuallyMakePromise(s,5);
    for(let i=0;i<9;i++) s.host.advanceOneWorldTick();
    const [reason] = dueReasons(s,matter.id);
    expect(reason).toBeDefined();
    s.life.originatedSocialCommitments.release({
      matterId:matter.id, tick:s.world.tick,
      reason:"Explicit test-only release of the earlier open promise",
    });
    s.host.advanceOneWorldTick();
    expect(s.life.resident.pendingCognitionReasons().some(x=>x.id===reason!.id)).toBe(false);
    for(let i=0;i<70;i++) expect(s.host.advanceOneWorldTick().temporalStanding?.[JAN])
      .toBeUndefined();
  });

  it("cannot inject a revisit after the original source communication was accepted",()=>{
    const s=specimen();
    const origin=s.life.kernel.recordEvidence({
      id:"evidence.janek.injection-control",tick:s.world.tick,
      kind:"authored_initial_context",summary:"No revisit was in the initial accepted statement",
    });
    s.life.kernel.openMatter({
      id:"matter.janek.injection-control",originEvidenceId:origin.id,
      semanticCourse:"A speech with no temporal declaration",
      semanticIntent:{
        kind:"communicate_actor",goal:"Say something",targetActorId:PLAYER,text:"Dobrze",
        standingSocialCommitment:{goal:"Remember the promise"},
      },
    });
    s.life.kernel.bindRun({
      matterId:"matter.janek.injection-control",
      taskId:"task.janek.injection-control",
      runId:"run.janek.injection-control",
    });
    expect(s.life.arbitrator.request("run.janek.injection-control").status).toBe("acquired");
    expect(()=>s.life.originatedSocialCommitments.prepareFromCommunicateMatter({
      sourceMatterId:"matter.janek.injection-control",counterpartyActorId:PLAYER,
      expectedSpeechText:"Dobrze",goal:"Remember the promise",commitment:"Dobrze",
      revisitAfterWorldTicks:10,
    })).toThrow();
  });
});
