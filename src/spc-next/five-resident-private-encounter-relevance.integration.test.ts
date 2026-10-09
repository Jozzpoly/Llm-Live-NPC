import { describe, expect, it } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";

const RESIDENT = "resident.janek";
const VISITOR = "player.private-contact-witness";
const PROMISE = "Jeśli znów się spotkamy, porozmawiamy o sprawie.";
const MATTER = "matter.janek.r6.private-contact.opening";
const RUN = "run.janek.r6.private-contact.opening";

function setup(withRealHistory: boolean) {
  const composition = createFiveResidentRegionComposition();
  const { world } = composition;
  world.addPlayer(VISITOR, { x: 2_030, y: 720 }, { maxSpeed: 100_000 });
  const runtime = new FiveResidentCausalLifeRuntime(composition);
  const life = runtime.life(RESIDENT);
  if (!life) throw new Error("Janek did not claim recovered life");

  // This actor becomes a PRIVATE visual acquaintance, not a World-global reason.
  runtime.advanceOneWorldTick();
  expect(composition.runtimes[RESIDENT].cognitionContext({
    residentId: RESIDENT, requestedAtTick: world.tick, reasons: [],
  }).knownActors).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: VISITOR, currentlyVisible: true }),
  ]));

  let standingId: string | null = null;
  if (withRealHistory) {
    const origin = life.kernel.recordEvidence({
      id: "evidence.janek.r6.private-contact.own-choice",
      tick: world.tick, kind: "life_context",
      summary: "Janek chooses to establish one factual future-facing social responsibility",
    });
    life.kernel.openMatter({
      id: MATTER,
      originEvidenceId: origin.id,
      semanticCourse: "address this known person and take responsibility for what was said",
      semanticIntent: {
        kind: "communicate_actor",
        goal: "speak truthfully with the visible person",
        targetActorId: VISITOR,
        text: PROMISE,
        standingSocialCommitment: { goal: "talk when we meet again" },
      },
    });
    life.matterScope.track(MATTER);
    life.kernel.bindRun({
      matterId: MATTER, taskId: "task.janek.r6.private-contact.opening", runId: RUN,
    });
    expect(life.arbitrator.request(RUN)).toEqual({ status: "acquired", runId: RUN });

    // Real resident execution, factual World speech and exact completed source
    // create standing private history. No synthetic standing matter is planted.
    for (let i=0;i<80 && standingId===null;i++){
      runtime.advanceOneWorldTick();
      const standing=life.currentLifeView().matters.find(
        m=>m.semanticIntent?.kind==="standing_social_commitment",
      );
      standingId=standing?.id ?? null;
    }
    expect(standingId).not.toBeNull();
    expect(world.diagnostics().recentOccurrences.some(o=>
      o.kind==="speech" && o.actorId===RESIDENT && o.text===PROMISE
      && o.addressedActorIds.includes(VISITOR),
    )).toBe(true);
  }

  // Move ONLY the participant under normal World physical motion. No direct
  // resident location or perception edit. Outside vision, no new reason.
  moveVisitor(runtime,{x:4_300,y:720});
  expect(world.residentDiagnostics(RESIDENT).recentPercepts.some(p=>
    p.phenomenon==="actor_sight_exit" && p.actorId===VISITOR,
  )).toBe(true);
  const before=composition.runtimes[RESIDENT].pendingCognitionReasons()
    .filter(reason=>reason.summary.includes("New private contact"));
  expect(before).toEqual([]);

  // Reenter visual range. The same external event differs ONLY by the
  // resident's own earlier factual speech + still-open standing history.
  moveVisitor(runtime,{x:2_030,y:720});
  const enter=world.residentDiagnostics(RESIDENT).recentPercepts.find(p=>
    p.phenomenon==="actor_sight_enter" && p.actorId===VISITOR && p.tick===world.tick,
  );
  expect(enter).toBeDefined();
  const matching=composition.runtimes[RESIDENT].pendingCognitionReasons()
    .filter(reason=>reason.evidenceIds.includes(enter!.id)
      && reason.kind==="uncertainty");
  return {runtime,life,matching,standingId,enter};
}
function moveVisitor(runtime:FiveResidentCausalLifeRuntime,target:{x:number,y:number}){
  const world=runtime.world;
  const current=world.publicSnapshot().actors.find(a=>a.id===VISITOR)?.position;
  if(!current)throw new Error("visitor missing");
  const dt=world.options.fixedDeltaSeconds;
  world.setActorMotionIntent(VISITOR,{
    x:(target.x-current.x)/dt,y:(target.y-current.y)/dt,
  });
  runtime.advanceOneWorldTick(); // World integrates the visitor's physical movement.
  world.setActorMotionIntent(VISITOR,{x:0,y:0});
  runtime.advanceOneWorldTick(); // Next World tick samples sight from that new position.
}
describe("five-resident recovered life — actor-relative ordinary encounter",()=>{
  it("only factual resident-owned history turns the same new private sight into semantic relevance",()=>{
    const history=setup(true);
    const control=setup(false);
    expect(control.matching).toEqual([]);
    expect(history.matching).toHaveLength(1);
    expect(history.matching[0]?.evidenceIds).toContain(history.standingId);
    expect(history.matching[0]?.evidenceIds).toContain(history.enter?.id);

    const before=history.matching[0]!.id;
    for(let i=0;i<30;i++)history.runtime.advanceOneWorldTick();
    expect(history.life.resident.pendingCognitionReasons()
      .filter(reason=>reason.id===before)).toHaveLength(1);
  });
  it("can turn the earned private encounter into a provider-decided, World-factual resident follow-up",()=>{
    const {runtime,life,standingId,matching,enter}=setup(true);
    expect(matching).toHaveLength(1);
    const cognition=new ResidentCausalCognitionLane(life);
    let request=cognition.takeReadyRequest();
    for(let i=0;i<120&&!request;i++){
      runtime.advanceOneWorldTick();
      request=cognition.takeReadyRequest();
    }
    expect(request).not.toBeNull();
    if(!request||!standingId||!enter)throw new Error("private encounter produced no valid cognition origin");

    const reason=request.batch.reasons.find(r=>r.id===matching[0]!.id);
    expect(reason).toMatchObject({
      kind:"uncertainty",
      evidenceIds: expect.arrayContaining([enter.id,standingId]),
    });
    if(!reason)throw new Error("encounter reason was not admitted to the same resident's cognition batch");

    expect(request.context.life.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id:standingId,
        semanticIntent: expect.objectContaining({
          kind:"standing_social_commitment",
          counterpartyActorId:VISITOR,
        }),
      }),
    ]));

    // Authored provider-shaped choice QUALIFIES MECHANICS ONLY. This is not a
    // real-model inference; real higher cognition may accept, defer or ignore.
    const followup="Wróciłeś. Pamiętam, że mieliśmy porozmawiać.";
    const admitted=cognition.settleCommitment(request,{
      version:1,
      commitmentDecision:{
        kind:"accept",
        reason:"my own earlier factual social responsibility makes this familiar visitor meaningful",
        intent:{
          kind:"communicate",goal:"follow up on my earlier standing responsibility",
          targetActorId:VISITOR,targetRegionId:null,targetPosition:null,text:followup,
        },
      },
      beliefs:[],concerns:[],reviewAfterSeconds:30,
    },reason.id);
    expect(admitted.status).toBe("applied");
    if(admitted.status!=="applied"||!admitted.commitment)throw new Error("semantic followup was not admitted");

    let spoken=false;
    for(let i=0;i<180&&!spoken;i++){
      runtime.advanceOneWorldTick();
      spoken=runtime.world.diagnostics().recentOccurrences.some(o=>
        o.kind==="speech" && o.actorId===RESIDENT && o.text===followup
          && o.addressedActorIds.includes(VISITOR),
      );
    }
    expect(spoken).toBe(true);
    expect(life.kernel.matter(admitted.commitment.matterId)).toMatchObject({
      status:"resolved",activeRunId:null,
    });
  });
  it("ending the exact commitment makes the same historical contact no longer demand semantic work",()=>{
    const {runtime,life,standingId,matching}=setup(true);
    expect(matching).toHaveLength(1);
    if(!standingId) throw new Error("standing history missing");
    life.originatedSocialCommitments.release({
      matterId:standingId,tick:runtime.world.tick,
      reason:"resident privately releases the exact promise after returning contact",
    });
    runtime.advanceOneWorldTick();
    expect(life.resident.pendingCognitionReasons().filter(
      reason=>reason.id===matching[0]!.id,
    )).toEqual([]);
  });
});
