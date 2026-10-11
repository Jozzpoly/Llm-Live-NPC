import { describe, expect, it } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";

describe("ordinary work in the ACTUAL five-resident playable World", () => {
  it("Janek keeps one authored existing workshop job through physical pickup, carrying and factual placement", () => {
    const life = new FiveResidentUnifiedLivingRuntime({
      providerDispatchMode: "manual", initialEverydayWork: true,
    });
    const initial = life.world.materialObject("crate.workshop.01");
    expect(initial?.location).toEqual({kind:"free", position:{x:1952,y:720}});
    const janek = life.life("resident.janek")!;
    const original = janek.kernel.matter("matter.janek.workshop-opening.delivery");
    expect(original?.status).toBe("active");
    expect(original?.originEvidenceId).toBe("evidence.janek.workshop-opening.authored");
    let carried = false, finished = false, cameBackToWorld = false;
    for (let i=0;i<1700;i++){
      const frame=life.advanceOneWorldTick();
      const object=life.world.materialObject("crate.workshop.01");
      if(object?.location.kind==="held"){
        expect(object.location.actorId).toBe("resident.janek");
        carried = true;
        expect(janek.kernel.matter(original!.id)?.status).toBe("active");
      }
      if(frame.execution["resident.janek"]?.status==="completed"){
        finished=true;
        cameBackToWorld = object?.location.kind==="free";
        break;
      }
    }
    expect(carried).toBe(true);
    expect(finished).toBe(true);
    expect(cameBackToWorld).toBe(true);
    expect(life.world.materialObject("crate.workshop.01")?.location).toEqual({
      kind:"free",position:{x:2980,y:1080},
    });
    const completed=janek.kernel.matter(original!.id);
    expect(completed?.status).toBe("resolved");
    expect(completed?.lastOutcomeEvidenceId).toBeTruthy();
    expect(janek.currentLifeView().matters.find(m => m.id === original!.id)?.lastOutcomeEvidence?.summary)
      .toContain("physically delivered");
    expect(life.diagnostics().providerRequestCount).toBe(0);
    const nextReasons = janek.resident.pendingCognitionReasons().filter(r =>
      r.kind === "activity_completed"
        && r.evidenceIds.includes(completed!.lastOutcomeEvidenceId!));
    expect(nextReasons).toHaveLength(1);
    expect(nextReasons[0]!.summary).toContain("physically delivered");
    // A quiet period does not invent a replacement task, repeat pressure
    // or silently call Luna; the open semantic opportunity is retained.
    for (let i=0; i<180; i++) life.advanceOneWorldTick();
    expect(janek.resident.pendingCognitionReasons().filter(r =>
      r.id === nextReasons[0]!.id)).toHaveLength(1);
    expect(janek.focus.focusedRun()).toBeNull();
    expect(life.diagnostics().providerRequestCount).toBe(0);
    expect(life.lifeRuntime.claimedResidentIds().length).toBe(5);
    expect(life.world.materialObjects().length).toBeGreaterThan(1);
    const after=life.world.materialObjects();
    expect(new Set(after.map(x=>x.id)).size).toBe(after.length);
  },30000);

  it("player can physically remove the necessary crate; no teleport, fake success, or retargeted spare is allowed", () => {
    const composition=createFiveResidentRegionComposition({
      playerStart:{x:1952,y:720},
    });
    const theft=composition.world.attemptMaterialAction("player.jozz",{
      kind:"pickup",objectId:"crate.workshop.01",
    });
    expect(theft.status).toBe("succeeded");
    const life=new FiveResidentUnifiedLivingRuntime({
      composition,providerDispatchMode:"manual",initialEverydayWork:true,
    });
    let completed=false;
    for(let i=0;i<1500;i++){
      const frame=life.advanceOneWorldTick();
      if(frame.execution["resident.janek"]?.status==="completed") completed=true;
    }
    expect(completed).toBe(false);
    expect(life.world.materialObject("crate.workshop.01")?.location).toEqual({
      kind:"held", actorId:"player.jozz",
    });
    expect(life.world.materialObject("crate.workshop.02")?.location.kind).toBe("free");
    expect(life.life("resident.janek")!.kernel.matter("matter.janek.workshop-opening.delivery")?.status)
      .not.toBe("resolved");
    expect(life.diagnostics().providerRequestCount).toBe(0);
  },30000);

  it("empty baseline is unchanged unless the REAL playable World opts in to ordinary work", () => {
    const life=new FiveResidentUnifiedLivingRuntime({providerDispatchMode:"manual"});
    expect(life.life("resident.janek")!.matterScope.matterIds()).toEqual([]);
    expect(life.world.materialObject("crate.workshop.01")?.location.kind).toBe("free");
    expect(life.diagnostics().providerRequestCount).toBe(0);
  });
});
