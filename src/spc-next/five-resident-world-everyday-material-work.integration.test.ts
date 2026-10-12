import { describe, expect, it } from "vitest";
import {
  FIVE_RESIDENT_OPENING_MATERIAL_WORK,
  createFiveResidentRegionComposition,
} from "./five-resident-region";
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
      kind:"free",position:{x:3050,y:1080},
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
    // Ida now performs her own real parcel delivery. Any information about
    // Janek's crate still has to come from Ida's actual personal sight.
    const ida = life.life("resident.ida")!;
    expect(ida.matterScope.matterIds()).toContain("matter.ida.crossroads-opening.delivery");
    const idaSight = ida.materialKnowledge?.observation("crate.workshop.01");
    if (idaSight?.currentlyVisible) {
      expect(idaSight.lastKnownPosition).toEqual({ x: 3050, y: 1080 });
    }
    expect(ida.resident.pendingCognitionReasons().filter(r =>
      r.kind === "direct_world_change"
        && r.summary.includes("crate.workshop.01"),
    )).toEqual([]);
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
    // A genuine later sighting of the stolen object is permissible, but its
    // hidden holder and position cannot be read magically from the World.
    const idaStolenSight = life.life("resident.ida")!.materialKnowledge?.observation("crate.workshop.01");
    if (idaStolenSight) {
      expect(idaStolenSight.lastKnownPosition).toEqual({ x: 1952, y: 720 });
    }
    expect(life.life("resident.janek")!.kernel.matter("matter.janek.workshop-opening.delivery")?.status)
      .not.toBe("resolved");
    expect(life.diagnostics().providerRequestCount).toBe(0);
  },30000);

  it("five residents complete distinct finite day-opening deliveries via the actual World, without any provider", () => {
    const life = new FiveResidentUnifiedLivingRuntime({
      providerDispatchMode: "manual", initialEverydayWork: true,
    });
    expect(FIVE_RESIDENT_OPENING_MATERIAL_WORK).toHaveLength(5);
    const distinctResidents = new Set(FIVE_RESIDENT_OPENING_MATERIAL_WORK.map(entry => entry.residentId));
    const distinctObjects = new Set(FIVE_RESIDENT_OPENING_MATERIAL_WORK.map(entry => entry.objectId));
    expect(distinctResidents.size).toBe(5);
    expect(distinctObjects.size).toBe(5);
    const seenHeld = new Set<string>();
    const completed = new Set<string>();

    for (let step = 0; step < 6_000 && completed.size < 5; step++) {
      const frame = life.advanceOneWorldTick();
      for (const entry of FIVE_RESIDENT_OPENING_MATERIAL_WORK) {
        const object = life.world.materialObject(entry.objectId);
        if (object?.location.kind === "held") {
          expect(object.location.actorId).toBe(entry.residentId);
          seenHeld.add(entry.residentId);
        }
        if (frame.execution[entry.residentId]?.status === "completed") {
          completed.add(entry.residentId);
        }
      }
    }

    expect(life.lifeRuntime.claimedResidentIds()).toHaveLength(5);
    expect([...seenHeld].sort()).toEqual([...distinctResidents].sort());
    expect([...completed].sort()).toEqual([...distinctResidents].sort());
    for (const entry of FIVE_RESIDENT_OPENING_MATERIAL_WORK) {
      expect(life.world.materialObject(entry.objectId)?.location).toEqual({
        kind: "free", position: entry.destination,
      });
      const matter = life.life(entry.residentId)!.kernel.matter(`matter.${entry.identityStem}.delivery`);
      expect(matter?.status).toBe("resolved");
      expect(matter?.lastOutcomeEvidenceId).toBeTruthy();
    }
    // A second material opportunity per person remains REAL and unassigned.
    // Knowledge is private first-hand sight acquired at genuine spawn, not an
    // invented global inventory or a second routine that silently starts.
    const secondChoices = {
      "resident.mira": "kindling.hearth.02",
      "resident.janek": "crate.workshop.02",
      "resident.ida": "satchel.crossroads.02",
      "resident.oren": "timber.forest.02",
      "resident.nela": "tablet.ruins.02",
    } as const;
    for (const [residentId, objectId] of Object.entries(secondChoices)) {
      expect(life.world.materialObject(objectId)?.location.kind).toBe("free");
      const privateSight = life.life(residentId as keyof typeof secondChoices)!
        .materialKnowledge?.observation(objectId);
      expect(privateSight).toMatchObject({ objectId });
      expect(privateSight?.observedAtTick).toBeLessThanOrEqual(life.world.tick);
      expect(life.life(residentId as keyof typeof secondChoices)?.matterScope.matterIds())
        .not.toContain(`matter.unassigned.${objectId}`);
    }
    expect(life.diagnostics().providerRequestCount).toBe(0);
  }, 45_000);

  it("empty baseline is unchanged unless the REAL playable World opts in to ordinary work", () => {
    const life=new FiveResidentUnifiedLivingRuntime({providerDispatchMode:"manual"});
    expect(life.life("resident.janek")!.matterScope.matterIds()).toEqual([]);
    expect(life.world.materialObject("crate.workshop.01")?.location.kind).toBe("free");
    expect(life.diagnostics().providerRequestCount).toBe(0);
  });
});
