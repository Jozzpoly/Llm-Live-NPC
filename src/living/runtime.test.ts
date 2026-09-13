import { describe, expect, it } from "vitest";
import { LivingRuntime } from "./runtime";
import { World } from "../world/world";
import { createP1Specimen } from "../world/specimen";
import type { ResidentModelInput, ResidentReply } from "./types";
import { handleResidentConversation } from "../../worker/living-resident";

function until(runtime: LivingRuntime, done: () => boolean) {
  for (let i = 0; i < 1800 && !done(); i++) runtime.step({moveX:0,moveY:0},[]);
  expect(done(), JSON.stringify(runtime.state())).toBe(true);
}

describe("living resident integrated experience", () => {
  it("projects expanded private experiences through the bounded historical transport without breaking its wire format", async () => {
    const world = new World(createP1Specimen());
    const runtime = new LivingRuntime(world, async input => {
      expect(input.experiences).toHaveLength(12);
      const reply: ResidentReply = { reply: "Pamiętam rozmowę.", intent: { kind: "continue" } };
      const result = await handleResidentConversation(new Request("https://hearth.test/api/resident/converse", {
        method: "POST", body: JSON.stringify(input)
      }), { AI_PROBE_LIMITER: { limit: async () => ({ success: true }) }, AI: {
        run: async () => ({ tool_calls: [{ function: { name: "resident_reply", arguments: JSON.stringify(reply) } }] })
      } });
      expect(result.status).toBe(200);
      return reply;
    });
    for (let i = 0; i < 20; i++) world.speak("player.jozz", "Kolejna odebrana wypowiedź " + i);
    await runtime.send("Co słyszałaś?");
    expect(runtime.state().error).toBeNull();
    runtime.dispose();
  });

  it("discovers the hammer in the workshop, walks around walls, brings it back and leaves it within the player's reach", async () => {
    const world = new World(createP1Specimen());
    const inputs: ResidentModelInput[] = [];
    const runtime = new LivingRuntime(world, async input => {
      inputs.push(input);
      return input.latestUtterance === "Odwiedź warsztat" ? {reply:"Zajrzę do warsztatu.",intent:{kind:"go",targetId:"workshop"}} :
        {reply:"Przyniosę młotek.",intent:{kind:"fetch",targetId:"item.hammer"}};
    });
    expect(runtime.state().knownEntities.some(e=>e.id==="item.hammer")).toBe(false);
    await runtime.send("Odwiedź warsztat");
    until(runtime,()=>runtime.state().lastOutcome?.includes("dotarła do: warsztat")===true);
    await runtime.send("Przynieś mi młotek");
    expect(inputs[1].knownEntities.some(e=>e.id==="item.hammer")).toBe(true);
    until(runtime,()=>runtime.state().lastOutcome?.includes("dostarczyła")===true);
    expect(world.attemptAction({action:"interact",actorId:"player.jozz",targetId:"item.hammer"})).toMatchObject({status:"succeeded",code:"picked_up_item"});
    expect(runtime.state().activity).toContain("odpoczywam");
  });

  it("keeps an ongoing journey during smalltalk and discards a response superseded by a newer request", async () => {
    const world = new World(createP1Specimen());
    let release: (reply:ResidentReply)=>void = () => {};
    const runtime = new LivingRuntime(world, async input => {
      if(input.latestUtterance==="Idź do warsztatu") return {reply:"Idę.",intent:{kind:"go",targetId:"workshop"}};
      if(input.latestUtterance==="Co lubisz?") return {reply:"Spokojne spacery.",intent:{kind:"continue"}};
      if(input.latestUtterance==="A może domek?") return new Promise(resolve=>release=resolve);
      return {reply:"Zaczekam.",intent:{kind:"wait"}};
    });
    await runtime.send("Idź do warsztatu");
    const journey = runtime.state().activity;
    await runtime.send("Co lubisz?");
    expect(runtime.state().activity).toBe(journey);
    const old = runtime.send("A może domek?");
    const before = world.tick;
    runtime.step({moveX:1,moveY:0},[]);
    expect(world.tick).toBe(before+1);
    const newer = runtime.send("Poczekaj");
    release({reply:"Stara odpowiedź.",intent:{kind:"go",targetId:"cottage"}});
    await Promise.all([old,newer]);
    expect(runtime.state().activity).toContain("Czekam");
    expect(runtime.state().conversation.some(m=>m.text==="Stara odpowiedź.")).toBe(false);
  });

  it("keeps a provider failure visible, supports retry, and makes explicit stop invalidate a late action", async () => {
    const world = new World(createP1Specimen());
    let calls=0;
    let release: (reply:ResidentReply)=>void = () => {};
    const runtime=new LivingRuntime(world,async()=>{
      if(++calls===1) throw new Error("Połączenie przerwane");
      if(calls===2) return {reply:"Jestem tutaj.",intent:{kind:"wait"}};
      return new Promise(resolve=>release=resolve);
    });
    await runtime.send("Cześć");
    expect(runtime.state().error).toBe("Połączenie przerwane");
    await runtime.retry();
    expect(runtime.state().error).toBeNull();
    const pending=runtime.send("Idź do warsztatu");
    runtime.stop();
    release({reply:"Już idę.",intent:{kind:"go",targetId:"workshop"}});
    await pending;
    expect(runtime.state().activity).toContain("Stoję");
    expect(runtime.state().conversation.some(m=>m.text==="Już idę.")).toBe(false);
  });
});
