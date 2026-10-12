import { describe,expect,it } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";
function setup(){
 const composition=createFiveResidentRegionComposition({playerStart:{x:1970,y:805}});
 return {world:composition.world,life:new FiveResidentUnifiedLivingRuntime({
    composition,providerDispatchMode:"manual",initialEverydayWork:true})};
}
describe("one actual finite World worksite, no automatic NPC crafting",()=>{
 it("requires possession, locality and 180 factual ticks; never duplicates, records provenance",()=>{
  const {world,life}=setup();
  expect(world.beginMaterialWork("player.jozz","workshop.repair-kit"))
    .toEqual({status:"rejected",reason:"wrong_material"});
  expect(world.attemptMaterialAction("player.jozz",{kind:"pickup",objectId:"crate.workshop.02"}).status).toBe("succeeded");
  expect(world.beginMaterialWork("player.jozz","workshop.repair-kit"))
    .toEqual({status:"started",requiredTicks:180});
  for(let i=0;i<179;i++)life.advanceOneWorldTick();
  expect(world.materialObject("kit.workshop.01")).toBeNull();
  expect(world.materialObject("crate.workshop.02")?.location).toEqual({kind:"held",actorId:"player.jozz"});
  life.advanceOneWorldTick();
  expect(world.materialObject("crate.workshop.02")).toBeNull();
  expect(world.materialObject("kit.workshop.01")?.location)
    .toEqual({kind:"free",position:{x:1922,y:790}});
  expect(world.materialObject("kit.workshop.01")?.derivation).toEqual({
    kind:"worksite_transformation",sourceObjectId:"crate.workshop.02",
    siteId:"workshop.repair-kit",actorId:"player.jozz",tick:world.tick,
  });
  expect(world.diagnostics().recentWorkOutcomes.at(-1)).toMatchObject({
    status:"completed",reason:"worked",sourceObjectId:"crate.workshop.02",
    outputObjectId:"kit.workshop.01",sourceBefore:{id:"crate.workshop.02"},
    outputAfter:{id:"kit.workshop.01"},
  });
  expect(world.diagnostics().recentOccurrences.some(x=>x.subjectId==="kit.workshop.01"
      && x.summary.includes("physically made"))).toBe(true);
  expect(world.materialObjects().filter(x=>x.id==="kit.workshop.01")).toHaveLength(1);
  expect(life.diagnostics().providerRequestCount).toBe(0);
 },25000);
 it("walking away interrupts without eating source or fabricating output, resident direct bypass denied",()=>{
  const {world,life}=setup();
  world.attemptMaterialAction("player.jozz",{kind:"pickup",objectId:"crate.workshop.02"});
  expect(world.beginMaterialWork("player.jozz","workshop.repair-kit").status).toBe("started");
  for(let i=0;i<35;i++)life.advanceOneWorldTick();
  world.setActorMotionIntent("player.jozz",{x:90,y:0});life.advanceOneWorldTick();
  expect(world.worksiteProgress("player.jozz")).toBeNull();
  expect(world.diagnostics().recentWorkOutcomes.at(-1)).toMatchObject({
    status:"interrupted",reason:"moved",outputObjectId:null,
  });
  expect(world.materialObject("crate.workshop.02")?.location).toEqual({kind:"held",actorId:"player.jozz"});
  expect(world.materialObject("kit.workshop.01")).toBeNull();
  expect(world.beginMaterialWork("resident.janek","workshop.repair-kit"))
    .toEqual({status:"rejected",reason:"resident_authority_required"});
 },25000);
 it("cannot invoke an invented workstation or start from far away",()=>{
  const {world}=setup();
  expect(world.beginMaterialWork("player.jozz","invented")).toEqual({status:"rejected",reason:"unknown_site"});
  const remote=createFiveResidentRegionComposition().world;
  expect(remote.beginMaterialWork("player.jozz","workshop.repair-kit")).toEqual({
    status:"rejected",reason:"too_far",
  });
 });
});
