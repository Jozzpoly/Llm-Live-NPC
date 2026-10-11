import { describe, expect, it } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";

describe("ordinary five-person SPC player contact, without model roundtrips", () => {
  it("Mira can locally acknowledge an actual player address while idle; semantic content remains open", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 980, y: 750 },
    });
    const living = new FiveResidentUnifiedLivingRuntime({
      composition, providerDispatchMode: "manual",
    });
    for (let i=0; living.lifeRuntime.claimedResidentIds().length<5 && i<1700; i++) {
      living.advanceOneWorldTick();
    }
    const mira = living.life("resident.mira")!;
    expect(mira).not.toBeNull();
    expect(mira.focus.focusedRun()).toBeNull();
    const utterance=living.world.speak("player.jozz","Hej Mira!",420,["resident.mira"]);
    living.advanceOneWorldTick();
    expect(living.world.residentDiagnostics("resident.mira").recentPercepts.some(p =>
      p.occurrenceId===utterance.id && p.addressed && p.phenomenon==="speech"
    )).toBe(true);
    const contact=living.lifeRuntime.interruption("resident.mira")?.current();
    expect(contact).toMatchObject({
      status:"active", mainMatterId:null, mainRunId:null, responseOccurrenceId:null,
    });
    const response=living.advanceOneWorldTick();
    expect(response.interruptions["resident.mira"]?.status).toBe("responded");
    expect(living.world.diagnostics().recentOccurrences.some(o =>
      o.kind==="speech" && o.actorId==="resident.mira" && o.text==="Tak?"
        && o.addressedActorIds.includes("player.jozz")
    )).toBe(true);
    for(let i=0;i<90;i++)living.advanceOneWorldTick();
    expect(living.lifeRuntime.interruption("resident.mira")?.current()).toBeNull();
    expect(mira.focus.focusedRun()).toBeNull();
    expect(mira.kernel.matter(contact!.interruptMatterId)?.status).toBe("resolved");
    // "Tak?" is not agreement to the content and does not consume the
    // separate genuine heard_speech reason meant for higher cognition.
    expect(mira.resident.pendingCognitionReasons().some(x=>x.kind==="heard_speech")).toBe(true);
    expect(living.world.diagnostics().recentOccurrences.filter(o =>
      o.kind==="speech" && o.actorId==="resident.mira" && o.text==="Tak?"
    )).toHaveLength(1);
    expect(living.diagnostics().providerRequestCount).toBe(0);
  },30000);

  it("Janek can acknowledge the player WHILE CARRYING the exact crate, then resume and actually deliver it", () => {
    const composition=createFiveResidentRegionComposition({
      playerStart:{x:1935,y:755},
    });
    const living=new FiveResidentUnifiedLivingRuntime({
      composition,providerDispatchMode:"manual",initialEverydayWork:true,
    });
    const janek=living.life("resident.janek")!;
    let holding=false;
    for(let i=0;i<180;i++){
      living.advanceOneWorldTick();
      if(living.world.materialObject("crate.workshop.01")?.location.kind==="held"){
        holding=true;break;
      }
    }
    expect(holding).toBe(true);
    const matterId="matter.janek.workshop-opening.delivery";
    const runId="run.janek.workshop-opening.delivery";
    const beforeBinding=janek.kernel.runBinding(runId);
    expect(janek.focus.focusedRun()).toBe(runId);
    expect(beforeBinding).not.toBeNull();
    const speech=living.world.speak("player.jozz","Hej, Janek",420,["resident.janek"]);
    living.advanceOneWorldTick();
    const interrupt=living.lifeRuntime.interruption("resident.janek")?.current();
    expect(interrupt).toMatchObject({status:"active",mainMatterId:matterId,mainRunId:runId});
    expect(janek.kernel.matter(matterId)?.status).toBe("suspended");
    expect(janek.kernel.runBinding(runId)).toEqual(beforeBinding);
    const response=living.advanceOneWorldTick();
    expect(response.interruptions["resident.janek"]?.status).toBe("responded");
    expect(living.world.diagnostics().recentOccurrences.some(o=>
      o.kind==="speech" && o.actorId==="resident.janek" && o.text==="Tak?"
        && o.addressedActorIds.includes("player.jozz"))).toBe(true);
    let resumed=false, completed=false;
    for(let i=0;i<1700;i++){
      const frame=living.advanceOneWorldTick();
      if(frame.interruptions["resident.janek"]?.status==="resumed") {
        resumed=true;
        expect(janek.kernel.runBinding(runId)).toEqual(beforeBinding);
        expect(janek.kernel.matter(matterId)?.status).toBe("active");
      }
      if(frame.execution["resident.janek"]?.status==="completed") {completed=true;break;}
    }
    expect(resumed).toBe(true);
    expect(completed).toBe(true);
    expect(living.world.materialObject("crate.workshop.01")?.location).toEqual({
      kind:"free",position:{x:2980,y:1080}
    });
    expect(janek.kernel.matter(matterId)?.status).toBe("resolved");
    expect(living.diagnostics().providerRequestCount).toBe(0);
    expect(speech.kind).toBe("speech");
  },30000);
});
